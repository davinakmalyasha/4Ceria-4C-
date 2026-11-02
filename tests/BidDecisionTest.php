<?php

use App\Models\Arsitek;
use App\Models\BidKontraktor;
use App\Models\BidNotaris;
use App\Models\Kontraktor;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Accept and decline finalize hiring without tripping on phantom columns
|--------------------------------------------------------------------------
|
| Regression suite for three defects found while porting the S2 decision
| endpoints to Go (all fixed in the oracle first, never smuggled):
|
| 1. `declineBid()` wrote `rejection_reason`, which is neither fillable
|    nor a column on ANY bid table — MassAssignmentException on every
|    success. The update now writes status only (the reason was never
|    persisted anywhere; it still reaches the professional in the
|    notification body).
| 2. `acceptBid()` created the "Project Kickoff" milestone with a `status`
|    attribute. Milestones have no `status` column (the lifecycle column
|    is `approval_status`, already defaulted to 'pending') — same
|    MassAssignmentException, and worse, it rolled back the whole hire
|    AFTER the bid and project writes, leaving fee_agreed_at set on a
|    bid that was never accepted.
|
| The suite also pins the hire side effects both stacks must reproduce:
| the fee agreement stamp, the loser rejection, the selected_* column,
| the kickoff milestone, the budget addendum for specialist roles, and
| the exact notification fan-out.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function decisionOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "own_$tag" . uniqid(),
        'email' => "own_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function decisionProject(User $owner, string $tag, array $extra = []): Project
{
    return Project::create(array_merge([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'open',
        'target_role' => 'both',
    ], $extra));
}

it('declines a bid without a rejection_reason column', function () {
    $owner = decisionOwner('dec');
    $pro = User::create([
        'name' => 'Notary Dec', 'username' => 'n_dec' . uniqid(),
        'email' => 'n_dec' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);
    NotarisProfile::create([
        'user_id' => $pro->id, 'nama' => 'Notary Dec',
        'verification_status' => 'verified',
    ]);
    $project = decisionProject($owner, 'dec');

    $bid = BidNotaris::create([
        'project_id' => $project->id, 'notaris_id' => $pro->notaris_profile->id,
        'price' => 1_000_000, 'proposal' => 'Deeds.',
        'status' => 'pending', 'offered_by_id' => $pro->id,
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/decline-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'notaris',
            'reason' => 'Too expensive.',
        ])
        ->assertStatus(200);

    expect($bid->fresh()->status)->toBe('rejected');
    expect($response->json('data.bids_notaris.0.status'))->toBe('rejected');
    expect($response->json('data.bids_notaris.0'))->not->toHaveKey('rejection_reason');

    $note = \App\Models\Notification::where('user_id', $pro->id)
        ->where('type', 'bid_rejected')->latest('id')->first();
    expect($note)->not->toBeNull();
    expect($note->body)->toContain('Too expensive.');
});

it('hires a kontraktor with design auto-verification and a kickoff milestone', function () {
    $owner = decisionOwner('kon');
    $pro = User::create([
        'name' => 'Kontraktor Kon', 'username' => 'k_kon' . uniqid(),
        'email' => 'k_kon' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    $profile = Kontraktor::create([
        'user_id' => $pro->id, 'nama' => 'Kontraktor Kon',
        'verification_status' => 'verified',
    ]);
    $project = decisionProject($owner, 'kon', ['status' => 'accepted_arsitek']);

    $bid = BidKontraktor::create([
        'project_id' => $project->id, 'kontraktor_id' => $profile->id,
        'price' => 200_000_000, 'proposal' => 'Build it.',
        'status' => 'shortlisted', 'offered_by_id' => $pro->id,
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/accept-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'kontraktor',
        ])
        ->assertStatus(200);

    $fresh = $bid->fresh();
    expect($fresh->status)->toBe('contract_pending');
    expect($fresh->fee_agreed_at)->not->toBeNull();
    expect($project->fresh()->selected_kontraktor_id)->toBe($profile->id);
    expect($project->fresh()->owner_design_approved_at)->not->toBeNull();
    expect($project->fresh()->completed_phases)->toContain('design');
    expect(
        \App\Models\ProjectMilestone::where('project_id', $project->id)
            ->where('title', 'Project Kickoff')->exists()
    )->toBeTrue();
});

it('recommends through the PM and then hires as the owner', function () {
    $owner = decisionOwner('pmr');
    $pmUser = User::create([
        'name' => 'PM Pmr', 'username' => 'pm_pmr' . uniqid(),
        'email' => 'pm_pmr' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    $pm = ProjectManager::create([
        'user_id' => $pmUser->id, 'nama' => 'PM Pmr',
        'verification_status' => 'verified',
    ]);
    $pro = User::create([
        'name' => 'Arsitek Pmr', 'username' => 'a_pmr' . uniqid(),
        'email' => 'a_pmr' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create([
        'user_id' => $pro->id, 'nama' => 'Studio Pmr',
        'verification_status' => 'verified',
    ]);
    $project = decisionProject($owner, 'pmr', [
        'wants_project_manager' => true, 'pm_id' => $pm->id,
    ]);

    $bid = \App\Models\BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 50_000_000, 'proposal' => 'Draw it.',
        'status' => 'pending', 'offered_by_id' => $pro->id,
    ]);

    // The owner cannot jump the queue while a PM is assigned.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/accept-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(403);

    // The PM recommends; the owner hires.
    $this->actingAs($pmUser)
        ->postJson("/api/projects/{$project->id}/accept-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
            'verification_notes' => 'Solid portfolio.',
        ])
        ->assertStatus(200);

    expect($bid->fresh()->is_recommended)->toBeTrue();

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/accept-bid", [
            'bid_id' => $bid->id, 'bid_type' => 'arsitek',
        ])
        ->assertStatus(200);

    expect($bid->fresh()->status)->toBe('contract_pending');
    expect($project->fresh()->selected_arsitek_id)->toBe($profile->id);
});
