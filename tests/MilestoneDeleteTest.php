<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Milestone delete: binding, gates, locks and cascade-free removal
|--------------------------------------------------------------------------
|
| `DELETE /projects/{project}/milestones/{milestone}`:
| - the PROJECT binding is checked first (a milestone from another project
|   answers the plain `Not found.`, not a model 404);
| - canModifyMilestone admits the owner, the assigned PM, the lead
|   architect/contractor when the milestone holds a structural/MEP id, any
|   profile listed on the row, and an active sub-pro whose sub_role equals
|   the milestone type;
| - non-privileged callers are additionally blocked while the phase
|   handover is under review;
| - an approved milestone (400) and a milestone whose FIRST linked stage is
|   paid (400) are refused;
| - success removes the gallery files, deletes the row and logs
|   `milestone_deleted` with `Deleted: {title}`.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mdOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "mdown_$tag" . uniqid(),
        'email' => "mdown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function mdArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "mda_$tag" . uniqid(),
        'email' => "mda_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function mdNotary(string $tag): User
{
    $user = User::create([
        'name' => "Not $tag", 'username' => "mdn_$tag" . uniqid(),
        'email' => "mdn_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);
    NotarisProfile::create(['user_id' => $user->id, 'nama' => "Not $tag"]);

    return $user;
}

function mdProject(User $owner, string $tag, array $overrides = []): Project
{
    return Project::create(array_merge([
        'title' => "Milestones $tag", 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress', 'target_role' => 'both',
    ], $overrides));
}

it('deletes an idle milestone and logs it', function () {
    $owner = mdOwner('ok');
    $project = mdProject($owner, 'ok');
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Delete Me', 'type' => 'schematic',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$milestone->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Milestone deleted successfully.');

    expect(ProjectMilestone::find($milestone->id))->toBeNull();

    $log = ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('milestone_deleted');
    expect($log->details)->toBe('Deleted: Delete Me');
});

it('refuses an approved milestone and a paid linked stage', function () {
    $owner = mdOwner('lock');
    $project = mdProject($owner, 'lock');

    $approved = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Approved', 'type' => 'schematic',
        'phase_context' => 'design', 'approval_status' => 'approved',
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$approved->id}")
        ->assertStatus(400)
        ->assertJsonPath('message', 'Cannot delete an approved milestone.');

    $paid = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Paid', 'type' => 'schematic',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);
    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek',
        'label' => 'DP', 'percentage' => 50, 'amount' => 1_000_000,
        'status' => 'paid', 'milestone_id' => $paid->id,
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$paid->id}")
        ->assertStatus(400)
        ->assertJsonPath('message', 'Cannot delete a step linked to a PAID payment.');

    expect(ProjectMilestone::find($approved->id))->not->toBeNull();
    expect(ProjectMilestone::find($paid->id))->not->toBeNull();
});

it('gates non-modifiers and binds the milestone to its project', function () {
    $owner = mdOwner('gate');
    $notary = mdNotary('gate');
    $project = mdProject($owner, 'gate');

    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Guarded', 'type' => 'legal',
        'phase_context' => 'legal', 'approval_status' => 'pending',
    ]);

    $this->actingAs($notary)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$milestone->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    // A milestone belonging to another project answers the plain 404.
    $other = mdProject($owner, 'other');
    $foreign = ProjectMilestone::create([
        'project_id' => $other->id, 'title' => 'Foreign', 'type' => 'legal',
        'phase_context' => 'legal', 'approval_status' => 'pending',
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$foreign->id}")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');

    expect(ProjectMilestone::find($foreign->id))->not->toBeNull();
});

it('locks the phase while a handover is under review', function () {
    $owner = mdOwner('ho');
    $architect = mdArchitect('ho');
    $struct = User::create([
        'name' => 'Struct Pro', 'username' => 'mdst' . uniqid(),
        'email' => 'mdst' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    StructuralEngineer::create(['user_id' => $struct->id, 'nama' => 'Struct Co']);
    $structProfile = StructuralEngineer::where('user_id', $struct->id)->sole();

    $project = mdProject($owner, 'ho', [
        'selected_arsitek_id' => $architect->arsitek->id,
        'structural_id' => $structProfile->id,
        'design_handover_submitted_at' => now(),
    ]);

    // The lead architect CAN modify it, but the handover lock stops them.
    $milestone = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Locked', 'type' => 'structural',
        'phase_context' => 'design', 'approval_status' => 'pending',
        'structural_id' => $structProfile->id,
    ]);

    $this->actingAs($architect)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$milestone->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Cannot delete milestones when phase handover is under review.');

    // The owner is privileged and bypasses the lock.
    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$milestone->id}")
        ->assertStatus(200);
});

it('lets an active sub-professional delete a milestone of their sub_role', function () {
    $owner = mdOwner('sub');
    $sub = User::create([
        'name' => 'MEP Pro', 'username' => 'mdm' . uniqid(),
        'email' => 'mdm' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'mep',
    ]);
    $project = mdProject($owner, 'sub');

    \App\Models\ProjectSubProfessional::create([
        'project_id' => $project->id, 'user_id' => $sub->id,
        'parent_role' => 'arsitek', 'sub_role' => 'mep',
        'assigned_by' => $owner->id, 'status' => 'active', 'rate' => 0,
    ]);

    $theirs = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'MEP step', 'type' => 'mep',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);
    $others = ProjectMilestone::create([
        'project_id' => $project->id, 'title' => 'Other step', 'type' => 'structure',
        'phase_context' => 'design', 'approval_status' => 'pending',
    ]);

    $this->actingAs($sub)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$theirs->id}")
        ->assertStatus(200);

    $this->actingAs($sub)
        ->deleteJson("/api/projects/{$project->id}/milestones/{$others->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');
});
