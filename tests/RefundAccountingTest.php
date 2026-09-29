<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectDispute;
use App\Models\User;
use App\Services\DisputeService;
use App\Services\ProjectFinancialService;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Multi-dispute refund accounting
|--------------------------------------------------------------------------
|
| Regression suite for the refund-cap bug, plus the product limitation it was
| hiding.
|
| THE BUG
| -------
| DisputeService computed:
|     $paidForPayment = SUM(ledger WHERE type IN ('payment','refund'))  // NET
|     $alreadyRefunded = (float) $payment->refunded_amount              // GROSS
|     $refundable      = $paidForPayment - $alreadyRefunded             // NET - GROSS
|
| The NET sum already has every prior reversal subtracted, so subtracting the
| GROSS again charged for each reversal TWICE. On a Rp 10,000,000 payment:
|
|     refund 4,000,000  ->  available to refund becomes 2,000,000 (should be 6,000,000)
|
| and the terminal test compared GROSS refunded against NET paid, so a payment
| could be flagged 'refunded' with Rp 4,000,000 still outstanding — and because
| 'refunded' is terminal, that money became permanently un-recoverable.
|
| THE LIMITATION BEHIND IT
| ------------------------
| A refund row referenced the PAYMENT, so
| UNIQUE (project_id, reference_model, reference_id, transaction_type) allowed
| only ONE refund per payment. Verified empirically before this fix:
|
|     refund #0 of 100: INSERTED
|     refund #1: BLOCKED -> UniqueConstraintViolationException
|
| So staged arbitration — release Rp 2,000,000 now, Rp 1,000,000 on a later
| defect — was not expressible at all. The in-code $alreadyRefunded guard was
| redundant protection, and redundant protection is how the arithmetic broke.
|
| SAFETY MODEL: real MySQL via DatabaseHarness, DML only, always rolled back.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * A paid bid plus an owner, an admin and the payee, ready for arbitration.
 *
 * @return array{0: User, 1: User, 2: BidArsitek, 3: Project}
 */
function refundScenario(string $tag, int|float $paid = 10_000_000, int|float $budget = 100_000_000): array
{
    $owner = User::create([
        'name' => "RO {$tag}", 'username' => "ro_$tag" . uniqid(),
        'email' => "ro_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $admin = User::create([
        'name' => "RA {$tag}", 'username' => "ra_$tag" . uniqid(),
        'email' => "ra_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);
    $pro = User::create([
        'name' => "RP {$tag}", 'username' => "rp_$tag" . uniqid(),
        'email' => "rp_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => "Arsitek {$tag}"]);
    $project = Project::create([
        'title' => "Refund {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
    ]);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => $paid, 'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    $recorded = app(ProjectFinancialService::class)
        ->recordPayment($project, $paid, "Professional Fee: {$pro->name}", BidArsitek::class, $bid->id);

    expect($recorded)->toBeTrue();

    $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);

    return [$owner, $admin, $bid, $project];
}

function openRefundDispute(Project $project, User $owner, BidArsitek $bid, string $title, int|float $disputed): ProjectDispute
{
    return app(DisputeService::class)->open($project, $owner, [
        'category' => 'payment',
        'title' => $title,
        'description' => 'Partial amount is owed back.',
        'payment_type' => 'arsitek_bid',
        'payment_id' => $bid->id,
        'disputed_amount' => $disputed,
    ]);
}

// ---------------------------------------------------------------------------
// The regression
// ---------------------------------------------------------------------------

it('does not shrink the refundable balance twice per refund', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('cap');
    $disputes = app(DisputeService::class);
    $financial = app(ProjectFinancialService::class);

    // Rp 10,000,000 paid, nothing returned yet.
    $refundable = $disputes->paidAgainst($project->id, BidArsitek::class, $bid->id)
        ->subtract($disputes->refundedAgainst($project->id, BidArsitek::class, $bid->id));
    expect($refundable->toDecimal())->toBe('10000000.00');

    // First dispute returns Rp 4,000,000.
    $d1 = openRefundDispute($project, $owner, $bid, 'First', 4_000_000);
    $disputes->adminAction($d1, $admin, 'record_refund', null, 4_000_000);

    $bid->refresh();
    expect((float) $bid->refunded_amount)->toBe(4_000_000.0);

    // The bug: this read 2,000,000 because NET(6M) - GROSS(4M).
    $refundable = $disputes->paidAgainst($project->id, BidArsitek::class, $bid->id)
        ->subtract($disputes->refundedAgainst($project->id, BidArsitek::class, $bid->id));
    expect($refundable->toDecimal())->toBe('6000000.00');

    // A second dispute can still return a further Rp 2,000,000.
    $d2 = openRefundDispute($project, $owner, $bid, 'Second', 2_000_000);
    $disputes->adminAction($d2, $admin, 'record_refund', null, 2_000_000);

    $bid->refresh();
    expect((float) $bid->refunded_amount)->toBe(6_000_000.0);

    // And Rp 4,000,000 genuinely remains.
    $refundable = $disputes->paidAgainst($project->id, BidArsitek::class, $bid->id)
        ->subtract($disputes->refundedAgainst($project->id, BidArsitek::class, $bid->id));
    expect($refundable->toDecimal())->toBe('4000000.00');

    // Escrow: 100,000,000 ceiling, 10,000,000 disbursed, 6,000,000 returned.
    expect(Money::fromColumn($financial->available($project))->toDecimal())->toBe('96000000.00');
});

it('never marks a payment refunded while money is still outstanding', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('terminal');
    $disputes = app(DisputeService::class);

    $d1 = openRefundDispute($project, $owner, $bid, 'First', 4_000_000);
    $disputes->adminAction($d1, $admin, 'record_refund', null, 4_000_000);

    $d2 = openRefundDispute($project, $owner, $bid, 'Second', 2_000_000);
    $disputes->adminAction($d2, $admin, 'record_refund', null, 2_000_000);

    $bid->refresh();

    // 6M of 10M returned. The old GROSS>=NET test read
    // 6M >= (10M-6M)=4M and wrongly flipped this terminal.
    expect($bid->payment_status)->toBe('paid')
        ->and($bid->status)->toBe('active');
});

it('marks a payment refunded only when the gross returned covers the gross paid', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('full');
    $disputes = app(DisputeService::class);

    $d1 = openRefundDispute($project, $owner, $bid, 'First', 6_000_000);
    $disputes->adminAction($d1, $admin, 'record_refund', null, 6_000_000);
    expect($bid->fresh()->payment_status)->toBe('paid');

    $d2 = openRefundDispute($project, $owner, $bid, 'Second', 4_000_000);
    $disputes->adminAction($d2, $admin, 'record_refund', null, 4_000_000);

    $bid->refresh();
    expect($bid->payment_status)->toBe('refunded')
        ->and((float) $bid->refunded_amount)->toBe(10_000_000.0);
});

