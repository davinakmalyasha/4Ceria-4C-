<?php

use App\Models\BidNotaris;
use App\Models\Notification;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Firing and resigning
|--------------------------------------------------------------------------
|
| Both paths settle identically: mark the live bid, notify the other side,
| move the reliability score, delete the role's INCOMPLETE milestones, void
| every unpaid payment stage (leaving `verifying` for arbitration), clear the
| selected column and reopen an in-progress project.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function termUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "TM $tag", 'username' => "tm_$tag" . uniqid(),
        'email' => "tm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function termSetup(string $tag, string $projectStatus = 'in_progress'): array
{
    $owner = termUser("{$tag}o");
    $proUser = termUser("{$tag}p", 'notaris');
    $profile = NotarisProfile::create([
        'user_id' => $proUser->id, 'nama' => 'Notary', 'reliability_score' => 100,
    ]);
    $project = Project::create([
        'title' => "TM Project $tag", 'user_id' => $owner->id,
        'budget' => 10000000, 'status' => $projectStatus,
        'target_role' => 'both', 'selected_notaris_id' => $profile->id,
    ]);
    BidNotaris::create([
        'project_id' => $project->id, 'notaris_id' => $profile->id,
        'price' => 5000000, 'proposal' => 'x', 'status' => 'accepted',
    ]);
    $incomplete = ProjectMilestone::create([
        'project_id' => $project->id, 'notaris_id' => $profile->id,
        'title' => 'Incomplete', 'type' => 'generic', 'content' => [],
        'sort_order' => 1, 'is_completed' => false,
    ]);
    $done = ProjectMilestone::create([
        'project_id' => $project->id, 'notaris_id' => $profile->id,
        'title' => 'Done', 'type' => 'generic', 'content' => [],
        'sort_order' => 2, 'is_completed' => true,
    ]);
    $locked = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'recipient_id' => $proUser->id, 'label' => 'DP',
        'percentage' => 50, 'amount' => 1000000, 'status' => 'locked',
    ]);
    $verifying = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'notaris',
        'recipient_id' => $proUser->id, 'label' => 'Final',
        'percentage' => 50, 'amount' => 1000000, 'status' => 'verifying',
    ]);

    return [$owner, $proUser, $profile, $project, $incomplete, $done, $locked, $verifying];
}

it('fires a professional and settles the contract', function () {
    [$owner, $proUser, $profile, $project, $incomplete, $done, $locked, $verifying] = termSetup('fire');

    $this->actingAs(termUser('fires'))
        ->postJson("/api/projects/{$project->id}/terminate", ['role_type' => 'notaris', 'reason' => 'x'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Only the project owner can terminate contracts.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/terminate", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The role type field is required.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/terminate", ['role_type' => 'arsitek', 'reason' => 'x'])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'No professional of type arsitek is currently hired.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/terminate", [
            'role_type' => 'notaris', 'reason' => 'Breach of contract',
        ])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Contract for notaris terminated successfully. Project is reopened for bidding.']);

    expect(BidNotaris::where('project_id', $project->id)->first()->status)->toBe('terminated');
    expect($project->fresh()->selected_notaris_id)->toBeNull();
    expect($project->fresh()->status)->toBe('open');
    expect((int) $profile->fresh()->reliability_score)->toBe(90);
    expect(ProjectMilestone::find($incomplete->id))->toBeNull();
    expect(ProjectMilestone::find($done->id))->not->toBeNull();
    expect($locked->fresh()->status)->toBe('void');
    expect($locked->fresh()->notes)->toBe('Voided automatically — contract terminated.');
    expect($verifying->fresh()->status)->toBe('verifying');
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'payment_stages_settled')->count())->toBe(1);
    expect(Notification::where('user_id', $proUser->id)
        ->where('type', 'contract_terminated')->count())->toBe(1);
});

it('refuses to fire on a finished project', function () {
    [$owner, , , $project] = termSetup('firefin', 'completed');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/terminate", ['role_type' => 'notaris', 'reason' => 'x'])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Cannot terminate contracts on a completed project.']);
});

it('accepts a resignation and settles the contract', function () {
    [$owner, $proUser, $profile, $project, $incomplete, $done, $locked, $verifying] = termSetup('res');

    $this->actingAs(termUser('ress'))
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'x'])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'You are not hired for this role on this project.']);

    $this->actingAs($proUser)
        ->postJson("/api/projects/{$project->id}/resign", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.reason', ['The reason field is required.']);

    $this->actingAs($proUser)
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'Personal reasons'])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Resignation submitted successfully.']);

    expect(BidNotaris::where('project_id', $project->id)->first()->status)->toBe('resigned');
    expect($project->fresh()->selected_notaris_id)->toBeNull();
    expect($project->fresh()->status)->toBe('open');
    expect((int) $profile->fresh()->reliability_score)->toBe(95);
    expect(ProjectMilestone::find($incomplete->id))->toBeNull();
    expect(ProjectMilestone::find($done->id))->not->toBeNull();
    expect($locked->fresh()->status)->toBe('void');
    expect($verifying->fresh()->status)->toBe('verifying');
    expect(Notification::where('user_id', $owner->id)
        ->where('type', 'professional_resigned')->count())->toBe(1);
    expect(ProjectActivityLog::where('project_id', $project->id)
        ->where('action', 'professional_resigned')->count())->toBe(1);
});

it('refuses a resignation from a finished project', function () {
    [, $proUser, , $project] = termSetup('resfin', 'cancelled');

    $this->actingAs($proUser)
        ->postJson("/api/projects/{$project->id}/resign", ['reason' => 'x'])
        ->assertStatus(422)
        ->assertExactJson(['message' => 'Cannot resign from a cancelled project.']);
});
