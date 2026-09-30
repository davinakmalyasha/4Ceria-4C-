<?php

use App\Models\MaterialQuote;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectDispute;
use App\Models\Supplier;
use App\Models\User;
use App\Services\ProjectFinancialService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A material quote must not be payable without evidence or a ledger row
|--------------------------------------------------------------------------
|
| Regression suite for B11.
|
| THE BUGS
| -------
| (1) A MATERIAL QUOTE COULD NEVER BE PAID. `markAsPaid` required
|     `payment_proof_path`, which is correct — a supplier must not self-declare
|     its own quote paid. But `material_quotes` had NO such column and nothing
|     wrote one, so the guard blocked the only payment transition a quote had.
|     The 2026-09-23 pass closed the honor-system hole on the ORDER flow and
 *     put the guard on the QUOTE flow without also giving it a way to satisfy
|     it. A correct guard with no path to compliance is a dead feature.
 *
| (2) EVEN IF IT HAD WORKED, NO MONEY WAS RECORDED. `markAsPaid` set
 *     `status = 'paid'` and stopped: no `project_budget_transactions` row, no
 *     dispute freeze, no affordability check. On a project-bound quote that is
 *     money leaving the platform invisibly — while `verifyPayment` on the ORDER
 *     twin already did all three.
 *
| (3) BANK RECEIPTS WERE WORLD-READABLE. Both procurement flows stored the
 *     buyer's transfer receipt on the `public` disk. A bank receipt exposes
 *     account numbers, the payer's name and often a running balance; on a
 *     public disk the URL is guessable and shareable and stays live forever.
|     The project-document path already used `vault_disk` for this class of
 *     file.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    // Fake BOTH disks: the local .env sets VAULT_DISK=public, and the assertion
    // must hold under either resolution.
    Storage::fake(config('filesystems.vault_disk', 'railway'));
    Storage::fake('public');
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: Supplier, 3: Project, 4: MaterialQuote}
 */
function quoteScenario(string $tag, int|float $budget = 500_000_000): array
{
    $buyer = User::create([
        'name' => "QB {$tag}", 'username' => "qb_$tag" . uniqid(),
        'email' => "qb_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplierUser = User::create([
        'name' => "QS {$tag}", 'username' => "qs_$tag" . uniqid(),
        'email' => "qs_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $supplierUser->id, 'store_name' => "Store {$tag}",
    ]);

    $project = Project::create([
        'title' => "Quote {$tag}", 'user_id' => $buyer->id,
        'budget' => $budget, 'status' => 'in_progress',
    ]);

    $quote = MaterialQuote::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id,
        'items' => [['material_id' => 1, 'name' => 'Cement', 'price_at_quote' => 500_000, 'qty' => 100, 'unit' => 'sak']],
        'delivery_address' => 'Jl. Merdeka 1, Jakarta',
        'total_amount' => 50_000_000, 'shipping_cost' => 2_500_000,
        'status' => 'awaiting_payment',
    ]);

    return [$buyer, $supplierUser, $supplier, $project, $quote];
}

function uploadProof(User $buyer, MaterialQuote $quote): mixed
{
    return test()->actingAs($buyer, 'sanctum')
        ->post("/api/material-quotes/{$quote->id}/payment-proof", [
            'payment_proof' => UploadedFile::fake()->image('receipt.jpg'),
        ]);
}

function confirmPaid(User $supplierUser, MaterialQuote $quote): mixed
{
    return test()->actingAs($supplierUser, 'sanctum')
        ->putJson("/api/material-quotes/{$quote->id}/mark-paid", []);
}

it('lets the buyer upload a receipt, which the supplier can then act on', function () {
    [$buyer, $supplierUser, , , $quote] = quoteScenario('b11a');

    uploadProof($buyer, $quote)->assertStatus(200);

    expect($quote->fresh()->payment_proof_path)->not->toBeNull()
        ->and($quote->fresh()->status)->toBe('awaiting_payment');
});

