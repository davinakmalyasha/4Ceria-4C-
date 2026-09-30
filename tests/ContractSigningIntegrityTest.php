<?php

use App\Models\Arsitek;
use App\Models\BidArsitek;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\User;
use App\Services\TerminPlanService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Signing a contract must bind a plan that reconciles
|--------------------------------------------------------------------------
|
| Regression suite for C1.
|
| `TerminPlanService::assertPlanComplete()` existed from the first version of
| the service and was NEVER CALLED. Its own docblock said it should be enforced
| "where a plan becomes BINDING (signContract)" — so the one guard designed for
| the most important moment in the payment lifecycle was dead code, and both
| signing paths improvised instead.
|
| THE DEFECTS
| -----------
| (1) THE OWNER'S COUNTER-SIGNATURE HAD NO PLAN CHECK AT ALL.
|     `clientSignContract` is what makes a schedule enforceable and the money
|     payable. It accepted whatever the professional had written. A plan could
|     be bound with stages that do not total the negotiated fee.
|
| (2) A THIRD DERIVATION OF THE CONTRACT VALUE.
|     signContract computed `calculated_total > 0 ? calculated_total :
|     (fee_type === 'percentage' ? (price / 100) * budget : price)`, while
|     `contractValueFor()` uses `calculated_total ?? price` with no
|     budget-percentage fallback. The same contract was worth two different
|     amounts depending on which code read it — and this one ran on the path
|     that binds.
|
| (3) A ZERO-AMOUNT PLAN PASSED THE TOTAL CHECK AND THEN DRIFTED.
|     The old guard was SKIPPED when `$totalAmount <= 0` ("we will recalculate
|     below"), and each stage was then rebuilt with
 *
|         $amount = round(($percentage / 100) * $expectedTotal);
 *
|     a float multiply plus round(), applied AFTER the check that should have
|     caught it. Minor units were lost, so the stages stopped summing to the
|     agreed fee and nothing reconciled them afterwards.
|
|     A professional is SIGNING here, so a zero amount is now REJECTED rather
|     than derived. They should see the figures they agreed to.
|
| (4) THE TOTAL CHECK WAS ONE-SIDED. It bounded overshoot but not undershoot,
|     so a plan could be signed for materially LESS than was negotiated.
|
| (5) `bid_type` was `'required|string'` with no whitelist in five places, so
|     an unknown role reached `getBidModel()`'s uncaught
|     InvalidArgumentException — a 500 for what is plainly a client mistake.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    Storage::fake('railway');
    Storage::fake('public');
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: Project, 3: BidArsitek}
 */
function signingScenario(string $tag, int|float $contractValue, int|float $budget = 500_000_000): array
{
    $owner = User::create([
        'name' => "SO {$tag}", 'username' => "so_$tag" . uniqid(),
        'email' => "so_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pro = User::create([
        'name' => "SP {$tag}", 'username' => "sp_$tag" . uniqid(),
        'email' => "sp_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);

    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => "Arsitek {$tag}"]);

    $project = Project::create([
        'title' => "Signing {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'awaiting_payment',
        'selected_arsitek_id' => $profile->id,
    ]);

    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => $contractValue, 'calculated_total' => $contractValue,
        'proposal' => "Proposal {$tag}", 'status' => 'contract_pending',
        'payment_status' => 'unpaid',
    ]);

    return [$owner, $pro, $project, $bid];
}

/**
 * A plan that reconciles exactly: two stages summing to the contract value.
 *
 * @return list<array{label: string, percentage: float, amount: int}>
 */
function evenPlan(int $total): array
{
    return [
        ['label' => 'DP', 'percentage' => 50.0, 'amount' => (int) round($total / 2)],
        ['label' => 'Pelunasan', 'percentage' => 50.0, 'amount' => (int) round($total / 2)],
    ];
}

