<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Remaining seals and phase authorization
|--------------------------------------------------------------------------
|
| seal-construction / seal-interior / seal-legal are each the hired
| professional's handover behind Hire::matches plus a phase-completeness
| gate; authorize-phase is the owner/PM boolean switch behind its own
| validation. All four answer the full resource.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function rsOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "rsown_$tag" . uniqid(),
        'email' => "rsown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function rsContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "rsk_$tag" . uniqid(),
        'email' => "rsk_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);
    return $user;
}

function rsNotary(string $tag): User
{
    $user = User::create([
        'name' => "Not $tag", 'username' => "rsn_$tag" . uniqid(),
        'email' => "rsn_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);
    NotarisProfile::create(['user_id' => $user->id, 'nama' => "Not $tag"]);
    return $user;
}

function rsProject(User $owner, string $tag, array $overrides = []): Project
{
    return Project::create(array_merge([
        'title' => "Seals $tag", 'user_id' => $owner->id,
        'budget' => 300_000_000, 'status' => 'in_progress', 'target_role' => 'both',
    ], $overrides));
}

it('gates the contractor seal on the hired contractor and completed milestones', function () {
    $owner = rsOwner('kon');
    $kon = rsContractor('kon');
    $other = rsContractor('out');
    $project = rsProject($owner, 'kon', ['selected_kontraktor_id' => $kon->kontraktor->id]);

    $this->actingAs($other)
        ->postJson("/api/projects/{$project->id}/seal-construction")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the hired contractor can seal construction.');

    ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Frame', 'type' => 'construction',
        'phase_context' => 'construction', 'is_completed' => false, 'approval_status' => 'pending',
    ]);

    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/seal-construction")
        ->assertStatus(422)
        ->assertJsonPath('message', 'All construction milestones must be completed before sealing.');

    ProjectMilestone::where('project_id', $project->id)->update(['is_completed' => true, 'approval_status' => 'approved']);

    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/seal-construction")
        ->assertStatus(200);

    expect($project->fresh()->construction_handover_submitted_at)->not->toBeNull();
});

it('gates the legal seal on the hired notary', function () {
    $owner = rsOwner('leg');
    $notary = rsNotary('leg');
    $arsitek = User::create([
        'name' => 'Arch', 'username' => 'rsa' . uniqid(),
        'email' => 'rsa' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $arsitek->id, 'nama' => 'Arch Co']);

    $project = rsProject($owner, 'leg', ['selected_notaris_id' => $notary->notaris_profile->id]);

    $this->actingAs($arsitek)
        ->postJson("/api/projects/{$project->id}/seal-legal")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized. Only the hired notary can seal the legal phase.');

    ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'AJB', 'type' => 'legal',
        'phase_context' => 'legal', 'is_completed' => false, 'approval_status' => 'drafting',
    ]);

    $this->actingAs($notary)
        ->postJson("/api/projects/{$project->id}/seal-legal")
        ->assertStatus(422)
        ->assertJsonPath('message', 'All legal milestones must be completed (uploaded) and not pending revisions before submitting for review.');

    ProjectMilestone::where('project_id', $project->id)->update(['approval_status' => 'uploaded']);

    $this->actingAs($notary)
        ->postJson("/api/projects/{$project->id}/seal-legal")
        ->assertStatus(200);
});

it('authorizes a phase for the owner behind its validation', function () {
    $owner = rsOwner('auth');
    $project = rsProject($owner, 'auth');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/authorize-phase", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['phase', 'authorize']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/authorize-phase", ['phase' => 'legal', 'authorize' => true])
        ->assertStatus(422)
        ->assertJsonPath('errors.phase', ['The selected phase is invalid.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/authorize-phase", ['phase' => 'design', 'authorize' => 'maybe'])
        ->assertStatus(422)
        ->assertJsonPath('errors.authorize', ['The authorize field must be true or false.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/authorize-phase", ['phase' => 'design', 'authorize' => true])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Phase authorization updated successfully.');

    expect($project->fresh()->design_authorized_at)->not->toBeNull();

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/authorize-phase", ['phase' => 'design', 'authorize' => false])
        ->assertStatus(200);

    expect($project->fresh()->design_authorized_at)->toBeNull();
});
