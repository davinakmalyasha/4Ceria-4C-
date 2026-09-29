<?php

use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectBudgetTransaction;
use App\Models\BidStructural;
use App\Models\BidMep;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use App\Models\User;
use App\Services\ProjectFinancialService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Specialist-addendum payment must not orphan a bid
|--------------------------------------------------------------------------
|
| Regression suite for B4.
|
| THE BUG
| -------
| `ProjectBudgetController::markPaid` handles a "4C Specialist" addendum. When
| the addendum carries a `recommended_bid_id` / `recommended_bid_type`, the
| controller hires that specialist AND charges their fee:
|
|     $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);  // 1
|     ...
|     $financialService->recordPayment($project, $specialistFee, ...); // 2
|
| `recordPayment()` returns bool. It returns FALSE when the escrow cannot
| cover the amount, and writes no ledger row in that case. Line 2 discarded
| that return value, so:
|
|     * line 1 already committed `payment_status = 'paid'`
|     * line 2 silently did nothing
|     * the transaction still committed
|
| The result is a bid permanently marked PAID with no money ever leaving
| escrow. It is also permanently un-recoverable: `PaymentVerificationService::
| uploadProof()` treats 'paid' as a terminal state, so the specialist can never
| be re-paid, and `money:detect-duplicates` flags the bid as paid with no
| ledger row behind it.
|
| This is not theoretical. `php artisan money:detect-duplicates` on the dev
| database already reports exactly this shape.
|
| THE FIX
| -------
| Check the return and throw 422, which the surrounding `try/catch` turns into
| a rollback, so the `paid` write is undone and the specialist is either
| genuinely paid or not paid at all.
|
| Note the seven `bid_*` branches were already safe: they also flip to 'paid'
| before charging, but a failed `deductBudget` at the end of the method
| already threw and rolled back. Only these two specialist branches used a
| return value nobody read.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * An owner, a specialist, a specialist bid, and a specialist addendum that
 * references that bid — i.e. the exact shape that reaches the vulnerable
 * branch.
 *
 * @return array{0: User, 1: User, 2: Project, 3: BidStructural, 4: ProjectAddendum}
 */
function specialistAddendumScenario(string $tag, int|float $budget, int|float $specialistFee, int|float $addendumAmount): array
{
    $owner = User::create([
        'name' => "SO {$tag}", 'username' => "so_$tag" . uniqid(),
        'email' => "so_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $engineerUser = User::create([
        'name' => "SE {$tag}", 'username' => "se_$tag" . uniqid(),
        'email' => "se_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'structural',
    ]);

    $engineer = StructuralEngineer::create([
        'user_id' => $engineerUser->id, 'nama' => "Structural {$tag}",
    ]);

    $project = Project::create([
        'title' => "Specialist {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
    ]);

    $bid = BidStructural::create([
        'project_id' => $project->id, 'structural_id' => $engineer->id,
        'price' => $specialistFee, 'calculated_total' => $specialistFee,
        'proposal' => "Structural proposal {$tag}",
        'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    $addendum = ProjectAddendum::create([
        'project_id' => $project->id,
        'type' => 'specialist_assignment',
        'specialist_type' => 'structural',
        'role_type' => 'structural',
        // A professional RAISES the addendum proposing the hire; the owner is
        // the one who confirms payment and therefore performs the assignment.
        'user_id' => $engineerUser->id,
        'title' => "Hire structural engineer {$tag}",
        'amount' => $addendumAmount,
        'status' => 'pending_approval',
        'assigned_user_id' => $engineerUser->id,
        'recommended_bid_id' => $bid->id,
        'recommended_bid_type' => 'structural',
    ]);

    return [$owner, $engineerUser, $project, $bid, $addendum];
}