function signAsPro(User $pro, Project $project, BidArsitek $bid, array $termins, array $overrides = [])
{
    return test()->actingAs($pro, 'sanctum')
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/sign-contract", array_merge([
            'bid_type' => 'arsitek',
            'termins' => $termins,
            // The owner's counter-signature refuses to proceed unless the
            // professional's signature FILE exists, so a pro sign in a test has
            // to actually write one.
            'signature' => 'data:image/png;base64,' . base64_encode('pro-signature'),
            'bank_type' => 'BCA',
            'bank_account_no' => '1234567890',
            'bank_account_name' => 'Arsitek Test',
        ], $overrides));
}

function signAsOwner(User $owner, Project $project, BidArsitek $bid, array $overrides = [])
{
    return test()->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/bids/{$bid->id}/client-sign-contract", array_merge([
            'bid_type' => 'arsitek',
            'signature' => 'data:image/png;base64,' . base64_encode('sig'),
        ], $overrides));
}

it('signs a plan that reconciles to the negotiated fee', function () {
    [$owner, $pro, $project, $bid] = signingScenario('c1a', 100_000_000);

    signAsPro($pro, $project, $bid, evenPlan(100_000_000))->assertStatus(200);

    $stages = ProjectPaymentTermin::where('project_id', $project->id)->get();

    expect($stages)->toHaveCount(2)
        ->and((float) $stages->sum('percentage'))->toBe(100.0)
        ->and((float) $stages->sum('amount'))->toBe(100_000_000.0);

    signAsOwner($owner, $project, $bid)->assertStatus(200);
});

it('refuses a plan whose stages total less than the negotiated fee', function () {
    // The one-sided guard let this through: it bounded overshoot, not
    // undershoot, so a contract could be signed for materially less.
    [$owner, $pro, $project, $bid] = signingScenario('c1b', 100_000_000);

    signAsPro($pro, $project, $bid, [
        ['label' => 'DP', 'percentage' => 50.0, 'amount' => 25_000_000],
        ['label' => 'Pelunasan', 'percentage' => 50.0, 'amount' => 25_000_000],
    ])->assertStatus(422);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses a plan whose stages total more than the negotiated fee', function () {
    [$owner, $pro, $project, $bid] = signingScenario('c1c', 100_000_000);

    signAsPro($pro, $project, $bid, [
        ['label' => 'DP', 'percentage' => 50.0, 'amount' => 75_000_000],
        ['label' => 'Pelunasan', 'percentage' => 50.0, 'amount' => 75_000_000],
    ])->assertStatus(422);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses a plan with a zero amount rather than silently deriving one', function () {
    // THE CORE REGRESSION. The old code skipped the total check for a zero plan
    // and rebuilt each stage with round((percentage / 100) * total), so the
    // written stages stopped summing to the agreed fee.
    [$owner, $pro, $project, $bid] = signingScenario('c1d', 100_000_000);

    signAsPro($pro, $project, $bid, [
        ['label' => 'DP', 'percentage' => 50.0, 'amount' => 0],
        ['label' => 'Pelunasan', 'percentage' => 50.0, 'amount' => 0],
    ])->assertStatus(422);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses a plan where only ONE stage is zero', function () {
    [$owner, $pro, $project, $bid] = signingScenario('c1e', 100_000_000);

    $res = signAsPro($pro, $project, $bid, [
        ['label' => 'DP', 'percentage' => 50.0, 'amount' => 100_000_000],
        ['label' => 'Pelunasan', 'percentage' => 50.0, 'amount' => 0],
    ])->assertStatus(422);

    expect($res->json('message'))->toContain('Pelunasan');
});

it('refuses percentages that do not total 100', function () {
    [$owner, $pro, $project, $bid] = signingScenario('c1f', 100_000_000);

    signAsPro($pro, $project, $bid, [
        ['label' => 'DP', 'percentage' => 40.0, 'amount' => 40_000_000],
        ['label' => 'Pelunasan', 'percentage' => 40.0, 'amount' => 60_000_000],
    ])->assertStatus(422);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses percentages over 100, which are an increment rather than a split', function () {
    [$owner, $pro, $project, $bid] = signingScenario('c1g', 100_000_000);

    signAsPro($pro, $project, $bid, [
        ['label' => 'DP', 'percentage' => 60.0, 'amount' => 60_000_000],
        ['label' => 'Pelunasan', 'percentage' => 60.0, 'amount' => 40_000_000],
    ])->assertStatus(422);
});

