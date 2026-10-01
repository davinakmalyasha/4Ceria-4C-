<?php

use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectWarrantyClaim;
use App\Models\User;
use App\Services\ProjectFinancialService;
use App\Services\RetentionService;
use App\Support\Money;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Retention is held, then released when it is genuinely releasable
|--------------------------------------------------------------------------
|
| Feature tests for D1 (retention) and D2 (release).
|
| THE STATE THIS REPLACES
| -----------------------
| `project_payment_termins` has carried `retention_amount` and `net_amount` since
| they were added, and had exactly ONE write site:
|
|     'retention_amount' => 0,
|     'net_amount'       => $changeOrder->cost_impact,
|
| Retention was a display-only fiction. Nothing was held, nothing could be
| released, and `money:reconcile` was written to report precisely that ("has one
| write site and it hardcodes 0").
|
| WHAT RETENTION IS NOT
| ---------------------
| A discount. The professional is owed the FULL `amount`; retention changes only
#  WHEN part of it is disbursable:
#
#     amount           gross obligation, unchanged
#     retention_amount held until the warranty expires
#     net_amount       payable now
#
# so `retention_amount + net_amount === amount` always. That invariant is what makes
# it safe to add money arithmetic to, and it is asserted in every split test.
|
| THE RELEASE RULES
# -----------------
#  1. The warranty must have EXPIRED, read from the RECORDED `warranty_end_at`
#     rather than recomputed, so the date the client was shown on the BAST is the
#     date money moves against.
#  2. No claim may still be CONTESTING it. `open` and `fixing` block; `resolved`
#     and `closed` do not, because that work was done and settled.
#  3. The write goes through ProjectFinancialService, so the release is in the
#     same ledger as everything else.
#  4. Idempotent: a second run must not pay twice. Every replica runs the
#     schedule, so this is not theoretical.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    config([
        'escrow.retention_percent' => 5,
        'escrow.warranty_days' => 180,
        'escrow.blocking_claim_states' => ['open', 'fixing'],
    ]);
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function retOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "o_$tag" . uniqid(),
        'email' => "o_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function retProject(string $tag, ?string $warrantyEnd = null): array
{
    $owner = retOwner($tag);

    $project = Project::create([
        'title' => "Job $tag", 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
        'warranty_start_at' => $warrantyEnd ? now()->subDays(200) : null,
        'warranty_end_at' => $warrantyEnd,
    ]);

    return [$owner, $project];
}

function retStage(Project $project, float $amount, array $columns = []): ProjectPaymentTermin
{
    return ProjectPaymentTermin::create(array_merge([
        'project_id' => $project->id,
        'label' => 'Retention stage',
        'percentage' => 100,
        'amount' => $amount,
        'role_type' => 'kontraktor',
        'status' => 'pending',
    ], $columns));
}

// ---------------------------------------------------------------------------
// D1. The split
// ---------------------------------------------------------------------------

it('splits a stage so retention plus net equals the gross EXACTLY', function () {
    $split = app(RetentionService::class)->split(Money::fromColumn(100_000_000));

    expect((float) $split['retention']->toDecimal())->toBe(5000000.0)
        ->and((float) $split['net']->toDecimal())->toBe(95000000.0)
        ->and(
            (float) $split['retention']->add($split['net'])->toDecimal()
        )->toBe(100000000.0);
});

it('keeps the two halves summing to the gross for awkward amounts', function (float $amount) {
    $split = app(RetentionService::class)->split(Money::fromColumn($amount));

    expect((float) $split['retention']->add($split['net'])->toDecimal())->toBe((float) $amount);
})->with([
    1, 3, 7, 99, 101, 333, 999, 100_001, 12_345.67, 1_234_567.89, 999_999_999.99,
]);

it('never puts the rounding remainder on the wrong side', function () {
    // 5% of 101 is 5.05 exactly, but 5% of 99 is 4.95 -- the kind of figure where a
    // float multiply drifts and one side silently gains a sen. The split computes
    // `net` as gross MINUS retention so the sum is exact by construction.
    foreach ([99, 101, 333, 999] as $amount) {
        $split = app(RetentionService::class)->split(Money::fromColumn($amount));

        expect((float) $split['retention']->add($split['net'])->toDecimal())->toBe((float) $amount);
    }
});