it('refuses a refund larger than what is still refundable across all disputes', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('over');
    $disputes = app(DisputeService::class);

    $d1 = openRefundDispute($project, $owner, $bid, 'First', 4_000_000);
    $disputes->adminAction($d1, $admin, 'record_refund', null, 4_000_000);

    $d2 = openRefundDispute($project, $owner, $bid, 'Second', 7_000_000);

    // 10M paid, 4M back -> 6M refundable. 7M must be refused, not 2M-shrunk.
    expect(fn () => $disputes->adminAction($d2, $admin, 'record_refund', null, 7_000_000))
        ->toThrow(Exception::class, 'Refund exceeds what is still refundable');

    $bid->refresh();
    expect((float) $bid->refunded_amount)->toBe(4_000_000.0);
});

it('refuses a refund larger than the amount recorded on that dispute', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('disputed');
    $disputes = app(DisputeService::class);

    $d = openRefundDispute($project, $owner, $bid, 'Small claim', 1_000_000);

    expect(fn () => $disputes->adminAction($d, $admin, 'record_refund', null, 2_000_000))
        ->toThrow(Exception::class, 'exceeds the disputed amount');
});

// ---------------------------------------------------------------------------
// The schema fix
// ---------------------------------------------------------------------------

it('writes one reversal row per dispute and records the payment it reverses', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('rows');
    $disputes = app(DisputeService::class);

    $d1 = openRefundDispute($project, $owner, $bid, 'First', 4_000_000);
    $disputes->adminAction($d1, $admin, 'record_refund', null, 4_000_000);
    $d2 = openRefundDispute($project, $owner, $bid, 'Second', 2_000_000);
    $disputes->adminAction($d2, $admin, 'record_refund', null, 2_000_000);

    $reversals = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'refund')
        ->get();

    // Two reversals for one payment: the pre-fix unique index made this
    // impossible with a Duplicate entry error.
    expect($reversals)->toHaveCount(2);

    foreach ($reversals as $row) {
        // Keyed to the dispute -> the index enforces one reversal per dispute.
        expect($row->reference_model)->toBe(ProjectDispute::class)
            // ...and it names the payment being returned.
            ->and($row->reverses_model)->toBe(BidArsitek::class)
            ->and((int) $row->reverses_id)->toBe($bid->id)
            ->and((float) $row->amount)->toBeLessThan(0);
    }

    $disputeIds = $reversals->pluck('reference_id')->sort()->values()->all();
    expect($disputeIds)->toBe(collect([$d1->id, $d2->id])->sort()->values()->all());
});

