<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\BidNotaris;
use App\Models\BidStructural;
use App\Models\NotarisProfile;
use App\Models\Project;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Invite, negotiate and confirm-fee actually work
|--------------------------------------------------------------------------
|
| Regression suite for FOUR defects found while porting the S2 bid actions
| to Go (all fixed in the oracle first, never smuggled into the port):
|
| 1. `rejectInvite` closed over `use ($bid)` but read `$request->reason`
|    inside the closure — every success 500'd with "Undefined variable
|    $request".
| 2. The same update wrote `rejection_reason`, which is neither fillable
|    nor a column on ANY bid table — MassAssignmentException on every
|    success. The fix writes status only (the reason was never persisted).
| 3. `negotiateBidFee` wrote `selected_services` to every role, but only
|    the notaris bid carries that column — MassAssignmentException for
|    six of the seven roles. Only notaris persists it now.
| 4. `negotiateBidFee` read `$bid->proposed_team` for every role, but only
|    arsitek/kontraktor bids have the column — strict-mode 500 in
|    development (production read null). The team total now runs only
|    where the column exists.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function actionOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "own_$tag" . uniqid(),
        'email' => "own_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function actionArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "a_$tag" . uniqid(),
        'email' => "a_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    Arsitek::create([
        'user_id' => $user->id, 'nama' => "Studio $tag",
        'verification_status' => 'verified',
    ]);

    return $user;
}

function actionProject(User $owner, string $tag): Project
{
    return Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'open',
        'target_role' => 'both',
        'published_bidding_roles' => ['arsitek', 'notaris', 'structural'],
    ]);
}

it('accepts an invitation, moving invited to shortlisted', function () {
    $owner = actionOwner('acc');
    $pro = actionArchitect('acc');
    $project = actionProject($owner, 'acc');

    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 10_000_000, 'proposal' => 'Invite me.',
        'status' => 'invited', 'offered_by_id' => $owner->id,
    ]);

    $response = $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/accept-invite", [
            'bid_type' => 'arsitek',
        ])
        ->assertStatus(200);

    expect($response->json('message'))->toContain('interview phase');
    expect($bid->fresh()->status)->toBe('shortlisted');
});

it('rejects an invitation without a rejection_reason column', function () {
    $owner = actionOwner('rej');
    $pro = actionArchitect('rej');
    $project = actionProject($owner, 'rej');

    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 10_000_000, 'proposal' => 'No thanks.',
        'status' => 'invited', 'offered_by_id' => $owner->id,
    ]);

    $response = $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/reject-invite", [
            'bid_type' => 'arsitek', 'reason' => 'Busy.',
        ])
        ->assertStatus(200);

    expect($response->json('message'))->toBe('Invitation rejected.');
    expect($bid->fresh()->status)->toBe('rejected');
    expect($response->json('bid'))->not->toHaveKey('rejection_reason');
});

it('lets the owner negotiate an architect bid', function () {
    $owner = actionOwner('neg');
    $pro = actionArchitect('neg');
    $project = actionProject($owner, 'neg');

    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 10_000_000, 'proposal' => 'Pitch.',
        'status' => 'pending', 'offered_by_id' => $pro->id,
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/negotiate", [
            'bid_type' => 'arsitek', 'price' => 12_000_000,
        ])
        ->assertStatus(200);

    expect($response->json('message'))->toContain('(1/5)');

    $fresh = $bid->fresh();
    expect($fresh->negotiation_count)->toBe(1);
    expect((int) $fresh->offered_by_id)->toBe((int) $owner->id);
    expect($fresh->fee_agreed_at)->toBeNull();
    expect($response->json('bid.status'))->toBe('negotiating');
});

it('persists selected_services only for notaris bids', function () {
    $owner = actionOwner('svc');
    $project = actionProject($owner, 'svc');

    $notaryUser = User::create([
        'name' => 'Notary Svc', 'username' => 'n_svc' . uniqid(),
        'email' => 'n_svc' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);
    $profile = NotarisProfile::create([
        'user_id' => $notaryUser->id, 'nama' => 'Notary Svc',
        'verification_status' => 'verified',
    ]);

    $bid = BidNotaris::create([
        'project_id' => $project->id, 'notaris_id' => $profile->id,
        'price' => 5_000_000, 'proposal' => 'Deeds.',
        'status' => 'pending', 'offered_by_id' => $notaryUser->id,
    ]);

    $services = [['id' => 1, 'price' => 500_000]];

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/negotiate", [
            'bid_type' => 'notaris', 'price' => 5_000_000,
            'selected_services' => $services,
        ])
        ->assertStatus(200);

    expect($bid->fresh()->selected_services)->toBe($services);
});

it('confirms a fee, shortlisting only on owner confirmation', function () {
    $owner = actionOwner('cfm');
    $pro = actionArchitect('cfm');
    $project = actionProject($owner, 'cfm');

    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $pro->arsitek->id,
        'price' => 10_000_000, 'proposal' => 'Pitch.',
        'status' => 'negotiating', 'offered_by_id' => $owner->id,
    ]);

    // Bidder confirms: agreement recorded, status untouched.
    $this->actingAs($pro)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/confirm-fee", [
            'bid_type' => 'arsitek',
        ])
        ->assertStatus(200);

    expect($bid->fresh()->fee_agreed_at)->not->toBeNull();
    expect($bid->fresh()->status)->toBe('negotiating');

    // Owner confirms the standing offer: now it shortlists.
    $bid->update(['offered_by_id' => $pro->id, 'fee_agreed_at' => null]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/confirm-fee", [
            'bid_type' => 'arsitek',
        ])
        ->assertStatus(200);

    expect($bid->fresh()->status)->toBe('shortlisted');
});

it('negotiates a structural bid without touching proposed_team', function () {
    $owner = actionOwner('str');
    $user = User::create([
        'name' => 'Structural Str', 'username' => 's_str' . uniqid(),
        'email' => 's_str' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);
    $profile = StructuralEngineer::create([
        'user_id' => $user->id, 'nama' => 'SE Str',
        'verification_status' => 'verified',
    ]);
    $project = actionProject($owner, 'str');

    $bid = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $profile->id,
        'price' => 8_000_000, 'proposal' => 'Steel.',
        'status' => 'pending', 'offered_by_id' => $user->id,
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/negotiate", [
            'bid_type' => 'structural', 'price' => 9_000_000,
        ])
        ->assertStatus(200);

    expect($bid->fresh()->negotiation_count)->toBe(1);
});
