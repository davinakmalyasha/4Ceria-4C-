<?php

use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Services\ProjectFinancialService;
use App\Services\RetentionService;
use App\Support\Money;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A platform fee spends the escrow exactly once
|--------------------------------------------------------------------------
|
| THE TWO BUGS, WHICH COMPOUNDED
| ------------------------------
|
| `deductBudget()` had two independent problems, and fixing only one of them
| would have made the other WORSE:
|
|   1. `DISBURSEMENT_TYPES` was `['payment', 'refund']`, so a `platform_fee` row
|      was written to the ledger but never subtracted by `paidTotalMoney()`.
|      `availableMoney()` therefore reported a balance that ignored every fee
|      ever charged.
|
|   2. The ceiling guard was `if ($type !== 'payment')`, so a `platform_fee` took
|      the `else` branch and DECREMENTED `projects.budget`.
|
| Fixing (1) alone -- adding the fee to the disbursement types -- would have
| charged the client twice for one movement: once by lowering the ceiling, and
| again by `available` subtracting the fee from that lowered ceiling. On a
| 100,000,000 project with a 2% fee, the reported ceiling would read 98,000,000
| and the reported available balance 97,600,000, for a 2,000,000 fee.
|
| THIS IS WHY `CEILING_NEUTRAL_TYPES` EXISTS
| ------------------------------------------
| "Spends the ceiling" and "moves the ceiling" are different questions, and the
| second was being inferred from the first. They are now separate constants:
|
|   CEILING_NEUTRAL_TYPES  payment, refund, platform_fee, retention_release
|                          -- counted by `available`, do not touch `budget`
|   structural             deposit (raises), adjustment_down (lowers)
|
| NOT COVERED: that the fee is OFF by default. `PlatformFeeTest` owns that.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    config([
        'escrow.retention_percent' => 5,
        'escrow.platform_fee_percent' => 2,
        'escrow.warranty_days' => 180,
    ]);
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function pfqOwner(string $tag)
{
    return \App\Models\User::create([
        'name' => "Owner $tag",
        'username' => "pfq_$tag" . uniqid(),
        'email' => "pfq_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'user',
    ]);
}

function pfqProject(string $tag, int $budget = 100_000_000): array
{
    $owner = pfqOwner($tag);

    $project = \App\Models\Project::create([
        'title' => "Job $tag",
        'user_id' => $owner->id,
        'budget' => $budget,
        'status' => 'in_progress',
    ]);

    return [$owner, $project];
}

it('does not move the escrow ceiling when it charges a fee', function () {
    [$owner, $project] = pfqProject('ceiling');

    $stage = ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'label' => 'Stage one',
        'percentage' => 100,
        'amount' => 10_000_000,
        'role_type' => 'kontraktor',
        'status' => 'pending',
    ]);

    $financial = app(ProjectFinancialService::class);
    $net = app(RetentionService::class)->forTermin($stage)['net'];

    $financial->recordPayment($project, $net, 'Termin paid', ProjectPaymentTermin::class, $stage->id);

    // A fee row exists...
    $fees = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'platform_fee')
        ->get();
    expect($fees)->toHaveCount(1);

    // ...and the ceiling is untouched, because the fee was spent from inside it
    // rather than carved out of it.
    expect(Money::fromColumn($project->fresh()->budget)->toDecimal())->toBe('100000000.00');
});

it('subtracts the fee from the available balance exactly once', function () {
    [$owner, $project] = pfqProject('available');

    $stage = ProjectPaymentTermin::create([
        'project_id' => $project->id,
        'label' => 'Stage one',
        'percentage' => 100,
        'amount' => 10_000_000,
        'role_type' => 'kontraktor',
        'status' => 'pending',
    ]);

    $financial = app(ProjectFinancialService::class);
    $split = app(RetentionService::class)->forTermin($stage);
    $financial->recordPayment($project, $split['net'], 'Termin paid', ProjectPaymentTermin::class, $stage->id);

    $net = Money::fromColumn($split['net']->toDecimal());
    $fee = Money::fromColumn(
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->where('transaction_type', 'platform_fee')
            ->value('amount')
    );

    expect($fee->toDecimal())->toBe('190000.00');

    // 100,000,000 ceiling - 9,500,000 net paid - 190,000 fee = 90,310,000.
    //
    // A double-count (ceiling lowered AND the fee subtracted from it) would read
    // 90,120,000 here; a missing subtraction would read 90,500,000. The asserted
    // figure sits between the two, so it catches either error rather than one.
    expect($financial->availableMoney($project->fresh())->toDecimal())->toBe('90310000.00');
});

it('counts a fee in the escrow total but not in a professional earnings', function () {
    // The two questions are genuinely different and now have separate answers.
    //
    //   escrow total        -- how much left the account, fee INCLUDED
    //   professional earned -- how much reached the professional, fee EXCLUDED
    //
    // Conflating them would either overstate the owner's spending or inflate a
    // PUBLIC `client_history` figure with the platform's own revenue.
    expect(ProjectFinancialService::DISBURSEMENT_TYPES)
        ->toContain('platform_fee');

    expect(ProjectFinancialService::PROFESSIONAL_EARNINGS_TYPES)
        ->not->toContain('platform_fee');

    // Retention reached the professional, so it belongs in both.
    expect(ProjectFinancialService::PROFESSIONAL_EARNINGS_TYPES)
        ->toContain('retention_release');
});

it('classifies every ledger type as either ceiling-neutral or structural', function () {
    // A new type that lands in neither list is a silent money bug, so the two
    // sets are asserted to be exhaustive over what the ledger can hold.
    $structural = ['deposit', 'adjustment_down'];

    $known = array_unique(array_merge(
        ProjectFinancialService::CEILING_NEUTRAL_TYPES,
        $structural
    ));

    sort($known);
    $expected = ['adjustment_down', 'deposit', 'payment', 'platform_fee', 'refund', 'retention_release'];
    sort($expected);

    expect($known)->toBe($expected);
});
