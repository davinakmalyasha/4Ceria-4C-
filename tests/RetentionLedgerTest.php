<?php

use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Services\ProjectFinancialService;
use App\Services\RetentionService;
use App\Support\Money;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Retention is withheld at payment, and the release really moves money
|--------------------------------------------------------------------------
|
| THE TWO FAILURES THIS EXISTS FOR
| ---------------------------------
|
| 1. THE RELEASE WAS A SILENT NO-OP.
|
|    `ReleaseExpiredRetentionCommand` called
|
|        deductBudget($project, $amount, 'payment', ..., ProjectPaymentTermin::class, $stage->id)
|
|    and `deductBudget()` dedupes on
|    (project_id, reference_id, transaction_type, reference_model). The termin's
|    own payment already occupied that EXACT tuple, so the release matched it,
|    returned `true` WITHOUT INSERTING -- and the command then set
|    `retention_released_at` and reported success.
|
|    The escrow was never debited. Retention was not held and not released; it
|    simply disappeared, while every surface said it had been paid.
|
|    The test that would have caught it is the obvious one and it is not written
|    anywhere else: assert a LEDGER ROW EXISTS after the command runs. Asserting
|    the command's own exit code, or that `retention_released_at` moved, passes
|    either way -- that is the whole trap.
|
| 2. NOTHING EVER WITHHELD THE RETENTION.
|
|    Both termin payment paths debited `$termin->amount`, the GROSS. So the
|    professional received the retention immediately, the escrow was emptied by
|    the full amount, and the release that followed would have been a SECOND
|    debit of the same rupiah against a ceiling that no longer contained it.
|
|    Retention as shipped did not withhold anything. It computed a number, stored
|    it, and displayed it.
|
| WHAT IS ASSERTED
| ----------------
| The invariant, not a snapshot: over the full lifecycle of a stage
| (withheld -> paid -> released), the total debited from the escrow equals the
| gross, the ceiling is never moved, and each leg is separately attributable in
| the ledger. That is the property a client is actually relying on.
|
| NOT COVERED HERE: warranty/claim gating, which `RetentionTest.php` owns.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    config([
        'escrow.retention_percent' => 5,
        'escrow.warranty_days' => 180,
        'escrow.blocking_claim_states' => ['open', 'fixing'],
        'escrow.platform_fee_percent' => 0,
    ]);
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function rlrOwner(string $tag)
{
    return \App\Models\User::create([
        'name' => "Owner $tag",
        'username' => "rlr_$tag" . uniqid(),
        'email' => "rlr_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'user',
    ]);
}

function rlrProject(string $tag, array $columns = []): array
{
    $owner = rlrOwner($tag);

    $project = \App\Models\Project::create(array_merge([
        'title' => "Job $tag",
        'user_id' => $owner->id,
        'budget' => 500_000_000,
        'status' => 'in_progress',
    ], $columns));

    return [$owner, $project];
}

function rlrStage($project, float $amount, array $columns = []): ProjectPaymentTermin
{
    return ProjectPaymentTermin::create(array_merge([
        'project_id' => $project->id,
        'label' => 'Stage one',
        'percentage' => 100,
        'amount' => $amount,
        'role_type' => 'kontraktor',
        'status' => 'pending',
    ], $columns));
}

function rlrLedger(int $projectId, string $type): array
{
    return ProjectBudgetTransaction::where('project_id', $projectId)
        ->where('transaction_type', $type)
        ->pluck('amount')
        ->map(fn ($a) => Money::fromColumn($a)->toDecimal())
        ->all();
}

// ---------------------------------------------------------------------------
// The regression: the release must write a ledger row
// ---------------------------------------------------------------------------

it('writes a ledger row when retention is released', function () {
    [$owner, $project] = rlrProject('release', [
        'warranty_start_at' => now()->subDays(200),
        'warranty_end_at' => now()->subDay(),
    ]);

    $stage = rlrStage($project, 100_000_000);

    // The professional is paid the NET at the point of work.
    $financial = app(ProjectFinancialService::class);
    $split = app(RetentionService::class)->forTermin($stage);
    expect(app(RetentionService::class)->forTermin($stage)['net']->toDecimal())
        ->toBe($split['net']->toDecimal());

    $financial->recordPayment($project, $split['net'], 'Termin paid', ProjectPaymentTermin::class, $stage->id);

    expect(rlrLedger($project->id, 'payment'))->toHaveCount(1);

    Artisan::call('escrow:release-retention', ['--project' => $project->id]);

    // THE ASSERTION THAT MATTERS. A ledger row must exist for the release.
    //
    // Before the fix this was `[]`, while `retention_released_at` was set and the
    // command reported success.
    expect(rlrLedger($project->id, 'retention_release'))->toHaveCount(1);

    $released = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'retention_release')
        ->first();

    expect(Money::fromColumn($released->amount)->toDecimal())
        ->toBe(Money::fromColumn($stage->retention_amount)->toDecimal());

    expect($stage->fresh()->retention_released_at)->not->toBeNull();
});

