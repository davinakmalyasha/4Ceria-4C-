<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Technical design review: submit, approve, revise
|--------------------------------------------------------------------------
|
| - submit-design admits the phase's own specialist (or the lead
|   architect / owner) and moves their documents to under_review;
| - approve-design is the owner's or the assigned PM's decision ONLY — it
|   verifies the documents, approves the phase milestones, unlocks their
|   payment stages and mirrors milestone files into the vault;
| - revise-design marks the documents revision_requested with the note
|   and clears the phase's approval stamp.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function drOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "drown_$tag" . uniqid(),
        'email' => "drown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function drStructural(string $tag): User
{
    $user = User::create([
        'name' => "Struct $tag", 'username' => "drs_$tag" . uniqid(),
        'email' => "drs_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $user->id, 'nama' => "Struct $tag"]);
    return $user;
}

it('submits, approves and unlocks the linked payment stage', function () {
    $owner = drOwner('ok');
    $struct = drStructural('ok');
    $profile = StructuralEngineer::where('user_id', $struct->id)->sole();

    $project = Project::create([
        'title' => 'Design Review', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'structural_id' => $profile->id,
    ]);

    $doc = ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $struct->id,
        'file_name' => 'calc.pdf', 'file_path' => 'project_documents/calc.pdf',
        'category' => 'structural_calc', 'status' => 'uploaded', 'version' => 1, 'file_type' => 'pdf',
    ]);
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'structural_id' => $profile->id,
        'title' => 'Struct Progress', 'type' => 'structural',
        'phase_context' => 'structural', 'approval_status' => 'pending',
    ]);
    $termin = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'structural', 'recipient_id' => $struct->id,
        'label' => 'Struct DP', 'percentage' => 50, 'amount' => 10_000_000,
        'status' => 'locked', 'milestone_id' => $milestone->id,
    ]);

    $this->actingAs($struct)
        ->postJson("/api/projects/{$project->id}/documents/submit-design", ['role_type' => 'structural'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Submitted successfully');

    expect($doc->fresh()->status)->toBe('under_review');

    // The architect cannot approve — only the owner or PM may.
    $architect = User::create([
        'name' => 'Arch', 'username' => 'dra' . uniqid(),
        'email' => 'dra' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $architect->id, 'nama' => 'Arch Co']);
    $this->actingAs($architect)
        ->postJson("/api/projects/{$project->id}/documents/approve-design", ['role_type' => 'structural'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/documents/approve-design", ['role_type' => 'structural'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Approved successfully');

    expect($doc->fresh()->status)->toBe('verified');
    expect($milestone->fresh()->approval_status)->toBe('approved');
    expect($milestone->fresh()->is_completed)->toBeTrue();
    expect($termin->fresh()->status)->toBe('pending');
    expect($project->fresh()->structural_approved_at)->not->toBeNull();

    $actions = \App\Models\ProjectActivityLog::where('project_id', $project->id)->pluck('action')->all();
    expect($actions)->toContain('design_approved');
    expect($actions)->toContain('payment_triggered');
    expect($actions)->toContain('milestone_approved');
});

it('requests a revision with the note and clears the stamp', function () {
    $owner = drOwner('rev');
    $struct = drStructural('rev');
    $profile = StructuralEngineer::where('user_id', $struct->id)->sole();
    $project = Project::create([
        'title' => 'Revise', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'structural_id' => $profile->id, 'structural_approved_at' => now(),
    ]);
    $doc = ProjectDocument::create([
        'project_id' => $project->id, 'uploader_id' => $struct->id,
        'file_name' => 'calc.pdf', 'file_path' => 'project_documents/calc.pdf',
        'category' => 'structural_calc', 'status' => 'under_review', 'version' => 1, 'file_type' => 'pdf',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/documents/revise-design", ['role_type' => 'structural'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['note']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/documents/revise-design", ['role_type' => 'structural', 'note' => 'fix loads'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Revision requested successfully');

    expect($doc->fresh()->status)->toBe('revision_requested');
    expect($doc->fresh()->review_note)->toBe('fix loads');
    expect($project->fresh()->structural_approved_at)->toBeNull();
});
