<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| The escrow invariants must be checkable from outside the app
|--------------------------------------------------------------------------
|
| Regression suite for C3 (`php artisan money:reconcile`).
|
| WHY A DIAGNOSTIC
| ----------------
| Every figure the application shows is derived from the same ledger. So if the
| ledger disagrees with `projects.budget`, the entire UI is SELF-CONSISTENTLY
| WRONG and no amount of reading the app reveals it. The invariants can only be
| checked from outside.
|
* The command is read-only and is therefore tested by SEEDING DELIBERATE DRIFT
 * and asserting each check fires. A test that ran against a clean database would
 * only prove the command prints "none", which is what it does on an empty
 * dev database — and that is not evidence of anything.
|
| A NOTE ON THIS FILE'S OWN HISTORY
| ---------------------------------
| It was written against an empty database first, which is why several
| assertions below initially "passed" for the wrong reason.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function reconcileProject(string $tag, int|float $budget = 500_000_000, array $overrides = []): Project
{
    $owner = User::create([
        'name' => "RO {$tag}", 'username' => "ro_$tag" . uniqid(),
        'email' => "ro_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    return Project::create(array_merge([
        'title' => "Reconcile {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
    ], $overrides));
}

/**
 * Run the command and capture its output.
 *
 * `Artisan::call()` + `Artisan::output()`, not `$this->artisan()->run()`.
 * The `run()` form does not populate the output buffer that `output()` reads,
 * so every assertion below silently saw an empty string and failed for the
 * wrong reason — a test that cannot fail correctly is worse than no test.
 *
 * Safe against the harness transaction: `Artisan::call` uses the same
 * connection, so it sees the rows the test wrote and rolls back with them.
 */
function reconcile(array $options = []): string
{
    \Illuminate\Support\Facades\Artisan::call('money:reconcile', $options);

    return \Illuminate\Support\Facades\Artisan::output();
}

it('reports clean on a correctly reconciled project', function () {
    $project = reconcileProject('c3a', 200_000_000);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 200_000_000, 'title' => 'Opening project budget',
        'transaction_date' => now(),
    ]);

    expect(reconcile())->toContain('All escrow invariants hold.');
});

it('catches a ceiling that no longer matches the ledger', function () {
    // The drift B10 made possible and this command now makes visible: the
    // column says 200,000,000 while the ledger accounts for 150,000,000.
    $project = reconcileProject('c3b', 200_000_000);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 150_000_000, 'title' => 'Opening project budget',
        'transaction_date' => now(),
    ]);

    // Silently raise the ceiling — what the pre-B10 update endpoint allowed.
    DB::table('projects')->where('id', $project->id)->update(['budget' => 200_000_000]);

    $output = reconcile(['--details' => true]);

    expect($output)->toContain('1. Ceiling matches the ledger')
        ->and($output)->toContain('violation')
        ->and($output)->toContain('50000000.00'); // the drift
});

it('does not count a payment as a ceiling movement', function () {
    // A payment is deducted from `available`, NOT from the ceiling. Counting it
    // here would flag every correctly-funded project as drifted.
    $project = reconcileProject('c3c', 200_000_000);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 200_000_000, 'title' => 'Opening', 'transaction_date' => now(),
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 80_000_000, 'title' => 'Payment',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);

    expect(reconcile())->toContain('All escrow invariants hold.');
});

it('catches a negative available balance', function () {
    $project = reconcileProject('c3d', 10_000_000);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 10_000_000, 'title' => 'Opening', 'transaction_date' => now(),
    ]);
    // A disbursement larger than the ceiling. `deductBudget` would refuse this,
    // so reaching the state proves a direct column write — which is exactly why
    // the invariant is checked rather than assumed.
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 25_000_000, 'title' => 'Impossible payment',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => 1,
        'transaction_date' => now(),
    ]);

    $output = reconcile(['--details' => true]);

    expect($output)->toContain('2. Available balance is not negative')
        ->and($output)->not->toContain('All escrow invariants hold.');
});

it('flags a refund with no actor, but not a system-initiated payment', function () {
    // The distinction the check exists for. An anonymous payment is a
    // legitimate scheduled movement and must NOT fail the run; an anonymous
    // REFUND is an attribution gap, because refunds are issued by an
    // arbitrator.
    $project = reconcileProject('c3e', 200_000_000);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 200_000_000, 'title' => 'Opening',
        'transaction_date' => now(), 'actor_user_id' => $project->user_id,
        'actor_role' => 'user',
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'payment',
        'amount' => 80_000_000, 'title' => 'System settlement',
        'reference_model' => 'App\Models\ProjectPaymentTermin', 'reference_id' => 1,
        'transaction_date' => now(),
        // no actor: expected
    ]);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'refund',
        'amount' => -10_000_000, 'title' => 'Unattributable refund',
        'reference_model' => 'App\Models\ProjectDispute', 'reference_id' => 1,
        'transaction_date' => now(),
        // no actor: a gap
    ]);

    $output = reconcile(['--details' => true]);

    expect($output)->toContain('3. Disbursements name an actor')
        ->and($output)->toContain('expected for system-initiated movements')
        ->and($output)->not->toContain('All escrow invariants hold.');
});