it('honours a configurable percentage', function () {
    config(['escrow.retention_percent' => 10]);

    $split = app(RetentionService::class)->split(Money::fromColumn(100_000_000));

    expect((float) $split['retention']->toDecimal())->toBe(10000000.0);
});

it('holds nothing when retention is disabled', function () {
    config(['escrow.retention_percent' => 0]);

    $split = app(RetentionService::class)->split(Money::fromColumn(100_000_000));

    expect((float) $split['retention']->toDecimal())->toBe(0.0)
        ->and((float) $split['net']->toDecimal())->toBe(100000000.0);
});

it('holds nothing for a zero-value stage', function () {
    $split = app(RetentionService::class)->split(Money::fromColumn(0));

    expect((float) $split['retention']->toDecimal())->toBe(0.0)
        ->and((float) $split['net']->toDecimal())->toBe(0.0);
});

it('fills the split on EVERY stage, without the caller asking', function () {
    // The bug was one of six creation sites remembering to write the column --
    // and writing 0. A model hook means a new site cannot forget.
    [$owner, $project] = retProject('auto');

    $stage = retStage($project, 200_000_000);

    expect((float) $stage->retention_amount)->toBe(10000000.0)
        ->and((float) $stage->net_amount)->toBe(190000000.0)
        ->and(
            (float) $stage->retention_amount + (float) $stage->net_amount
        )->toBe(200000000.0);
});

it('respects a caller that deliberately sets no retention', function () {
    // A change order is extra scope, not retention-bearing.
    [$owner, $project] = retProject('explicit');

    $stage = ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'Change order',
        'percentage' => 100, 'amount' => 5_000_000,
        'role_type' => 'kontraktor', 'status' => 'pending',
        'retention_amount' => 0, 'net_amount' => 5_000_000,
    ]);

    expect((float) $stage->retention_amount)->toBe(0.0)
        ->and((float) $stage->net_amount)->toBe(5000000.0);
});

it('reads the warranty window from config rather than a hardcoded 180', function () {
    config(['escrow.warranty_days' => 90]);

    expect(app(RetentionService::class)->warrantyDays())->toBe(90);
});

// ---------------------------------------------------------------------------
// D2. The release
// ---------------------------------------------------------------------------

it('does NOT release before the warranty expires', function () {
    [, $project] = retProject('early', now()->addDays(10));

    retStage($project, 100_000_000);

    Artisan::call('escrow:release-retention');

    expect(ProjectPaymentTermin::where('retention_released_at', '!=', null)->count())->toBe(0);
});

it('does NOT release a project whose warranty never started', function () {
    [, $project] = retProject('never');

    retStage($project, 100_000_000);

    Artisan::call('escrow:release-retention');

    expect(ProjectPaymentTermin::where('retention_released_at', '!=', null)->count())->toBe(0);
});

it('releases the held balance once the warranty expires', function () {
    [$owner, $project] = retProject('expired', now()->subDay());

    $stage = retStage($project, 100_000_000);

    Artisan::call('escrow:release-retention');

    $fresh = $stage->fresh();

    expect($fresh->retention_released_at)->not->toBeNull()
        ->and((float) $fresh->retention_released_amount)->toBe(5000000.0);

    // And it is in the LEDGER, not just stamped on the row.
    $rows = $project->fresh()->budgetTransactions
        ->filter(fn ($t) => str_contains((string) $t->title, 'Retention released'));

    expect($rows)->toHaveCount(1)
        ->and((float) $rows->first()->amount)->toBe(5000000.0);
});

it('is IDEMPOTENT: a second run pays nothing more', function () {
    [$owner, $project] = retProject('twice', now()->subDay());

    $stage = retStage($project, 100_000_000);

    Artisan::call('escrow:release-retention');
    $firstReleasedAt = $stage->fresh()->retention_released_at;

    Artisan::call('escrow:release-retention');

    $rows = $project->fresh()->budgetTransactions
        ->filter(fn ($t) => str_contains((string) $t->title, 'Retention released'));

    expect($rows)->toHaveCount(1)
        ->and($stage->fresh()->retention_released_at->toDateTimeString())
        ->toBe($firstReleasedAt->toDateTimeString());
});