it('refuses an unknown bid_type with a 422 instead of a 500', function () {
    // getBidModel() throws InvalidArgumentException for an unknown type, and
    // nothing caught it, so a typo in a role name returned a server error.
    [$owner, $pro, $project, $bid] = signingScenario('c1h', 100_000_000);

    signAsPro($pro, $project, $bid, evenPlan(100_000_000), ['bid_type' => 'surveyor'])
        ->assertStatus(422);
});

it('refuses the owner binding a plan that does not reconcile', function () {
    // The owner's counter-signature had no plan check whatsoever.
    $owner = User::create([
        'name' => 'OB', 'username' => 'ob' . uniqid(),
        'email' => 'ob' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pro = User::create([
        'name' => 'PB', 'username' => 'pb' . uniqid(),
        'email' => 'pb' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'Arsitek']);
    $project = Project::create([
        'title' => 'Bad plan', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'awaiting_payment',
        'selected_arsitek_id' => $profile->id,
    ]);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 100_000_000, 'calculated_total' => 100_000_000,
        'proposal' => 'P', 'status' => 'contract_pending', 'payment_status' => 'unpaid',
    ]);

    // A professional signature must exist for the owner step to proceed.
    Storage::disk('railway')->put(
        "contracts/project_{$project->id}/signatures/signature_arsitek_{$bid->id}_"
            .$bid->created_at->timestamp.'.png',
        'sig'
    );

    // A plan that is only 70% — it would have bound without complaint.
    ProjectPaymentTermin::create([
        'project_id' => $project->id, 'role_type' => 'arsitek',
        'recipient_id' => $pro->id,
        'label' => 'DP', 'percentage' => 70, 'amount' => 70_000_000,
        'retention_amount' => 0, 'net_amount' => 70_000_000, 'status' => 'pending',
    ]);

    signAsOwner($owner, $project, $bid)->assertStatus(422);

    // The bid must NOT have advanced to awaiting_payment.
    expect($bid->fresh()->status)->toBe('contract_pending');
});

it('refuses the owner binding when no schedule exists at all', function () {
    $owner = User::create([
        'name' => 'ON', 'username' => 'on' . uniqid(),
        'email' => 'on' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pro = User::create([
        'name' => 'PN', 'username' => 'pn' . uniqid(),
        'email' => 'pn' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'Arsitek']);
    $project = Project::create([
        'title' => 'No schedule', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'awaiting_payment',
        'selected_arsitek_id' => $profile->id,
    ]);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 100_000_000, 'calculated_total' => 100_000_000,
        'proposal' => 'P', 'status' => 'contract_pending', 'payment_status' => 'unpaid',
    ]);

    Storage::disk('railway')->put(
        "contracts/project_{$project->id}/signatures/signature_arsitek_{$bid->id}_"
            .$bid->created_at->timestamp.'.png',
        'sig'
    );

    signAsOwner($owner, $project, $bid)->assertStatus(422);
});

