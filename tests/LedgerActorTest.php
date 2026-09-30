<?php

use App\Models\BidArsitek;
use App\Models\Arsitek;
use App\Models\MaterialQuote;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectExternalVendor;
use App\Models\Supplier;
use App\Models\User;
use App\Services\DisputeService;
use App\Services\ProjectFinancialService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Every ledger row must be attributable to a human
|--------------------------------------------------------------------------
|
| Regression suite for C2.
|
| `project_budget_transactions` had NO actor column, and none of its four write
| sites passed one:
|
|   1. ProjectFinancialService::deductBudget  (every escrow movement)
|   2. DisputeService                          (refunds)
|   3. ProjectController::store                (opening budget)
 *   4. ProjectPhaseService                     (vendor fee allocation)
 *
| The consequence was worst on the movement that matters most. A `refund` row,
| written by dispute arbitration, could not answer "which admin issued this
 * refund?" The only nearby trace was prose in `project_activity_logs`, and even
 * that existed on only SOME paths — the verifyProof, material order, material
| quote and vendor-import paths recorded nothing at all.
|
| The append-only audit trail could therefore not be attributed, which is a
| structural gap for the subsystem whose entire job is establishing who did
| what. And it is not recoverable after the fact.
|
| NULL IS A REAL ANSWER
| ---------------------
| A scheduled settlement or a reconciliation repair has no human actor.
| Forcing one would mean inventing a user id, so the columns are nullable and a
| test asserts that absence is distinguishable from "forgotten".
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: Project}
 */
function actorScenario(string $tag, int|float $budget = 500_000_000): array
{
    $owner = User::create([
        'name' => "AO {$tag}", 'username' => "ao_$tag" . uniqid(),
        'email' => "ao_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $project = Project::create([
        'title' => "Actor {$tag}", 'user_id' => $owner->id,
        'budget' => $budget, 'status' => 'in_progress',
    ]);

    return [$owner, $project];
}

it('records the owner as the actor when they deposit funds', function () {
    [$owner, $project] = actorScenario('c2a');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/transactions", [
            'transaction_type' => 'deposit', 'amount' => 50_000_000,
            'title' => 'Top up',
        ])
        ->assertStatus(200);

    $row = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'deposit')
        ->firstOrFail();

    expect($row->actor_user_id)->toBe($owner->id)
        ->and($row->actor_role)->toBe('user')
        ->and($row->hasHumanActor())->toBeTrue();
});