it('catches a plan that exceeds its negotiated contract', function () {
    $owner = User::create([
        'name' => 'RC', 'username' => 'rc' . uniqid(),
        'email' => 'rc' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pro = User::create([
        'name' => 'RD', 'username' => 'rd' . uniqid(),
        'email' => 'rd' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'Arsitek']);
    $project = Project::create([
        'title' => 'Plan drift', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 500_000_000, 'title' => 'Opening', 'transaction_date' => now(),
    ]);

    BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 50_000_000, 'calculated_total' => 50_000_000,
        'proposal' => 'P', 'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    // Pre-C1 data: a plan far beyond the negotiated fee.
    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek', 'recipient_id' => $pro->id,
        'label' => 'Over-committed', 'percentage' => 100, 'amount' => 200_000_000,
        'retention_amount' => 0, 'net_amount' => 200_000_000, 'status' => 'pending',
    ]);

    $output = reconcile(['--details' => true]);

    expect($output)->toContain('4. Plans match the negotiated contract')
        ->and($output)->toContain('arsitek')
        ->and($output)->not->toContain('All escrow invariants hold.');
});

it('flags retention held past warranty expiry', function () {
    $project = reconcileProject('c3g', 500_000_000, [
        'warranty_end_at' => now()->subDay(),
    ]);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 500_000_000, 'title' => 'Opening', 'transaction_date' => now(),
    ]);

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'kontraktor',
        'label' => 'Retention', 'percentage' => 100, 'amount' => 500_000_000,
        'retention_amount' => 25_000_000, 'net_amount' => 475_000_000,
        'status' => 'paid',
    ]);

    // `paid` is excluded by the check, so use an unreleased state.
    ProjectPaymentTermin::where('project_id', $project->id)->update(['status' => 'pending']);

    $output = reconcile(['--details' => true]);

    expect($output)->toContain('5. Retention is released, not just recorded')
        ->and($output)->not->toContain('All escrow invariants hold.');
});

it('does not flag retention while the warranty is still running', function () {
    $project = reconcileProject('c3h', 500_000_000, [
        'warranty_end_at' => now()->addMonths(6),
    ]);

    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 500_000_000, 'title' => 'Opening', 'transaction_date' => now(),
    ]);

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'kontraktor',
        'label' => 'Retention', 'percentage' => 100, 'amount' => 500_000_000,
        'retention_amount' => 25_000_000, 'net_amount' => 475_000_000,
        'status' => 'pending',
    ]);

    expect(reconcile())->toContain('All escrow invariants hold.');
});

it('exits non-zero when an invariant is violated', function () {
    $project = reconcileProject('c3i', 100_000_000);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 50_000_000, 'title' => 'Opening', 'transaction_date' => now(),
    ]);

    // Force a drift, then assert the exit code. A diagnostic that reports
    // findings but exits 0 cannot be wired into a gate.
    DB::table('projects')->where('id', $project->id)->update(['budget' => 100_000_000]);

    $exit = \Illuminate\Support\Facades\Artisan::call('money:reconcile');

    expect($exit)->toBe(1);
});

it('writes nothing, so running it is always safe', function () {
    $project = reconcileProject('c3j', 100_000_000);
    ProjectBudgetTransaction::create([
        'project_id' => $project->id, 'transaction_type' => 'deposit',
        'amount' => 50_000_000, 'title' => 'Opening', 'transaction_date' => now(),
    ]);
    DB::table('projects')->where('id', $project->id)->update(['budget' => 100_000_000]);

    $before = [
        'budget' => (float) Project::find($project->id)->budget,
        'ledger' => ProjectBudgetTransaction::where('project_id', $project->id)->count(),
    ];

    reconcile(['--details' => true]);

    $after = [
        'budget' => (float) Project::find($project->id)->budget,
        'ledger' => ProjectBudgetTransaction::where('project_id', $project->id)->count(),
    ];

    // Deliberately no `--fix`. A repair tool for the escrow needs an owner
    // decision about WHICH figure is correct; guessing on someone's money is
    // worse than reporting.
    expect($after)->toBe($before);
});

it('restricts every check to the requested project', function () {
    $one = reconcileProject('c3k1', 100_000_000);
    $two = reconcileProject('c3k2', 100_000_000);

    foreach ([$one, $two] as $project) {
        ProjectBudgetTransaction::create([
            'project_id' => $project->id, 'transaction_type' => 'deposit',
            'amount' => 100_000_000, 'title' => 'Opening', 'transaction_date' => now(),
        ]);
    }

    // Drift ONLY on project two.
    DB::table('projects')->where('id', $two->id)->update(['budget' => 90_000_000]);

    // Scoped to the clean project: no findings.
    expect(reconcile(['--project' => $one->id, '--details' => true]))
        ->toContain('All escrow invariants hold.');

    // Scoped to the drifted one: a finding.
    expect(reconcile(['--project' => $two->id, '--details' => true]))
        ->not->toContain('All escrow invariants hold.');
});