it('derives the contract value the same way everywhere', function () {
    // A percentage bid with NO calculated_total used to be worth
    // (price / 100) * budget on the signing path, but `calculated_total ?? price`
    // in contractValueFor(). The signing path is the one that binds.
    $owner = User::create([
        'name' => 'PV', 'username' => 'pv' . uniqid(),
        'email' => 'pv' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pro = User::create([
        'name' => 'PW', 'username' => 'pw' . uniqid(),
        'email' => 'pw' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'Arsitek']);
    $project = Project::create([
        'title' => 'Percentage bid', 'user_id' => $owner->id,
        'budget' => 1_000_000_000, 'status' => 'awaiting_payment',
        'selected_arsitek_id' => $profile->id,
    ]);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 10_000_000, 'calculated_total' => null, 'fee_type' => 'percentage',
        'proposal' => 'P', 'status' => 'contract_pending', 'payment_status' => 'unpaid',
    ]);

    // The service is the single source: Rp 10,000,000, NOT 10% of a
    // Rp 1,000,000,000 budget (which would have been Rp 100,000,000).
    expect(app(TerminPlanService::class)->contractValueFor($project, 'arsitek'))
        ->toBe(10_000_000.0);

    // A plan matching the SERVICE's figure is accepted...
    signAsPro($pro, $project, $bid, evenPlan(10_000_000))->assertStatus(200);

    // ...and the same derivation holds for a second bid. A distinct profile is
    // required: `bids_arsitek` carries a unique (project_id, arsitek_id)
    // constraint, which is itself worth knowing — one bid per professional per
    // project is enforced by the database, not by application code.
    $otherProfile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'Arsitek 2']);
    $bid2 = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $otherProfile->id,
        'price' => 20_000_000, 'calculated_total' => null, 'fee_type' => 'percentage',
        'proposal' => 'P2', 'status' => 'contract_pending', 'payment_status' => 'unpaid',
    ]);

    expect(app(TerminPlanService::class)->contractValueFor($project, 'arsitek'))
        ->toBe(10_000_000.0);

    // A plan matching 20,000,000 UNDERSHOOTS the 10,000,000 contract the
    // service derives, so it is refused — proving the signing path and the
    // service agree. Under the old local derivation it would have compared
    // against (20,000,000 / 100) * 1,000,000,000 = 2,000,000,000 instead.
    signAsPro($pro, $project, $bid2, evenPlan(20_000_000))->assertStatus(422);
});

it('replaces the stage set wholesale on a re-sign, and it still reconciles', function () {
    [$owner, $pro, $project, $bid] = signingScenario('c1i', 100_000_000);

    signAsPro($pro, $project, $bid, evenPlan(100_000_000))->assertStatus(200);
    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(2);

    // A second sign is a wholesale REPLACE of the role's stages. It must go
    // through the same validation, so the persisted plan still reconciles.
    signAsPro($pro, $project, $bid, [
        ['label' => 'Single stage', 'percentage' => 100.0, 'amount' => 100_000_000],
    ])->assertStatus(200);

    $stages = ProjectPaymentTermin::where('project_id', $project->id)->get();
    expect($stages)->toHaveCount(1)
        ->and((float) $stages->first()->amount)->toBe(100_000_000.0);
});

it('refuses a re-sign whose plan would undershoot, leaving the signed plan intact', function () {
    [$owner, $pro, $project, $bid] = signingScenario('c1i2', 100_000_000);

    signAsPro($pro, $project, $bid, evenPlan(100_000_000))->assertStatus(200);

    // A rejected re-sign must NOT have deleted the existing stages. The
    // wholesale delete happens INSIDE the transaction that runs after the
    // guards, so a rejection cannot destroy a valid schedule.
    signAsPro($pro, $project, $bid, [
        ['label' => 'Under', 'percentage' => 100.0, 'amount' => 5_000_000],
    ])->assertStatus(422);

    $stages = ProjectPaymentTermin::where('project_id', $project->id)->get();
    expect($stages)->toHaveCount(2)
        ->and((float) $stages->sum('amount'))->toBe(100_000_000.0);
});

it('keeps the signed plan reconciling at the exact minor unit', function () {
    // A contract value that is not divisible by the number of stages, so an
    // exact split cannot land on whole rupiah for every stage.
    [$owner, $pro, $project, $bid] = signingScenario('c1j', 100_000_001);

    signAsPro($pro, $project, $bid, [
        ['label' => 'DP', 'percentage' => 33.34, 'amount' => 33_333_334],
        ['label' => 'Pelunasan', 'percentage' => 66.66, 'amount' => 66_666_667],
    ])->assertStatus(200);

    $stages = ProjectPaymentTermin::where('project_id', $project->id)->get();

    expect(\App\Support\Money::fromColumn($stages->sum('amount'))->toInt())
        ->toBe(10_000_000_100); // exactly the contract value, no drift
});