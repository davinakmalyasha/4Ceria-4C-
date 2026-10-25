<?php

use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectBudgetTransaction;
use App\Models\User;
use App\Support\LedgerReference;
use App\Support\Money;
use App\Services\ProjectFinancialService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/*
|--------------------------------------------------------------------------
| The ledger's reference spelling must be canonical, and the payment counted once
|--------------------------------------------------------------------------
|
| Regression suite for the CRITICAL money defect found in the audit: a live
| escrow was understated by Rp 5 500 000 because one payment had been booked
| TWICE under two spellings of the same model.
|
| THE DEFECT
| ----------
| `project_budget_transactions.reference_model` is part of the unique index
| that makes the ledger idempotent:
|
|     budget_tx_reference_unique (project_id, reference_model, reference_id,
|                                 transaction_type)
|
| That index can only dedupe two writes of the same movement if both spell the
| model the SAME way. They did not:
|
|     id 5619  'ProjectAddendum'             payment  Rp 5 500 000
|     id 5918  'App\Models\ProjectAddendum'   payment  Rp 5 500 000
|
| Same project, same addendum, same type, same amount — one payment, booked
| twice. Because the strings differ, the index could not see them as the same
| movement, and `paidTotalMoney()` — which sums every disbursement row —
| counted Rp 5 500 000 twice.
|
| The normalisation that would have prevented this lived INSIDE
| `ProjectFinancialService::recordTransaction()`, so it protected the writers
| that went through that method and nothing else.
|
| THE RULE NOW
| ------------
|   1. A ledger reference is spelled `App\Models\<ShortName>`, always.
|      `ProjectBudgetTransaction` enforces it on every save, so no code path
|      can write a different spelling.
|   2. A payment is counted ONCE, whatever spelling its writer used.
|   3. The database refuses a second row for the same movement, even if it is
|      written outside the application.
|   4. The duplicate detector sees across spellings — it used to group by the
|      raw string, which is how the live duplicate went unnoticed.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function ledgerOwner(): User
{
    return User::create([
        'name' => 'Ledger Owner',
        'username' => 'lo_'.uniqid(),
        'email' => 'lo_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'user',
    ]);
}

function ledgerProject(User $owner): Project
{
    return Project::create([
        'title' => 'A ledger project',
        'user_id' => $owner->id,
        'budget' => 500_000_000,
        'status' => 'in_progress',
    ]);
}

it('canonicalises a short reference name', function () {
    expect(LedgerReference::canonical('ProjectAddendum'))->toBe('App\Models\ProjectAddendum')
        ->and(LedgerReference::canonical('App\Models\ProjectAddendum'))->toBe('App\Models\ProjectAddendum')
        ->and(LedgerReference::canonical(null))->toBeNull()
        ->and(LedgerReference::canonical(''))->toBeNull();
});

it('does not rewrite a class that lives outside App\Models', function () {
    // Silently moving it into App\Models would point the reference at a class
    // that does not exist.
    expect(LedgerReference::canonical('App\Other\Thing'))->toBe('App\Other\Thing');
});

it('stores a short reference name canonically, whatever the writer used', function () {
    $owner = ledgerOwner();
    $project = ledgerProject($owner);

    $row = ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'payment',
        'amount' => 5_500_000,
        'title' => 'A payment written with a short spelling',
        'reference_model' => 'ProjectAddendum',
        'reference_id' => 934,
        'transaction_date' => now(),
    ]);

    expect($row->fresh()->reference_model)->toBe('App\Models\ProjectAddendum');
});

it('counts a payment once, whichever spelling wrote it', function () {
    $owner = ledgerOwner();
    $project = ledgerProject($owner);
    $service = app(ProjectFinancialService::class);
    $money = Money::of(5_500_000);

    // The first write uses the SHORT spelling.
    $first = $service->recordPayment($project, $money, 'Payment', 'ProjectAddendum', 934);

    // The second write uses the FQCN — the same movement, retried.
    $second = $service->recordPayment($project, $money, 'Payment', 'App\Models\ProjectAddendum', 934);

    expect($first)->toBeTrue()
        ->and($second)->toBeTrue();

    $rows = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'payment')
        ->get();

    expect($rows)->toHaveCount(1)
        ->and($service->paidTotalMoney($project->id)->toDecimal())->toBe('5500000.00');
});

it('lets the DATABASE refuse a duplicate that bypasses the application', function () {
    $owner = ledgerOwner();
    $project = ledgerProject($owner);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'payment',
        'amount' => 5_500_000,
        'title' => 'The original',
        'reference_model' => 'App\Models\ProjectAddendum',
        'reference_id' => 934,
        'transaction_date' => now(),
    ]);

    // A second row for the same movement, written with a raw statement so
    // that neither the model guard nor the service's exists() check runs.
    // The unique index has to be the last line of defence.
    expect(fn () => DB::insert(
        <<<'SQL'
            INSERT INTO project_budget_transactions
                (project_id, transaction_type, amount, title, reference_model, reference_id, transaction_date, created_at, updated_at)
            VALUES (?, 'payment', 5500000.00, 'A raw duplicate', ?, 934, NOW(), NOW(), NOW())
        SQL,
        [$project->id, 'App\Models\ProjectAddendum']
    ))->toThrow(Illuminate\Database\UniqueConstraintViolationException::class);
});

it('does not count a voided row, and says why it was voided', function () {
    $owner = ledgerOwner();
    $project = ledgerProject($owner);

    $kept = ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'payment',
        'amount' => 5_500_000,
        'title' => 'The kept movement',
        'reference_model' => 'App\Models\ProjectAddendum',
        'reference_id' => 934,
        'transaction_date' => now(),
    ]);

    $voided = ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'payment',
        // A voided row is a movement that was recorded and then found to
        // duplicate another. The migration zeroes the amount and nulls the
        // reference id, so it stops being a duplicate AND stops counting.
        'amount' => 0,
        'title' => '[VOIDED — duplicate ledger reference #'.$kept->id.'] The duplicate movement',
        'reference_model' => 'App\Models\ProjectAddendum',
        'reference_id' => null,
        'transaction_date' => now(),
        'voided_at' => now(),
        'voided_duplicate_of_id' => $kept->id,
        'voided_original_amount' => 5_500_000,
    ]);

    // The voided row keeps its evidence but contributes nothing to the figure.
    expect($voided->fresh()->voided_original_amount)->toBe('5500000.00')
        ->and($voided->fresh()->voided_duplicate_of_id)->toBe($kept->id)
        ->and(app(ProjectFinancialService::class)->paidTotalMoney($project->id)->toDecimal())->toBe('5500000.00');
});

it('detects a duplicate across spellings, and ignores a voided one', function () {
    $owner = ledgerOwner();
    $project = ledgerProject($owner);

    // Two rows, two spellings — the live defect.
    //
    // The reference is BOUND, not inlined: a class name contains backslashes,
    // and MySQL's string-literal parser eats them. `'App\Models\X'` in a PHP
    // double-quoted string arrives as `App\Models\X`, and MySQL then reads
    // `\M` as `M` — so the value lands as `AppModelsX`. A test that
    // misspells the very thing it is testing is worse than no test.
    $insert = <<<'SQL'
        INSERT INTO project_budget_transactions
            (project_id, transaction_type, amount, title, reference_model, reference_id, transaction_date, created_at, updated_at)
        VALUES (?, 'payment', 5500000.00, ?, ?, 934, NOW(), NOW(), NOW())
    SQL;

    DB::insert($insert, [$project->id, 'Short spelling', 'ProjectAddendum']);
    DB::insert($insert, [$project->id, 'FQCN spelling', 'App\Models\ProjectAddendum']);

    $exitCode = Artisan::call('money:detect-duplicates');
    $output = Artisan::output();

    expect($exitCode)->toBe(1)
        ->and($output)->toContain('ProjectAddendum#934')
        ->and($output)->toContain('appears');

    // A voided row is a FIXED duplicate, not a live fault: the detector must
    // not report the cleanup as the problem.
    DB::update(
        'UPDATE project_budget_transactions SET voided_at = NOW(), amount = 0, reference_id = NULL WHERE project_id = ? AND reference_model = ?',
        [$project->id, 'ProjectAddendum']
    );

    expect(Artisan::call('money:detect-duplicates'))->toBe(0);
});

it('keeps a refund pointed at the payment it reverses', function () {
    $owner = ledgerOwner();
    $project = ledgerProject($owner);

    $payment = ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'payment',
        'amount' => 5_500_000,
        'title' => 'Payment',
        'reference_model' => 'ProjectAddendum',
        'reference_id' => 934,
        'transaction_date' => now(),
    ]);

    expect($payment->fresh()->reference_model)->toBe('App\Models\ProjectAddendum');

    $refund = ProjectBudgetTransaction::create([
        'project_id' => $project->id,
        'transaction_type' => 'refund',
        'amount' => -1_000_000,
        'title' => 'Refund',
        'reference_model' => 'ProjectDispute',
        'reference_id' => 77,
        'reverses_model' => 'ProjectAddendum',
        'reverses_id' => 934,
        'transaction_date' => now(),
    ]);

    expect($refund->fresh()->reverses_model)->toBe('App\Models\ProjectAddendum');
});