it('stores the receipt on the PRIVATE vault disk, not the public one', function () {
    [$buyer, , , , $quote] = quoteScenario('b11b');

    uploadProof($buyer, $quote)->assertStatus(200);

    $path = $quote->fresh()->payment_proof_path;
    $vaultDisk = config('filesystems.vault_disk', 'railway');

    Storage::disk($vaultDisk)->assertExists($path);

    // The receipt must NOT land on the world-facing disk.
    //
    // Skipped when `VAULT_DISK=public`, which is the documented LOCAL
    // development override (config/filesystems.php: "local development may set
    // VAULT_DISK=public for frictionless /storage links"). In that
    // configuration there is only one disk and the privacy property is provided
    // by the production default of `railway`, not by this test. Asserting the
    // negative unconditionally would fail on every developer's machine for a
    // reason that is correct behaviour, which is how a real assertion gets
    // deleted.
    if ($vaultDisk !== 'public') {
        Storage::disk('public')->assertMissing($path);
    }

    // The path is namespaced under payment_proofs on whichever disk was chosen,
    // which is what makes the two configurations comparable.
    expect($path)->toStartWith('payment_proofs/');
});

it('completes the payment once the supplier confirms, writing a real ledger row', function () {
    [$buyer, $supplierUser, , $project, $quote] = quoteScenario('b11c');

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(200);

    $quote->refresh();
    expect($quote->status)->toBe('paid')
        ->and($quote->paid_at)->not->toBeNull()
        ->and($quote->payment_verified_by)->toBe($supplierUser->id)
        ->and($quote->payment_verified_at)->not->toBeNull();

    // 50,000,000 goods + 2,500,000 shipping.
    $row = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('reference_model', MaterialQuote::class)
        ->where('reference_id', $quote->id)
        ->first();

    expect($row)->not->toBeNull()
        ->and($row->transaction_type)->toBe('payment')
        ->and((float) $row->amount)->toBe(52_500_000.0);

    // And the money is actually gone from the escrow.
    $financial = app(ProjectFinancialService::class);
    expect($financial->paidTotalMoney($project->id)->toFloat())->toBe(52_500_000.0)
        ->and($financial->availableMoney($project->fresh())->toFloat())->toBe(447_500_000.0);
});

it('still refuses to let a supplier self-declare a quote paid with no receipt', function () {
    [, $supplierUser, , , $quote] = quoteScenario('b11d');

    confirmPaid($supplierUser, $quote)->assertStatus(422);

    expect($quote->fresh()->status)->toBe('awaiting_payment')
        ->and($quote->fresh()->paid_at)->toBeNull();
});

it('refuses a buyer receipt from anyone who is not the buyer', function () {
    [$buyer, $supplierUser, , , $quote] = quoteScenario('b11e');

    uploadProof($supplierUser, $quote)->assertStatus(403);

    expect($quote->fresh()->payment_proof_path)->toBeNull();
});

it('refuses a receipt on a quote that is not awaiting payment', function () {
    [$buyer, , , , $quote] = quoteScenario('b11f');
    $quote->update(['status' => 'pending']);

    uploadProof($buyer, $quote)->assertStatus(422);

    expect($quote->fresh()->payment_proof_path)->toBeNull();
});

it('refuses a second receipt once the payment is settled', function () {
    [$buyer, $supplierUser, , , $quote] = quoteScenario('b11g');

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(200);

    // A second receipt would be an attempt to re-open settled money, not a
    // correction.
    uploadProof($buyer, $quote)->assertStatus(422);
});

it('refuses a second confirmation, so the escrow is not charged twice', function () {
    [$buyer, $supplierUser, , $project, $quote] = quoteScenario('b11h');

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(422);

    expect(
        ProjectBudgetTransaction::where('project_id', $project->id)
            ->where('reference_model', MaterialQuote::class)
            ->where('reference_id', $quote->id)
            ->count()
    )->toBe(1);
});