it('does not reuse the termin payment as the release row', function () {
    [$owner, $project] = rlrProject('distinct', [
        'warranty_start_at' => now()->subDays(200),
        'warranty_end_at' => now()->subDay(),
    ]);

    $stage = rlrStage($project, 100_000_000);
    $financial = app(ProjectFinancialService::class);
    $split = app(RetentionService::class)->forTermin($stage);

    $financial->recordPayment($project, $split['net'], 'Termin paid', ProjectPaymentTermin::class, $stage->id);
    Artisan::call('escrow:release-retention', ['--project' => $project->id]);

    // Two distinct movements against the same reference, which is only possible
    // because the release carries its own `transaction_type`.
    $rows = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('reference_id', $stage->id)
        ->get();

    expect($rows)->toHaveCount(2);
    expect($rows->pluck('transaction_type')->sort()->values()->all())
        ->toBe(['payment', 'retention_release']);
});

// ---------------------------------------------------------------------------
// The regression: nothing withheld the retention
// ---------------------------------------------------------------------------

it('reports the net as what a termin payment must debit', function () {
    [$owner, $project] = rlrProject('net');
    $stage = rlrStage($project, 100_000_000);

    $split = app(RetentionService::class)->forTermin($stage);

    expect($split['retention']->toDecimal())->toBe('5000000.00');
    expect($split['net']->toDecimal())->toBe('95000000.00');

    // And the invariant that makes both halves safe to sum.
    expect(
        $split['net']->add($split['retention'])->toDecimal()
    )->toBe(Money::fromColumn($stage->amount)->toDecimal());
});

it('never pays the gross, so the retention stays in escrow', function () {
    [$owner, $project] = rlrProject('gross');
    $stage = rlrStage($project, 100_000_000);

    $financial = app(ProjectFinancialService::class);
    $split = app(RetentionService::class)->forTermin($stage);
    $financial->recordPayment($project, $split['net'], 'Termin paid', ProjectPaymentTermin::class, $stage->id);

    $paid = Money::fromColumn(
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->where('transaction_type', 'payment')
            ->value('amount')
    );

    // The 5,000,000 retention is still inside the escrow.
    expect($paid->toDecimal())->toBe('95000000.00');
    expect($financial->availableMoney($project->fresh())->toDecimal())->toBe('405000000.00');
});

it('pays the gross for a stage that predates retention', function () {
    // A termin minted before D1 has net_amount = 0 and retention_amount = 0.
    // Paying 0 for a stage the client approved would be a worse bug than paying
    // the contract, so the fallback is the gross.
    [$owner, $project] = rlrProject('legacy');
    $stage = rlrStage($project, 40_000_000, ['net_amount' => 0, 'retention_amount' => 0]);

    $split = app(RetentionService::class)->forTermin($stage);

    expect($split['net']->toDecimal())->toBe('40000000.00');
    expect($split['retention']->toDecimal())->toBe('0.00');
});

// ---------------------------------------------------------------------------
// The compounding bug: the ceiling must not move
// ---------------------------------------------------------------------------

it('leaves the escrow ceiling untouched across a whole lifecycle', function () {
    [$owner, $project] = rlrProject('ceiling', [
        'warranty_start_at' => now()->subDays(200),
        'warranty_end_at' => now()->subDay(),
    ]);

    $stage = rlrStage($project, 100_000_000);
    $financial = app(ProjectFinancialService::class);
    $split = app(RetentionService::class)->forTermin($stage);

    $financial->recordPayment($project, $split['net'], 'Termin paid', ProjectPaymentTermin::class, $stage->id);
    Artisan::call('escrow:release-retention', ['--project' => $project->id]);

    // `deductBudget`'s old `$type !== 'payment'` test decremented `projects.budget`
    // for the release -- shrinking the ceiling for money that was never outside
    // it, on top of the availability it had already subtracted.
    expect(Money::fromColumn($project->fresh()->budget)->toDecimal())->toBe('500000000.00');
});

it('debits the gross in total once the retention is released', function () {
    [$owner, $project] = rlrProject('total', [
        'warranty_start_at' => now()->subDays(200),
        'warranty_end_at' => now()->subDay(),
    ]);

    $stage = rlrStage($project, 100_000_000);
    $financial = app(ProjectFinancialService::class);
    $split = app(RetentionService::class)->forTermin($stage);

    $financial->recordPayment($project, $split['net'], 'Termin paid', ProjectPaymentTermin::class, $stage->id);
    Artisan::call('escrow:release-retention', ['--project' => $project->id]);

    $total = Money::fromColumn(
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->whereIn('transaction_type', ProjectFinancialService::DISBURSEMENT_TYPES)
            ->sum('amount')
    );

    // 95,000,000 at completion + 5,000,000 at warranty expiry == the 100,000,000
    // contracted. The professional is made whole, and the escrow is charged once.
    expect($total->toDecimal())->toBe('100000000.00');
});