it('does NOT release while a claim is still OPEN', function () {
    [$owner, $project] = retProject('blocked', now()->subDay());

    $stage = retStage($project, 100_000_000);

    ProjectWarrantyClaim::create([
        'project_id' => $project->id, 'reporter_id' => $owner->id,
        'title' => 'Leaking roof', 'description' => 'Still open',
        'status' => 'open',
    ]);

    Artisan::call('escrow:release-retention');

    expect($stage->fresh()->retention_released_at)->toBeNull()
        ->and(ProjectPaymentTermin::where('retention_released_at', '!=', null)->count())->toBe(0);
});

it('does NOT release while a claim is still being FIXED', function () {
    [$owner, $project] = retProject('fixing', now()->subDay());

    $stage = retStage($project, 100_000_000);

    ProjectWarrantyClaim::create([
        'project_id' => $project->id, 'reporter_id' => $owner->id,
        'title' => 'Cracked wall', 'description' => 'Repair underway',
        'status' => 'fixing',
    ]);

    Artisan::call('escrow:release-retention');

    expect($stage->fresh()->retention_released_at)->toBeNull();
});

it('DOES release once every claim is resolved', function () {
    // `resolved` must NOT block: that work was done and its cost settled, so
    // holding the retention for it would strand money nobody contests.
    [$owner, $project] = retProject('resolved', now()->subDay());

    $stage = retStage($project, 100_000_000);

    ProjectWarrantyClaim::create([
        'project_id' => $project->id, 'reporter_id' => $owner->id,
        'title' => 'Fixed door', 'description' => 'Replaced',
        'status' => 'resolved', 'resolved_at' => now(),
    ]);

    Artisan::call('escrow:release-retention');

    expect($stage->fresh()->retention_released_at)->not->toBeNull();
});

it('DOES release once every claim is CLOSED', function () {
    [$owner, $project] = retProject('closed', now()->subDay());

    $stage = retStage($project, 100_000_000);

    ProjectWarrantyClaim::create([
        'project_id' => $project->id, 'reporter_id' => $owner->id,
        'title' => 'Closed snag', 'description' => 'Signed off',
        'status' => 'closed', 'resolved_at' => now(),
    ]);

    Artisan::call('escrow:release-retention');

    expect($stage->fresh()->retention_released_at)->not->toBeNull();
});

it('writes nothing in --dry-run', function () {
    [$owner, $project] = retProject('dry', now()->subDay());

    $stage = retStage($project, 100_000_000);

    Artisan::call('escrow:release-retention', ['--dry-run' => true]);

    expect($stage->fresh()->retention_released_at)->toBeNull()
        ->and($project->fresh()->budgetTransactions->count())->toBe(0);
});

it('leaves a stage with no retention alone', function () {
    [$owner, $project] = retProject('nohold', now()->subDay());

    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'label' => 'No retention',
        'percentage' => 100, 'amount' => 5_000_000,
        'role_type' => 'kontraktor', 'status' => 'pending',
        'retention_amount' => 0, 'net_amount' => 5_000_000,
    ]);

    Artisan::call('escrow:release-retention');

    expect(ProjectPaymentTermin::where('retention_released_at', '!=', null)->count())->toBe(0);
});

it('reports the total held on a project', function () {
    [, $project] = retProject('total');

    retStage($project, 100_000_000);
    retStage($project, 50_000_000);

    expect((float) app(RetentionService::class)->totalHeld($project)->toDecimal())->toBe(7500000.0);
});

it('reports nothing releasable while a claim blocks, without releasing', function () {
    [$owner, $project] = retProject('report', now()->subDay());

    retStage($project, 100_000_000);

    ProjectWarrantyClaim::create([
        'project_id' => $project->id, 'reporter_id' => $owner->id,
        'title' => 'Open snag', 'description' => 'x', 'status' => 'open',
    ]);

    $retention = app(RetentionService::class);

    // The balance is HELD, but not releasable -- two different answers, and the
    // operator needs the difference when asking why money has not moved.
    expect((float) $retention->totalHeld($project)->toDecimal())->toBe(5000000.0)
        ->and((float) $retention->releasableOn($project)->toDecimal())->toBe(0.0);
});