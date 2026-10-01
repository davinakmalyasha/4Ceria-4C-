<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\BidArsitek;
use App\Models\User;
use App\Services\ProjectFinancialService;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Approving a design brief is not a payment event
|--------------------------------------------------------------------------
|
| Regression suite for HIGH finding H4 of the final security audit.
|
| THE DEADLOCK
| ------------
| `approvePlanning()` wrote `design_payment_verified_at`. That column is the
| idempotency guard AND money flag of `verifyDesignPayment()`:
|
|     if ($project->design_payment_verified_at) {
|         return ...'The design fee has already been verified...', 422;
|     }
|     ...
|     $financial->recordPayment(...);
|
| So the client approving the plan permanently blocked the ONLY endpoint that
| records the design fee. Every project passing the PM gate reached this on its
| way to approval, so it was total:
|
|   - recordPayment() never ran, so the ledger held no row for the architect's
|     fee and available() overstated free budget by the whole design fee;
|   - the architect's bid never reached payment_status = paid;
|   - and the 422 the client then hit claimed the fee had "already been
|     verified" -- the opposite of what happened.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/** Owner + hired architect + (optionally) a PM that has verified the plan. */
function planningProject(string $tag, bool $withPm = true): array
{
    $owner = User::create([
        'name' => 'Owner', 'username' => "o_$tag" . uniqid(),
        'email' => "o_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $arUser = User::create([
        'name' => 'Arsitek', 'username' => "a_$tag" . uniqid(),
        'email' => "a_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $arsitek = Arsitek::create([
        'user_id' => $arUser->id, 'nama' => 'Studio',
        'verification_status' => 'verified',
    ]);

    $pmId = null;
    if ($withPm) {
        $pmUser = User::create([
            'name' => 'PM', 'username' => "pm_$tag" . uniqid(),
            'email' => "pm_$tag" . uniqid() . '@example.test',
            'password' => Hash::make('password123'), 'role_type' => 'project_manager',
        ]);
        ProjectManager::create([
            'user_id' => $pmUser->id, 'nama' => 'PM Co',
            'verification_status' => 'verified',
        ]);
        $pmId = $pmUser->id;
    }

    $project = Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 400_000_000, 'status' => 'in_progress',
        'selected_arsitek_id' => $arsitek->id,
        'pm_id' => $pmId,
        'planning_status' => 'pm_verified',
    ]);

    return [$owner, $arUser, $project];
}

it('does not mark the design payment verified when the plan is approved', function () {
    [$owner, $arUser, $project] = planningProject('p1');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-planning")
        ->assertStatus(200);

    $fresh = $project->fresh();

    expect($fresh->planning_status)->toBe('approved')
        // The flag belongs to the payment endpoint, not to plan approval.
        ->and($fresh->design_payment_verified_at)->toBeNull();
});

it('leaves the design payment verifiable after approval', function () {
    [$owner, $arUser, $project] = planningProject('p2');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/approve-planning")
        ->assertStatus(200);

    // The architect can now reach verifyDesignPayment instead of being told the
    // fee "has already been verified".
    $this->actingAs($arUser)
        ->postJson("/api/projects/{$project->id}/verify-payment")
        ->assertStatus(200);

    expect($project->fresh()->design_payment_verified_at)->not->toBeNull();
});

it('records the design fee in the ledger exactly once', function () {
    [$owner, $arUser, $project] = planningProject('p3');

    $bid = BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $project->selected_arsitek_id,
        'price' => 40_000_000,
        'calculated_total' => 40_000_000,
        'fee_type' => 'fixed',
        'status' => 'accepted',
    ]);

    $this->actingAs($owner)->postJson("/api/projects/{$project->id}/approve-planning")->assertStatus(200);
    $this->actingAs($arUser)->postJson("/api/projects/{$project->id}/verify-payment")->assertStatus(200);

    $transactions = $project->fresh()->budgetTransactions;

    $designRows = $transactions->filter(
        fn ($t) => str_contains((string) $t->title, 'Architect Base Fee')
    );

    expect($designRows)->toHaveCount(1);

    // A second call is refused by the idempotency guard, so no duplicate row.
    $this->actingAs($arUser)
        ->postJson("/api/projects/{$project->id}/verify-payment")
        ->assertStatus(422);

    $designRowsAfter = $project->fresh()->budgetTransactions
        ->filter(fn ($t) => str_contains((string) $t->title, 'Architect Base Fee'));

    expect($designRowsAfter)->toHaveCount(1);
});

it('keeps the ledger honest: the design fee is not double-counted after approval', function () {
    // Before the fix, approval set the guard, so verifyDesignPayment 422'd and
    // the ledger simply had no row. Escrow therefore overstated free budget by
    // the entire design fee.
    [$owner, $arUser, $project] = planningProject('p4');

    BidArsitek::create([
        'project_id' => $project->id,
        'arsitek_id' => $project->selected_arsitek_id,
        'price' => 40_000_000,
        'calculated_total' => 40_000_000,
        'fee_type' => 'fixed',
        'status' => 'accepted',
    ]);

    $this->actingAs($owner)->postJson("/api/projects/{$project->id}/approve-planning")->assertStatus(200);

    $availableBefore = app(ProjectFinancialService::class)->available($project->fresh());

    $this->actingAs($arUser)->postJson("/api/projects/{$project->id}/verify-payment")->assertStatus(200);

    $availableAfter = app(ProjectFinancialService::class)->available($project->fresh());

    expect((float) $availableAfter)->toBeLessThan((float) $availableBefore);
});

it('still refuses plan approval to anyone but the owner', function () {
    [$owner, $arUser, $project] = planningProject('p5');

    $this->actingAs($arUser)
        ->postJson("/api/projects/{$project->id}/approve-planning")
        ->assertStatus(403);

    expect($project->fresh()->planning_status)->toBe('pm_verified');
});