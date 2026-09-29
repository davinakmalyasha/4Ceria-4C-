<?php

use App\Models\Project;
use App\Models\ProjectExternalVendor;
use App\Models\ProjectBudgetTransaction;
use App\Models\User;
use App\Services\ProjectFinancialService;
use App\Support\Money;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| External vendor import must respect the escrow
|--------------------------------------------------------------------------
|
| Regression suite for B5.
|
| THE BUG
| -------
| `ProjectPhaseService::importExternalVendor` debited the escrow by hand:
|
|     $oldBudget = $project->budget;
|     $project->update(['budget' => max(0, $oldBudget - $vendor->agreed_fee)]);
|     ProjectBudgetTransaction::create([... 'adjustment_down' ...]);
|
| Bypassing `ProjectFinancialService::deductBudget()` cost it all three
| guarantees that service exists to provide:
|
|   1. NO AFFORDABILITY CHECK — the import succeeded no matter whether the
|      escrow could cover the agreed fee.
|   2. THE MISSING CHECK WAS MASKED BY `max(0, ...)`. An import that overran
|      the budget drove `budget` to 0 rather than failing, so the overdraft was
|      invisible: the ledger recorded a fee the ceiling no longer reflected,
|      and the owner was never told.
|   3. NO ROW LOCK — the read-modify-write of `budget` had a TOCTOU window, so
|      two concurrent imports could both spend the same headroom.
|
| WHAT IS *NOT* WRONG HERE (checked, so nobody "fixes" it)
| ------------------------------------------------------
| The accounting is correct. `available` is `budget - sum(payment, refund)`,
| and `deductBudget()` for a non-`payment`, non-`deposit` type decrements the
| ceiling AND writes a matching positive row. So `adjustment_down` moves the
| ceiling without being counted as disbursed money. Importing a vendor records
| a COMMITMENT, not a completed transfer, so it must NOT reduce `available`
| and must NOT look like a disbursement to dispute arbitration. The type stays
| `adjustment_down`.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: Project}
 */
function vendorImportScenario(string $tag, int|float $budget): array
{
    $owner = User::create([
        'name' => "VO {$tag}", 'username' => "vo_$tag" . uniqid(),
        'email' => "vo_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $stranger = User::create([
        'name' => "VS {$tag}", 'username' => "vs_$tag" . uniqid(),
        'email' => "vs_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $project = Project::create([
        'title' => "Vendor {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
    ]);

    return [$owner, $stranger, $project];
}

function importVendor(User $actor, Project $project, string $tag, int|float|string $fee)
{
    return test()->actingAs($actor, 'sanctum')
        ->postJson("/api/projects/{$project->id}/import-external-vendor", [
            'phase_role' => 'structural',
            'contact_person' => "Vendor {$tag}",
            'phone_number' => '08120000000',
            'agreed_fee' => $fee,
        ]);
}

it('refuses an import whose agreed fee exceeds the available escrow', function () {
    // Budget 10,000,000, fee 80,000,000. The old code clamped budget to 0 and
    // reported success.
    [$owner, , $project] = vendorImportScenario('b5a', 10_000_000);

    importVendor($owner, $project, 'b5a', 80_000_000)->assertStatus(422);

    // Nothing may be half-written: no vendor, no ledger row, and crucially the
    // budget column must be untouched rather than clamped to 0.
    expect(ProjectExternalVendor::where('project_id', $project->id)->count())->toBe(0)
        ->and(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0)
        ->and((float) $project->fresh()->budget)->toBe(10_000_000.0);
});

it('tells the owner the fee was too large, rather than silently clamping', function () {
    [$owner, , $project] = vendorImportScenario('b5b', 1_000_000);

    $response = importVendor($owner, $project, 'b5b', 5_000_000);

    $response->assertStatus(422);
    // The message must name the money and the remedy — this is the difference
    // between a truthful failure and a silent overdraft.
    expect($response->json('message'))
        ->toContain('Insufficient project budget')
        ->toContain('5.000.000');
});

