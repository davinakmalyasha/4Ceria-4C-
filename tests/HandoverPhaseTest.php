<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\ProjectManager;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Phase handover: PM approval and revision requests
|--------------------------------------------------------------------------
|
| - approve runs verifyPhase: construction/interior/legal stamp their three
|   completion columns, design ALSO auto-verifies the hired roles'
|   documents, approves their milestones and unlocks the linked stages;
|   every phase appends to completed_phases, unblocks the role's first
|   locked stage and notifies the professional;
| - reject accepts design|build|interior|legal — `build` writes the
|   CONSTRUCTION columns (the old code raised MassAssignmentException on
|   build_handover_*) — clears the handover stamp and stores the note;
| - the answer is loadFullProject's shape: 135 keys, bids with
|   `bidder: null`, no review keys.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function hpOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "hpown_$tag" . uniqid(),
        'email' => "hpown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function hpPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "hppm_$tag" . uniqid(),
        'email' => "hppm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag", 'no_telp' => '081200000001']);

    return $user;
}

function hpArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "hpa_$tag" . uniqid(),
        'email' => "hpa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function hpStruct(string $tag): User
{
    $user = User::create([
        'name' => "Struct $tag", 'username' => "hps_$tag" . uniqid(),
        'email' => "hps_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $user->id, 'nama' => "Struct $tag"]);

    return $user;
}

function hpProject(User $owner, User $pm, User $architect, string $tag, array $overrides = []): Project
{
    return Project::create(array_merge([
        'title' => "Handover phase $tag", 'user_id' => $owner->id,
        'budget' => 300_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_arsitek_id' => $architect->arsitek->id,
        'pm_id' => $pm->project_manager->id,
        'needed_phases' => [], 'completed_phases' => [],
    ], $overrides));
}

it('approves construction and appends the phase', function () {
    $owner = hpOwner('con');
    $pm = hpPM('con');
    $architect = hpArchitect('con');
    $project = hpProject($owner, $pm, $architect, 'con');

    $response = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/handover/approve", ['phase' => 'construction'])
        ->assertStatus(200);

    // loadFullProject shape: 135 keys, no review keys.
    expect(array_keys($response->json('data')))->toHaveCount(135);
    expect($response->json('data'))->not->toHaveKey('review_arsitek');
    expect($response->json('data.bids_arsitek.0.bidder'))->toBeNull();
    expect($response->json('data.documents'))->toBe([]);

    $fresh = $project->fresh();
    expect($fresh->completed_phases)->toBe(['construction']);
    expect($fresh->construction_completed_at)->not->toBeNull();
    expect($fresh->construction_locked_at)->not->toBeNull();
    expect($fresh->owner_build_approved_at)->not->toBeNull();

    $actions = \App\Models\ProjectActivityLog::where('project_id', $project->id)->pluck('action')->all();
    expect($actions)->toContain('construction_verified');
});

it('auto-verifies the design cascade on approval', function () {
    $owner = hpOwner('des');
    $pm = hpPM('des');
    $architect = hpArchitect('des');
    $struct = hpStruct('des');
    $structProfile = StructuralEngineer::where('user_id', $struct->id)->sole();

    $project = hpProject($owner, $pm, $architect, 'des', ['structural_id' => $structProfile->id]);

    ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $architect->id,
        'file_name' => 'bp.pdf', 'file_path' => 'project_documents/bp.pdf',
        'category' => 'blueprint', 'status' => 'uploaded', 'version' => 1, 'file_type' => 'pdf',
    ]);
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'arsitek_id' => $architect->arsitek->id,
        'title' => 'Design step', 'type' => 'schematic',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek', 'recipient_id' => $architect->id,
        'label' => 'Design DP', 'percentage' => 10, 'amount' => 10_000_000,
        'status' => 'locked', 'milestone_id' => $milestone->id,
    ]);

    // A second, unlinked stage is what triggerPaymentForPhase unblocks.
    $extra = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek', 'recipient_id' => $architect->id,
        'label' => 'Extra arsitek', 'percentage' => 0, 'amount' => 0, 'status' => 'locked',
    ]);

    $response = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/handover/approve", ['phase' => 'design'])
        ->assertStatus(200);

    expect($response->json('data.documents.0.status'))->toBe('verified');
    expect($response->json('data.documents.0.reviewed_at'))->not->toBeNull();

    expect($milestone->fresh()->approval_status)->toBe('approved');
    expect($milestone->fresh()->is_completed)->toBeTrue();
    expect($milestone->fresh()->pm_verified_at)->not->toBeNull();
    expect($termin->fresh()->status)->toBe('pending');
    expect($extra->fresh()->status)->toBe('pending');

    $fresh = $project->fresh();
    expect($fresh->completed_phases)->toBe(['design']);
    expect($fresh->design_completed_at)->not->toBeNull();
    expect($fresh->structural_approved_at)->not->toBeNull();
    expect($fresh->owner_design_approved_at)->not->toBeNull();

    $actions = \App\Models\ProjectActivityLog::where('project_id', $project->id)->pluck('action')->all();
    expect($actions)->toContain('design_verified');
    expect($actions)->toContain('payment_triggered');
    expect($actions)->toContain('payment_unblocked');
});

it('rejects a phase, mapping build onto the construction columns', function () {
    $owner = hpOwner('rej');
    $pm = hpPM('rej');
    $architect = hpArchitect('rej');
    $project = hpProject($owner, $pm, $architect, 'rej', [
        'construction_handover_submitted_at' => now(),
    ]);

    $response = $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/handover/reject", [
            'phase' => 'build', 'notes' => 'fix the edge',
        ])
        ->assertStatus(200);

    expect(array_keys($response->json('data')))->toHaveCount(135);
    expect($response->json('data.construction_handover_notes'))->toBe('fix the edge');
    expect($response->json('data.construction_handover_submitted_at'))->toBeNull();

    $log = \App\Models\ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('build_handover_revision');

    // Guards.
    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/handover/approve", ['phase' => 'design'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the assigned PM can approve handovers.');

    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/handover/reject", ['phase' => 'design', 'notes' => 'x'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/handover/approve", ['phase' => 'build'])
        ->assertStatus(422)
        ->assertJsonPath('errors.phase', ['The selected phase is invalid.']);

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/handover/reject", ['phase' => 'design'])
        ->assertStatus(422)
        ->assertJsonPath('errors.notes', ['The notes field is required.']);
});
