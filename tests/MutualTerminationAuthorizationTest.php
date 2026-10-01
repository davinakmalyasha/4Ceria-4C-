<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectSubProfessional;
use App\Models\ProjectTermination;
use App\Models\ProjectManager;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Cancelling a project is the owner's decision, not a participant's
|--------------------------------------------------------------------------
|
| Regression suite for a MEDIUM audit finding.
|
| `respond()` accepts or rejects a mutual-termination request, and ACCEPTING
| writes:
|
|     $project->update(['status' => $isAccept ? 'cancelled' : 'in_progress']);
|
| The gate was:
|
|     $isParticipant = $this->isProjectOwner($project, $user)
|         || (int) $project->pm_id === (int) $user->id
|         || $this->isHiredProfessional($project, $user);
|
| so ANY hired professional or active sub-professional could accept someone
| else's request and cancel the client's entire build. A specialist engaged for a
| single phase -- a structural engineer, an MEP consultant -- held the power to
| terminate the whole engagement, and `cancelled` is not a reversible status the
| owner can undo from the UI.
|
| Participation is the wrong test for a decision of this magnitude. The same
| reasoning already governs specialist hiring, engineering approvals, phase
| sealing and warranty closure, which is why `Hire::isOwnerOrAssignedPm()` exists.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mtUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    match ($roleType) {
        'kontraktor' => Kontraktor::create([
            'user_id' => $user->id, 'nama' => "Kontraktor $tag",
            'verification_status' => 'verified',
        ]),
        'project_manager' => ProjectManager::create([
            'user_id' => $user->id, 'nama' => "PM $tag",
            'verification_status' => 'verified',
        ]),
        default => null,
    };

    return $user;
}

/** A project with a pending termination request raised by a hired professional. */
function mtProject(string $tag): array
{
    $owner = mtUser('user', "own_$tag");
    $contractor = mtUser('kontraktor', "con_$tag");

    $project = Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'selected_kontraktor_id' => $contractor->kontraktor->id,
    ]);

    // Initiated by the OWNER, deliberately. If the professional were the initiator,
    // the pre-existing 'you cannot respond to your own request' guard would fire
    // FIRST and the test would pass without ever reaching the participant gate.
    $termination = ProjectTermination::create([
        'project_id' => $project->id,
        'initiator_id' => $owner->id,
        'reason' => 'The client wishes to close out this engagement.',
        'status' => 'pending',
    ]);

    return [$owner, $contractor, $project, $termination];
}

it('refuses to ACCEPT a cancellation from a hired contractor', function () {
    [$owner, $contractor, $project, $termination] = mtProject('acc');

    $this->actingAs($contractor)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", [
            'action' => 'accept',
        ])
        ->assertStatus(403);

    // The project must NOT be cancelled.
    expect($project->fresh()->status)->toBe('in_progress')
        ->and($termination->fresh()->status)->toBe('pending');
});

it('refuses to REJECT a cancellation request from a hired contractor', function () {
    // Rejecting is also the owner's call: it reopens the project.
    [$owner, $contractor, $project, $termination] = mtProject('rej');

    $this->actingAs($contractor)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", [
            'action' => 'reject',
        ])
        ->assertStatus(403);

    expect($termination->fresh()->status)->toBe('pending');
});

it('refuses an ACTIVE SUB-PROFESSIONAL acting for their own row', function () {
    // The other half of `isHiredProfessional()`: a specialist engaged under a
    // lead is a participant too, and had the same power.
    [$owner, $contractor, $project, $termination] = mtProject('sub');

    $sub = mtUser('kontraktor', 'subpro');

    ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $sub->id,
        'parent_role' => 'kontraktor', 'sub_role' => 'structural',
        'assigned_by' => $owner->id, 'status' => 'active',
    ]);

    $this->actingAs($sub)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", [
            'action' => 'accept',
        ])
        ->assertStatus(403);

    expect($project->fresh()->status)->toBe('in_progress');
});

it('lets the OWNER accept a cancellation', function () {
    // Here the CONTRACTOR initiates, so the owner is the responder and the
    // self-response guard does not apply.
    $owner = mtUser('user', 'ownerok');
    $contractor = mtUser('kontraktor', 'conownerok');

    $project = Project::create([
        'title' => 'Job ownerok', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'selected_kontraktor_id' => $contractor->kontraktor->id,
    ]);

    $termination = ProjectTermination::create([
        'project_id' => $project->id, 'initiator_id' => $contractor->id,
        'reason' => 'We can no longer service this site.', 'status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", [
            'action' => 'accept',
        ])
        ->assertStatus(200);

    expect($project->fresh()->status)->toBe('cancelled')
        ->and($termination->fresh()->status)->toBe('accepted');
});

it('lets the ASSIGNED PM accept a cancellation', function () {
    $owner = mtUser('user', 'pmo');
    $pm = mtUser('project_manager', 'pmok');
    $contractor = mtUser('kontraktor', 'conpm');

    $project = Project::create([
        'title' => 'Job pmok', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'pm_id' => $pm->id, 'selected_kontraktor_id' => $contractor->kontraktor->id,
    ]);

    $termination = ProjectTermination::create([
        'project_id' => $project->id, 'initiator_id' => $owner->id,
        'reason' => 'The client wishes to close out this engagement.', 'status' => 'pending',
    ]);

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", [
            'action' => 'accept',
        ])
        ->assertStatus(200);

    expect($project->fresh()->status)->toBe('cancelled');
});

it('refuses a PM who is NOT assigned to this project', function () {
    // `isOwnerOrAssignedPm()` compares `projects.pm_id`, so a PM hired on a
    // DIFFERENT project cannot cancel this one.
    [$owner, $contractor, $project, $termination] = mtProject('pmother');

    $otherPm = mtUser('project_manager', 'pmother');

    $this->actingAs($otherPm)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", [
            'action' => 'accept',
        ])
        ->assertStatus(403);

    expect($project->fresh()->status)->toBe('in_progress');
});

it('still refuses the initiator from responding to their own request', function () {
    // The pre-existing self-response guard must survive the tightening.
    $owner = mtUser('user', 'ownself');
    $contractor = mtUser('kontraktor', 'conself');

    $project = Project::create([
        'title' => 'Job self', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'selected_kontraktor_id' => $contractor->kontraktor->id,
    ]);

    $termination = ProjectTermination::create([
        'project_id' => $project->id, 'initiator_id' => $owner->id,
        'reason' => 'Owner changed their mind.', 'status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/mutual-termination/{$termination->id}/respond", [
            'action' => 'accept',
        ])
        ->assertStatus(403);

    expect($project->fresh()->status)->toBe('in_progress');
});