it('refuses to refund the same dispute twice', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('idem');
    $disputes = app(DisputeService::class);

    $d = openRefundDispute($project, $owner, $bid, 'Once', 4_000_000);
    $disputes->adminAction($d, $admin, 'record_refund', null, 4_000_000);

    // The dispute is now closed, so a second action is refused on status alone.
    expect(fn () => $disputes->adminAction($d->fresh(), $admin, 'record_refund', null, 1_000))
        ->toThrow(Exception::class, 'already closed');
});

it('keeps refunded_amount equal to the sum of the ledger reversals', function () {
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('mirror');
    $disputes = app(DisputeService::class);

    $d1 = openRefundDispute($project, $owner, $bid, 'First', 3_000_000);
    $disputes->adminAction($d1, $admin, 'record_refund', null, 3_000_000);
    $d2 = openRefundDispute($project, $owner, $bid, 'Second', 1_500_000);
    $disputes->adminAction($d2, $admin, 'record_refund', null, 1_500_000);

    $bid->refresh();

    // The denormalised mirror on the payment row must equal the ledger, which is
    // the authoritative record. `money:reconcile` asserts this in production.
    expect($disputes->refundedAgainst($project->id, BidArsitek::class, $bid->id)->toInt())
        ->toBe(Money::fromColumn((string) $bid->refunded_amount)->toInt())
        ->and((float) $bid->refunded_amount)->toBe(4_500_000.0);
});

// ---------------------------------------------------------------------------
// Arithmetic invariants, pinned independently of the schema change
// ---------------------------------------------------------------------------

it('reports the gross paid and gross returned separately, never netted', function () {
    // A regression guard for the exact expression that was wrong:
    //     refundable = SUM(payment + refund) - refunded_amount      // net - gross
    //
    // This writes a LEGACY-STYLE reversal — one whose `reference_*` also names
    // the payment, as every pre-2026-09-29 row does — so it reproduces the
    // situation in which netting double-counts, and then asserts the two
    // figures stay GROSS. Without this, a future refactor that reintroduces
    // `whereIn(['payment','refund'])` into the paid query would pass every
    // behavioural test above, because the new schema hides the mistake.
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('gross');
    $disputes = app(DisputeService::class);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'refund',
        'amount' => '-4000000.00',
        'title' => 'legacy-shaped reversal',
        'reference_model' => BidArsitek::class,   // pre-2026-09-29 shape
        'reference_id' => $bid->id,
        'reverses_model' => BidArsitek::class,    // and the new columns too
        'reverses_id' => $bid->id,
        'transaction_date' => now(),
    ]);

    $paid = $disputes->paidAgainst($project->id, BidArsitek::class, $bid->id);
    $refunded = $disputes->refundedAgainst($project->id, BidArsitek::class, $bid->id);

    // GROSS paid is 10,000,000 — it must NOT have the 4,000,000 reversal
    // subtracted out of it. A netted query would report 6,000,000 here.
    expect($paid->toDecimal())->toBe('10000000.00');

    // GROSS returned is 4,000,000 and is POSITIVE, even though the ledger
    // stores reversals as a negative amount.
    expect($refunded->toDecimal())->toBe('4000000.00')
        ->and($refunded->isPositive())->toBeTrue();

    // And the two compose without double-counting: 6,000,000 remains.
    expect($paid->subtract($refunded)->toDecimal())->toBe('6000000.00');
});

it('keeps the escrow available figure equal to the net ledger', function () {
    // `available = ceiling - SUM(payment + refund)`. Reversals are negative, so
    // a returned amount ADDS headroom back. This is the identity the whole
    // escrow rests on.
    Mail::fake();
    [$owner, $admin, $bid, $project] = refundScenario('identity');
    $disputes = app(DisputeService::class);
    $financial = app(ProjectFinancialService::class);

    $d1 = openRefundDispute($project, $owner, $bid, 'First', 2_500_000);
    $disputes->adminAction($d1, $admin, 'record_refund', null, 2_500_000);

    $ceiling = Money::fromColumn($project->budget);
    $ledger = Money::fromColumn(
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->whereIn('transaction_type', ['payment', 'refund'])
            ->sum('amount')
    );

    expect(Money::fromColumn($financial->available($project))->toInt())
        ->toBe($ceiling->subtract($ledger)->toInt())
        // 100,000,000 - 10,000,000 + 2,500,000
        ->and($financial->available($project))->toBe(92_500_000.0);
});