it('records the owner as the actor on the opening budget', function () {
    $owner = User::create([
        'name' => 'OB', 'username' => 'ob' . uniqid(),
        'email' => 'ob' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson('/api/projects', [
            'title' => 'Opening', 'description' => 'd',
            'budget' => 250_000_000, 'lokasi' => 'Jakarta',
            'project_category' => 'renovation',
            'deadline' => now()->addMonths(3)->toDateString(),
        ])
        ->assertStatus(201);

    $project = Project::where('title', 'Opening')->firstOrFail();
    $row = ProjectBudgetTransaction::where('project_id', $project->id)->firstOrFail();

    // The opening row is the baseline every later ceiling movement reconciles
    // against, so "who set the original figure" is the first question asked of
    // it.
    expect($row->actor_user_id)->toBe($owner->id);
});

it('records the supplier confirming a material payment', function () {
    $buyer = User::create([
        'name' => 'Buyer', 'username' => 'by' . uniqid(),
        'email' => 'by' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplierUser = User::create([
        'name' => 'Sup', 'username' => 'su' . uniqid(),
        'email' => 'su' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create(['user_id' => $supplierUser->id, 'store_name' => 'S']);
    $project = Project::create([
        'title' => 'Quote actor', 'user_id' => $buyer->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);
    $quote = MaterialQuote::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id,
        'items' => [['name' => 'Cement', 'price_at_quote' => 500_000, 'qty' => 100, 'unit' => 'sak']],
        'delivery_address' => 'Jakarta', 'total_amount' => 50_000_000,
        'shipping_cost' => 0, 'status' => 'awaiting_payment',
        'payment_proof_path' => 'payment_proofs/receipt.jpg',
    ]);

    $this->actingAs($supplierUser, 'sanctum')
        ->putJson("/api/material-quotes/{$quote->id}/mark-paid", [])
        ->assertStatus(200);

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->firstOrFail();

    expect($row->actor_user_id)->toBe($supplierUser->id)
        ->and($row->actor_role)->toBe('supplier');
});

it('records the owner allocating a vendor fee', function () {
    [$owner, $project] = actorScenario('c2d');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/import-external-vendor", [
            'phase_role' => 'structural',
            'contact_person' => 'Vendor Co',
            'phone_number' => '08120000000',
            'agreed_fee' => 30_000_000,
        ])
        ->assertStatus(200);

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->firstOrFail();

    expect($row->actor_user_id)->toBe($owner->id)
        ->and($row->transaction_type)->toBe('adjustment_down');
});

it('records the ARBITRATOR on a refund, which is the row that most needs it', function () {
    $owner = User::create([
        'name' => 'RO', 'username' => 'ro' . uniqid(),
        'email' => 'ro' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $admin = User::create([
        'name' => 'Admin', 'username' => 'ad' . uniqid(),
        'email' => 'ad' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);
    $pro = User::create([
        'name' => 'Pro', 'username' => 'pr' . uniqid(),
        'email' => 'pr' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'Arsitek']);
    $project = Project::create([
        'title' => 'Refund actor', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 40_000_000, 'calculated_total' => 40_000_000,
        'proposal' => 'P', 'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    app(ProjectFinancialService::class)
        ->recordPayment($project, 40_000_000, 'Architectural fee', BidArsitek::class, $bid->id);
    $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);

    $dispute = app(DisputeService::class)->open($project, $owner, [
        'category' => 'payment',
        'title' => 'Work not as agreed',
        'description' => 'Partial refund owed.',
        'payment_type' => 'arsitek_bid',
        'payment_id' => $bid->id,
        'disputed_amount' => 15_000_000,
    ]);

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", [
            'action' => 'record_refund',
            'amount' => 15_000_000,
            'notes' => 'Arbitration upheld.',
        ])
        ->assertStatus(200);

    $refund = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'refund')
        ->firstOrFail();

    // The whole point: which admin issued this refund is answerable from the
    // ledger alone.
    expect($refund->actor_user_id)->toBe($admin->id)
        ->and($refund->actor_role)->toBe('admin');
});

it('records NULL for a system-initiated movement, which is not the same as forgotten', function () {
    [$owner, $project] = actorScenario('c2f');

    // No acting user: a scheduled settlement or a reconciliation repair. The row
    // must be recorded, with an explicit absence of a human — not a fabricated
    // id, and not a skipped write.
    $recorded = app(ProjectFinancialService::class)->deductBudget(
        $project,
        1_000_000,
        'adjustment_down',
        'System reconciliation adjustment',
    );

    expect($recorded)->toBeTrue();

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->firstOrFail();

    expect($row->actor_user_id)->toBeNull()
        ->and($row->actor_role)->toBeNull()
        ->and($row->hasHumanActor())->toBeFalse()
        // ...and the movement is still on the record.
        ->and((float) $row->amount)->toBe(1_000_000.0);
});

it('resolves the actor relation for attribution queries', function () {
    [$owner, $project] = actorScenario('c2g');

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/budget/transactions", [
            'transaction_type' => 'deposit', 'amount' => 1_000_000,
            'title' => 'Top up',
        ])
        ->assertStatus(200);

    $row = ProjectBudgetTransaction::where('project_id', $project->id)->firstOrFail();

    expect($row->actor)->not->toBeNull()
        ->and($row->actor->id)->toBe($owner->id)
        ->and($row->actor->name)->toBe($owner->name);
});

it('keeps the record when the acting user is deleted, because the fact must not vanish', function () {
    // The columns are deliberately NOT foreign keys: deleting a user must not
    // erase the fact that they moved money.
    //
    // Note the distinction, which the first draft of this test got wrong by
    // deleting the PROJECT OWNER: `project_budget_transactions` cascades from
    // `projects`, and `projects` cascades from `users.user_id`. Deleting the
    // owner therefore destroys the project and its ledger legitimately — that
    // is a different question and a different policy.
    //
    // Here the actor is the ARBITRATOR, who is not the owner. Deleting them
    // must leave the refund row intact with a dangling actor id, because
    // "an admin issued this and has since been removed" is still the answer to
    // "who issued this".
    $owner = User::create([
        'name' => 'RO', 'username' => 'ro' . uniqid(),
        'email' => 'ro' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $admin = User::create([
        'name' => 'Admin', 'username' => 'ad' . uniqid(),
        'email' => 'ad' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'admin',
    ]);
    $pro = User::create([
        'name' => 'Pro', 'username' => 'pr' . uniqid(),
        'email' => 'pr' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create(['user_id' => $pro->id, 'nama' => 'Arsitek']);
    $project = Project::create([
        'title' => 'Actor removed', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);
    $bid = BidArsitek::create([
        'project_id' => $project->id, 'arsitek_id' => $profile->id,
        'price' => 40_000_000, 'calculated_total' => 40_000_000,
        'proposal' => 'P', 'status' => 'active', 'payment_status' => 'unpaid',
    ]);

    app(ProjectFinancialService::class)
        ->recordPayment($project, 40_000_000, 'Architectural fee', BidArsitek::class, $bid->id);
    $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);

    $dispute = app(DisputeService::class)->open($project, $owner, [
        'category' => 'payment',
        'title' => 'Work not as agreed',
        'description' => 'Partial refund owed.',
        'payment_type' => 'arsitek_bid',
        'payment_id' => $bid->id,
        'disputed_amount' => 15_000_000,
    ]);

    $this->actingAs($admin, 'sanctum')
        ->postJson("/api/admin/disputes/{$dispute->id}/act", [
            'action' => 'record_refund', 'amount' => 15_000_000, 'notes' => 'Upheld.',
        ])
        ->assertStatus(200);

    $refundId = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('transaction_type', 'refund')
        ->value('id');
    $adminId = $admin->id;

    $admin->delete();

    $row = ProjectBudgetTransaction::find($refundId);

    expect($row)->not->toBeNull()
        ->and($row->actor_user_id)->toBe($adminId)
        // The relation simply resolves to nothing; the id remains.
        ->and($row->actor)->toBeNull();
});