it('refuses a confirmation the escrow cannot cover', function () {
    // Budget 10,000,000 against a 52,500,000 quote.
    [$buyer, $supplierUser, , $project, $quote] = quoteScenario('b11i', 10_000_000);

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(422);

    $quote->refresh();
    expect($quote->status)->toBe('awaiting_payment')
        ->and($quote->paid_at)->toBeNull()
        ->and((float) $project->fresh()->budget)->toBe(10_000_000.0);

    expect(
        ProjectBudgetTransaction::where('project_id', $project->id)->count()
    )->toBe(0);
});

it('freezes the payment while a dispute is open', function () {
    // The ORDER twin has had this since 2026-09-23; the quote path had none.
    [$buyer, $supplierUser, , $project, $quote] = quoteScenario('b11j');

    // Opened through the service, not mass-assigned: the column is
    // `opened_by`, not `raised_by`, and going through `open()` also fires the
    // freeze notification the real path would.
    app(\App\Services\DisputeService::class)->open($project, $buyer, [
        'category' => 'payment',
        'title' => 'Work not as agreed',
        'description' => 'Materials arrived damaged.',
        'disputed_amount' => 5_000_000,
    ]);

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(422);

    expect($quote->fresh()->status)->toBe('awaiting_payment')
        ->and(ProjectBudgetTransaction::where('project_id', $project->id)->count())->toBe(0);
});

it('refuses a confirmation from a supplier who is not the seller', function () {
    [$buyer, , $supplier, , $quote] = quoteScenario('b11k');

    $otherUser = User::create([
        'name' => 'Other supplier', 'username' => 'os' . uniqid(),
        'email' => 'os' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    Supplier::create(['user_id' => $otherUser->id, 'store_name' => 'Elsewhere']);

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($otherUser, $quote)->assertStatus(403);

    expect($quote->fresh()->status)->toBe('awaiting_payment');
});

it('records the supplier note against the confirmation', function () {
    [$buyer, $supplierUser, , , $quote] = quoteScenario('b11l');

    uploadProof($buyer, $quote)->assertStatus(200);

    test()->actingAs($supplierUser, 'sanctum')
        ->putJson("/api/material-quotes/{$quote->id}/mark-paid", [
            'payment_notes' => 'Receipt matches our bank statement.',
        ])
        ->assertStatus(200);

    expect($quote->fresh()->payment_notes)
        ->toBe('Receipt matches our bank statement.');
});

it('charges a quote with no project through the normal confirmation, with no ledger row', function () {
    // A marketplace quote outside a project has no escrow to move money in, so
    // the confirm still works — but nothing may be written to a ledger, because
    // there is no project to write it against.
    $buyer = User::create([
        'name' => 'Loose buyer', 'username' => 'lb' . uniqid(),
        'email' => 'lb' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplierUser = User::create([
        'name' => 'Loose supplier', 'username' => 'ls' . uniqid(),
        'email' => 'ls' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create(['user_id' => $supplierUser->id, 'store_name' => 'Loose']);

    $quote = MaterialQuote::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id, 'project_id' => null,
        'items' => [['name' => 'Tiles', 'price_at_quote' => 100_000, 'qty' => 10, 'unit' => 'box']],
        'delivery_address' => 'Jl. Merdeka 2',
        'total_amount' => 1_000_000, 'shipping_cost' => 100_000,
        'status' => 'awaiting_payment',
    ]);

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(200);

    expect($quote->fresh()->status)->toBe('paid')
        ->and(ProjectBudgetTransaction::count())->toBe(0);
});

it('charges exactly the goods plus shipping, with no float drift', function () {
    [$buyer, $supplierUser, , $project, $quote] = quoteScenario('b11m');

    // A sen-level figure, to pin the arithmetic rather than just the happy path.
    $quote->update(['total_amount' => '1000.10', 'shipping_cost' => '0.20']);

    uploadProof($buyer, $quote)->assertStatus(200);
    confirmPaid($supplierUser, $quote)->assertStatus(200);

    $row = ProjectBudgetTransaction::where('project_id', $project->id)
        ->where('reference_id', $quote->id)
        ->first();

    // 1000.10 + 0.20 = 1000.30 exactly.
    expect(\App\Support\Money::fromColumn($row->amount)->toInt())->toBe(100_030);
});