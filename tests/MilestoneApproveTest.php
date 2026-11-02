<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectActivityLog;
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
| Milestone approve: the two-step review and the money-unlocking final
|--------------------------------------------------------------------------
|
| - the lead architect/contractor holding a structural/MEP id reviews
|   (pending → reviewed) and owns the owner notification; a lead pro can
|   never FINALIZE approval;
| - the owner or the assigned PM gives final approval: the row completes,
|   every linked locked/pending stage becomes pending with one
|   `payment_triggered` line each, the gallery mirrors into the document
|   vault as verified rows, `milestone_approved` is logged and the
|   responsible professional is told;
| - the answer carries the six profile trees, `content.gallery` resolved
|   to absolute URLs, and `project` ONLY when a stage was actually
|   unlocked (loadMissing is inside the loop);
| - the binding is checked first (plain `Not found.`).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function maOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "maown_$tag" . uniqid(),
        'email' => "maown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function maArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "maa_$tag" . uniqid(),
        'email' => "maa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function maPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "mapm_$tag" . uniqid(),
        'email' => "mapm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag"]);

    return $user;
}

function maStructural(string $tag): User
{
    $user = User::create([
        'name' => "Struct $tag", 'username' => "mas_$tag" . uniqid(),
        'email' => "mas_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $user->id, 'nama' => "Struct $tag"]);

    return $user;
}

it('reviews as the lead architect and never finalizes', function () {
    $owner = maOwner('rev');
    $architect = maArchitect('rev');
    $struct = maStructural('rev');
    $structProfile = StructuralEngineer::where('user_id', $struct->id)->sole();

    $project = Project::create([
        'title' => 'Approve review', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_arsitek_id' => $architect->arsitek->id,
    ]);
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'structural_id' => $structProfile->id,
        'title' => 'Struct step', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);

    $response = $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/milestones/{$milestone->id}/approve")
        ->assertStatus(200);

    expect($milestone->fresh()->approval_status)->toBe('reviewed');
    expect($milestone->fresh()->lead_pro_verified_at)->not->toBeNull();
    expect($milestone->fresh()->is_completed)->toBeFalse();

    // No stage was unlocked, so `project` is NOT loaded.
    expect($response->json('data'))->not->toHaveKey('project');
    expect($response->json('data.structural.id'))->toBe($structProfile->id);
    expect($response->json('data.structural.user.id'))->toBe($struct->id);

    expect(ProjectActivityLog::where('project_id', $project->id)->where('action', 'milestone_reviewed')->count())->toBe(1);
    expect(\App\Models\Notification::where('user_id', $owner->id)->where('type', 'milestone_updated')->count())->toBe(1);

    // The lead pro cannot finalize.
    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/milestones/{$milestone->id}/approve")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the Project Manager or Owner can give final approval.');

    expect($milestone->fresh()->approval_status)->toBe('reviewed');
});

it('finalizes as the owner, unlocking the stage and mirroring the gallery', function () {
    $owner = maOwner('fin');
    $architect = maArchitect('fin');
    $struct = maStructural('fin');
    $structProfile = StructuralEngineer::where('user_id', $struct->id)->sole();

    $project = Project::create([
        'title' => 'Approve final', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_arsitek_id' => $architect->arsitek->id,
    ]);
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'structural_id' => $structProfile->id,
        'title' => 'Tree step', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'pending',
        'content' => [
            'gallery' => ['project_milestones/g1.pdf'],
            'file_names' => ['project_milestones/g1.pdf' => 'Custom Name'],
        ],
    ]);
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'structural',
        'recipient_id' => $struct->id, 'label' => 'Tree DP',
        'percentage' => 50, 'amount' => 10_000_000,
        'status' => 'locked', 'milestone_id' => $milestone->id,
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones/{$milestone->id}/approve")
        ->assertStatus(200);

    $fresh = $milestone->fresh();
    expect($fresh->approval_status)->toBe('approved');
    expect($fresh->is_completed)->toBeTrue();
    // The owner is not the PM, so pm_verified_at stays null.
    expect($fresh->pm_verified_at)->toBeNull();

    expect($termin->fresh()->status)->toBe('pending');

    // A stage was unlocked, so the answer carries the raw project model.
    expect($response->json('data'))->toHaveKey('project');
    expect($response->json('data.project.budget'))->toBe('100000000.00');
    expect($response->json('data.content.gallery.0'))->toContain('/storage/project_milestones/g1.pdf');

    $document = ProjectDocument::where('project_id', $project->id)->sole();
    expect($document->file_name)->toBe('Custom Name');
    expect($document->category)->toBe('blueprint');
    expect($document->status)->toBe('verified');
    expect($document->version_label)->toBe('Tree step');
    expect($document->target_role)->toBe('structural');
    expect($document->uploader_id)->toBe($owner->id);

    $actions = ProjectActivityLog::where('project_id', $project->id)->pluck('action')->all();
    expect($actions)->toContain('payment_triggered');
    expect($actions)->toContain('milestone_approved');

    expect(\App\Models\Notification::where('user_id', $struct->id)->where('type', 'milestone_approved')->count())->toBe(1);
});

it('finalizes as the assigned PM and stamps pm_verified_at', function () {
    $owner = maOwner('pm');
    $pm = maPM('pm');
    $project = Project::create([
        'title' => 'Approve pm', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'pm_id' => $pm->project_manager->id,
    ]);
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'PM step', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/milestones/{$milestone->id}/approve")
        ->assertStatus(200);

    expect($milestone->fresh()->pm_verified_at)->not->toBeNull();
    expect($milestone->fresh()->approval_status)->toBe('approved');
});

it('gates non-modifiers and binds the milestone to its project', function () {
    $owner = maOwner('gate');
    $kon = User::create([
        'name' => 'Kon', 'username' => 'mak' . uniqid(),
        'email' => 'mak' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $kon->id, 'nama' => 'Build']);

    $project = Project::create([
        'title' => 'Approve gate', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
    ]);
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Guarded', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);

    // Not hired, not the owner, not the PM, no structural/MEP id on the row.
    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/milestones/{$milestone->id}/approve")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    // Cross-project milestone: the plain 404, not a model 404.
    $other = Project::create([
        'title' => 'Other', 'user_id' => $owner->id,
        'budget' => 1_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
    $foreign = ProjectMilestone::create([
        'project_id' => $other->id, 'title' => 'Foreign', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones/{$foreign->id}/approve")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');

    expect($foreign->fresh()->approval_status)->toBe('pending');
});