it('accepts an import the escrow can cover, moving the ceiling exactly once', function () {
    [$owner, , $project] = vendorImportScenario('b5c', 100_000_000);

    importVendor($owner, $project, 'b5c', 30_000_000)->assertStatus(200);

    $vendor = ProjectExternalVendor::where('project_id', $project->id)->firstOrFail();

    // The ceiling drops by exactly the fee — not twice, and not clamped.
    expect((float) $project->fresh()->budget)->toBe(70_000_000.0);

    $row = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('reference_model', ProjectExternalVendor::class)
        ->where('reference_id', $vendor->id)
        ->first();

    expect($row)->not->toBeNull()
        ->and($row->transaction_type)->toBe('adjustment_down')
        ->and((float) $row->amount)->toBe(30_000_000.0);
});

it('records the import as a commitment, not as disbursed money', function () {
    // This pins the `adjustment_down` type decision. If someone "simplifies"
    // this to a `payment` row, `available` would drop at import time and the
    // vendor could never be paid later — the fee would be spent twice over.
    [$owner, , $project] = vendorImportScenario('b5d', 100_000_000);

    importVendor($owner, $project, 'b5d', 30_000_000)->assertStatus(200);

    $financial = app(ProjectFinancialService::class);
    $project->refresh();

    // Disbursed stays zero; only the ceiling moved.
    expect($financial->paidTotalMoney($project->id)->toFloat())->toBe(0.0)
        ->and($financial->availableMoney($project)->toFloat())->toBe(70_000_000.0);
});

it('spends headroom across several imports without overdrawing', function () {
    // Two imports of 60,000,000 against a 100,000,000 budget. The second must
    // fail: the first already consumed the headroom. Under the old unclamped
    // read-modify-write this was a TOCTOU race, and even serially the clamp
    // let it "succeed" against a budget that had hit 0.
    [$owner, , $project] = vendorImportScenario('b5e', 100_000_000);

    importVendor($owner, $project, 'b5e-1', 60_000_000)->assertStatus(200);
    importVendor($owner, $project, 'b5e-2', 60_000_000)->assertStatus(422);

    expect((float) $project->fresh()->budget)->toBe(40_000_000.0)
        ->and(ProjectExternalVendor::where('project_id', $project->id)->count())->toBe(1);
});

it('treats a zero fee as a no-op rather than a zero-value ledger row', function () {
    [$owner, , $project] = vendorImportScenario('b5f', 50_000_000);

    importVendor($owner, $project, 'b5f', 0)->assertStatus(200);

    expect(ProjectExternalVendor::where('project_id', $project->id)->count())->toBe(1)
        ->and(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0)
        ->and((float) $project->fresh()->budget)->toBe(50_000_000.0);
});

it('refuses a stranger from importing a vendor and moving the escrow', function () {
    [$owner, $stranger, $project] = vendorImportScenario('b5g', 100_000_000);

    importVendor($stranger, $project, 'b5g', 30_000_000)->assertStatus(403);

    expect((float) $project->fresh()->budget)->toBe(100_000_000.0)
        ->and(ProjectExternalVendor::where('project_id', $project->id)->count())->toBe(0);
});

it('keeps the arithmetic exact for a fee with sen, not just rupiah', function () {
    // Guards the migration to `Money` at this call site: a budget of Rp 100.100
    // minus a Rp 0,10 fee must land on Rp 99.999,90 exactly — not 99.999,89999
    // from binary float drift on the way through the ceiling decrement.
    [$owner, , $project] = vendorImportScenario('b5h', 100_100);

    importVendor($owner, $project, 'b5h', '0.10')->assertStatus(200);

    $budget = Money::fromColumn($project->fresh()->budget);

    expect($budget->toFloat())->toBe(100_099.90)
        // `toInt()` is the exact integer minor-unit value — a float comparison
        // alone could hide a one-sen drift, so the exact form is asserted too.
        ->and($budget->toInt())->toBe(10_009_990);
});
