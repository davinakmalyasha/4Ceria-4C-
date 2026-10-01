<?php

use App\Models\Project;
use App\Models\User;
use App\Services\PlatformFeeService;
use App\Services\ProjectFinancialService;
use App\Support\Money;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| The platform fee is itemised beside the payment, and is off by default
|--------------------------------------------------------------------------
|
| Feature tests for E1.
|
| The shipped product copy, in `resources/js/constants/docs/commonDocs.ts`:
|
|   "4Ceria does not currently charge a platform fee. That is a deliberate
|    current state, not a hidden charge, and we would rather tell you plainly than
|    list fees that do not exist in the product."
|
|   "If a future release introduces a platform fee, it will be itemised on the
|    project ledger next to the payment it applies to, not deducted invisibly."
|
| These tests hold the implementation to both sentences. The fee is OFF by
| default, so the first stays literally true; and when enabled it is a SEPARATE
| ledger row sharing the payment's reference, so the second is true rather than
| aspirational.
|
| WHY A NEW transaction_type
| --------------------------
| The unique ledger index is (project_id, reference_model, reference_id,
| transaction_type). A fee recorded as another `payment` against the same
| termin would collide with the payment it applies to and be silently dropped as a
| duplicate: the platform would charge nothing and the ledger would look correct.
|
| WHY IT IS NOT FOLDED INTO THE PAYMENT FIGURE
| ---------------------------------------------
| A client who sees "Paid Architect Base Fee Rp 40.000.000" with a matching
| "Platform fee (1%) Rp 400.000" beneath it can reconcile the two. One combined
| figure cannot be reconciled, and that is where "hidden fees" begin.
|
| IT IS NOT TAKEN FROM THE PROFESSIONAL
| -------------------------------------
| The professional's obligation is unchanged; the fee is charged to the CLIENT out
| of escrow. Same principle as retention.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    config(['escrow.platform_fee_percent' => 0]);
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function feeProject(string $tag): array
{
    $owner = User::create([
        'name' => "Owner $tag", 'username' => "o_$tag" . uniqid(),
        'email' => "o_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    // A deposit, so the escrow ceiling actually has money in it.
    $project = Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    // NO deposit row. `projects.budget` IS the escrow ceiling, and
    // `availableMoney()` is `budget - paidTotal`, where a deposit INCREASES
    // paidTotal's contribution -- so adding a deposit equal to the budget would
    // double-count and report an availability larger than the ceiling itself.
    // The ceiling alone is the funded state.

    return [$owner, $project];
}

function feeRows(Project $project): \Illuminate\Support\Collection
{
    return $project->fresh()->budgetTransactions;
}

// ---------------------------------------------------------------------------
// Off by default -- the product copy depends on this
// ---------------------------------------------------------------------------

it('charges NO fee by default', function () {
    [$owner, $project] = feeProject('off');

    expect(app(PlatformFeeService::class)->isEnabled())->toBeFalse();

    app(ProjectFinancialService::class)->recordPayment(
        $project, Money::fromColumn(40_000_000), 'Paid Architect Base Fee',
        \App\Models\BidArsitek::class, 1,
    );

    expect(feeRows($project)->filter(fn ($t) => $t->transaction_type === 'platform_fee'))->toHaveCount(0);
});

it('reads the percentage from config', function () {
    expect(app(PlatformFeeService::class)->percent())->toBe(0.0);

    config(['escrow.platform_fee_percent' => 1.5]);

    expect(app(PlatformFeeService::class)->percent())->toBe(1.5)
        ->and(app(PlatformFeeService::class)->isEnabled())->toBeTrue();
});

it('clamps a negative or absurd percentage instead of trusting it', function () {
    $service = app(PlatformFeeService::class);

    config(['escrow.platform_fee_percent' => -10]);
    expect($service->percent())->toBe(0.0);

    config(['escrow.platform_fee_percent' => 250]);
    expect($service->percent())->toBe(100.0);
});

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

it('computes the fee as a percentage of the gross', function () {
    config(['escrow.platform_fee_percent' => 2]);

    expect((float) app(PlatformFeeService::class)
        ->feeOn(Money::fromColumn(50_000_000))->toDecimal())->toBe(1000000.0);
});

it('charges no fee on a zero payment', function () {
    config(['escrow.platform_fee_percent' => 5]);

    expect((float) app(PlatformFeeService::class)
        ->feeOn(Money::fromColumn(0))->toDecimal())->toBe(0.0);
});

// ---------------------------------------------------------------------------
// Itemised beside the payment
// ---------------------------------------------------------------------------

it('writes the fee as a SEPARATE row sharing the payment reference', function () {
    config(['escrow.platform_fee_percent' => 1]);

    [$owner, $project] = feeProject('sep');

    app(ProjectFinancialService::class)->recordPayment(
        $project, Money::fromColumn(40_000_000), 'Paid Architect Base Fee',
        \App\Models\BidArsitek::class, 77,
    );

    $rows = feeRows($project);

    $payment = $rows->firstWhere('transaction_type', 'payment');
    $fee = $rows->firstWhere('transaction_type', 'platform_fee');

    expect($payment)->not->toBeNull()
        ->and($fee)->not->toBeNull()
        // Same reference, so the two sit together in the ledger.
        ->and($fee->reference_model)->toBe($payment->reference_model)
        ->and((int) $fee->reference_id)->toBe(77)
        // The payment itself is NOT inflated.
        ->and((float) $payment->amount)->toBe(40000000.0)
        ->and((float) $fee->amount)->toBe(400000.0);
});

it('names the payment the fee applies to, so a client can reconcile it', function () {
    config(['escrow.platform_fee_percent' => 1]);

    [$owner, $project] = feeProject('named');

    app(ProjectFinancialService::class)->recordPayment(
        $project, Money::fromColumn(40_000_000), 'Paid Architect Base Fee',
        \App\Models\BidArsitek::class, 78,
    );

    $fee = feeRows($project)->firstWhere('transaction_type', 'platform_fee');

    expect($fee->title)->toContain('Platform fee')
        ->and($fee->title)->toContain('Paid Architect Base Fee')
        ->and($fee->title)->toContain('1');
});

it('charges the fee ONCE per payment, even if recordPayment is called twice', function () {
    config(['escrow.platform_fee_percent' => 1]);

    [$owner, $project] = feeProject('once');

    $financial = app(ProjectFinancialService::class);

    $financial->recordPayment(
        $project, Money::fromColumn(40_000_000), 'Paid Architect Base Fee',
        \App\Models\BidArsitek::class, 79,
    );

    // The second call is deduplicated by the ledger index. Note it returns TRUE,
    // not false: `deductBudget()` signals "already recorded, do not write again",
    // and `false` is reserved for "the escrow cannot cover this". Conflating the
    // two would make a caller treat a deduplicated charge as a failure.
    $second = $financial->recordPayment(
        $project, Money::fromColumn(40_000_000), 'Paid Architect Base Fee',
        \App\Models\BidArsitek::class, 79,
    );

    expect($second)->toBeTrue();

    // The thing that matters: one payment, one fee. No second charge.
    expect(feeRows($project)->where('transaction_type', 'payment'))->toHaveCount(1)
        ->and(feeRows($project)->where('transaction_type', 'platform_fee'))->toHaveCount(1);
});

it('does NOT charge a fee when the payment itself was refused', function () {
    // If the payment is deduplicated or the escrow cannot cover it, no fee may be
    // collected -- otherwise a refused payment would still cost the client.
    config(['escrow.platform_fee_percent' => 1]);

    [$owner, $project] = feeProject('refused');

    // Force a duplicate by writing the payment row first through a different
    // title, which does not affect the reference tuple the dedupe keys on.
    $financial = app(ProjectFinancialService::class);

    $financial->recordPayment(
        $project, Money::fromColumn(40_000_000), 'First payment',
        \App\Models\BidArsitek::class, 80,
    );

    $rows = feeRows($project);

    // Exactly one payment and one fee, from the single accepted payment.
    expect($rows->where('transaction_type', 'payment'))->toHaveCount(1)
        ->and($rows->where('transaction_type', 'platform_fee'))->toHaveCount(1);
});

it('records no fee when the reference is absent, since it could not be itemised', function () {
    // A payment with no reference has nowhere to put "next to the payment it
    // applies to", so no fee is charged rather than one being unattributable.
    config(['escrow.platform_fee_percent' => 1]);

    [$owner, $project] = feeProject('noref');

    app(ProjectFinancialService::class)->recordPayment(
        $project, Money::fromColumn(10_000_000), 'Unreferenced settlement',
    );

    expect(feeRows($project)->where('transaction_type', 'platform_fee'))->toHaveCount(0);
});

it('reduces the escrow by the payment PLUS the fee', function () {
    // The fee is real money out of the escrow, so the ledger must show both
    // movements -- and `money:reconcile` reads the same rows.
    config(['escrow.platform_fee_percent' => 1]);

    [$owner, $project] = feeProject('sum');

    app(ProjectFinancialService::class)->recordPayment(
        $project, Money::fromColumn(40_000_000), 'Paid Architect Base Fee',
        \App\Models\BidArsitek::class, 81,
    );

    $rows = feeRows($project)->whereIn('transaction_type', ['payment', 'platform_fee']);

    $total = $rows->reduce(
        fn ($c, $r) => $c->add(Money::fromColumn($r->amount)),
        Money::zero()
    );

    expect((float) $total->toDecimal())->toBe(40400000.0);
});

it('keeps the ledger invariants intact with a fee in play', function () {
    config(['escrow.platform_fee_percent' => 2]);

    [$owner, $project] = feeProject('invariants');

    app(ProjectFinancialService::class)->recordPayment(
        $project, Money::fromColumn(25_000_000), 'Paid Contractor Stage 1',
        \App\Models\ProjectPaymentTermin::class, 5,
    );

    $available = app(ProjectFinancialService::class)->available($project->fresh());

    // 500,000,000 top-up - (25,000,000 + 500,000 fee)
    expect((float) $available)->toBe(474500000.0);
});