it('refuses to orphan a specialist bid when the escrow cannot cover the specialist fee', function () {
    // Budget 10,000,000 but the specialist alone costs 80,000,000.
    [$owner, , $project, $bid, $addendum] = specialistAddendumScenario(
        'b4a', 10_000_000, 80_000_000, 0
    );

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(422);

    // The bid must NOT be left marked paid with no money behind it.
    $bid->refresh();
    expect($bid->payment_status)->toBe('unpaid')
        ->and($bid->paid_at)->toBeNull();

    // And no ledger row may claim the specialist fee was paid.
    $rows = ProjectBudgetTransaction::where('reference_model', 'App\Models\BidStructural')
        ->where('reference_id', $bid->id)
        ->get();
    expect($rows)->toHaveCount(0);

    // The addendum must roll back too, so the owner can retry.
    expect($addendum->fresh()->status)->toBe('pending_approval');
});

it('does not orphan the bid when the fee fits but the addendum total does not', function () {
    // Specialist (5,000,000) fits inside 10,000,000; the addendum amount
    // (9,000,000) pushes the pair to 14,000,000 and the second charge fails.
    [$owner, , $project, $bid, $addendum] = specialistAddendumScenario(
        'b4b', 10_000_000, 5_000_000, 9_000_000
    );

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(422);

    $bid->refresh();
    expect($bid->payment_status)->toBe('unpaid')
        ->and($bid->paid_at)->toBeNull();

    expect(
        ProjectBudgetTransaction::where('reference_model', 'App\Models\BidStructural')
            ->where('reference_id', $bid->id)
            ->count()
    )->toBe(0);
});

it('pays the specialist and writes a ledger row when the escrow does cover it', function () {
    // Budget 100,000,000 covers the 80,000,000 specialist fee plus a 5,000,000
    // addendum amount.
    [$owner, , $project, $bid, $addendum] = specialistAddendumScenario(
        'b4c', 100_000_000, 80_000_000, 5_000_000
    );

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(200);

    $bid->refresh();
    expect($bid->payment_status)->toBe('paid')
        ->and($bid->paid_at)->not->toBeNull();

    // The specialist fee must be a real ledger row, not just a status flip.
    $feeRow = ProjectBudgetTransaction::where('reference_model', 'App\Models\BidStructural')
        ->where('reference_id', $bid->id)
        ->first();

    expect($feeRow)->not->toBeNull()
        ->and((float) $feeRow->amount)->toBe(80_000_000.0);

    // And the addendum amount must be a separate row.
    expect(
        ProjectBudgetTransaction::where('reference_model', 'App\Models\ProjectAddendum')
            ->where('reference_id', $addendum->id)
            ->count()
    )->toBe(1);
});

it('is idempotent: paying twice does not double-charge or double-flip', function () {
    [$owner, , $project, $bid, $addendum] = specialistAddendumScenario(
        'b4d', 100_000_000, 80_000_000, 5_000_000
    );

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(200);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(422);

    expect(
        ProjectBudgetTransaction::where('reference_model', 'App\Models\BidStructural')
            ->where('reference_id', $bid->id)
            ->count()
    )->toBe(1);
});

it('leaves an already-paid specialist bid alone', function () {
    [$owner, , $project, $bid, $addendum] = specialistAddendumScenario(
        'b4e', 100_000_000, 80_000_000, 5_000_000
    );

    $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
    $addendum->update(['status' => 'paid']);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(422);

    // No ledger row may be invented for a bid that was never charged.
    expect(
        ProjectBudgetTransaction::where('reference_model', 'App\Models\BidStructural')
            ->where('reference_id', $bid->id)
            ->count()
    )->toBe(0);
});

it('refuses a non-owner from marking a specialist addendum paid', function () {
    [$owner, $engineerUser, $project, $bid, $addendum] = specialistAddendumScenario(
        'b4f', 100_000_000, 80_000_000, 5_000_000
    );

    $this->actingAs($engineerUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/mark-paid", ['type' => 'addendum', 'id' => $addendum->id])
        ->assertStatus(403);

    expect($bid->fresh()->payment_status)->toBe('unpaid')
        ->and($addendum->fresh()->status)->toBe('pending_approval');
});
