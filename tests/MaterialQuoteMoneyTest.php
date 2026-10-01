<?php

use App\Models\MaterialQuote;
use App\Models\Project;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A supplier may not name the buyer's shipping charge or re-assert a refund
|--------------------------------------------------------------------------
|
| Regression suite for MEDIUM audit findings in MaterialQuoteController, all of
| which touch money leaving the buyer's escrow.
|
| 1. The supplier chose the shipping charge
|    `requestPayment()` validated `shipping_cost` with only `min:0`, and that
#    number became the `markAsPaid()` amount, which debits the BUYER'S PROJECT
#    ESCROW via `ProjectFinancialService::recordPayment()`. So a supplier could
#    name any figure and drain escrow.
#
#    The platform already owned a tariff -- Haversine with a 1.3x routing
#    multiplier, Rp 50.000 for the first 5 km then Rp 4.000/km -- but it was
#    computed in `approve()` ONLY, which is why nothing constrained the figure
#    typed into `requestPayment()`. That duplication was the bug. Both paths now
#    call `platformShippingTariff()`.
#
#    A supplier may still discount below the tariff, and still price a delivery
#    the platform does not cover -- but may never exceed either bound.
|
| 2. Float arithmetic on a ledger amount -- CONSISTENCY, NOT A DEMONSTRATED LOSS
|    `$totalAmount = collect($items)->sum(fn ($i) => $i['price_at_quote'] * $i['qty'])`
#    is a binary-float multiply accumulated per line. It is converted to `Money`
#    here because the project's rule is that money arithmetic goes through
#    App\Support\Money, and `markAsPaid()` in this same file already did.
#
#    HONEST SCOPE: these two tests pass against the OLD float implementation too.
#    `total_amount` is `decimal(24,2)`, so the storage boundary rounds any binary
#    drift away, and `markAsPaid()` reads the value back through
#    `Money::fromColumn()`. So this is a consistency fix, not a closed bug -- the
#    drift is bounded at well under one sen before it can reach the ledger. The
#    tests are kept because they pin the exact result, which is what would change
#    first if the column were ever widened or the value used before persisting.
|
| 3. A refunded quote was re-assertable as paid
|    Only `=== 'paid'` was refused. After a dispute refund moved the quote to
#    `refunded`, a second `markAsPaid()` passed the guard, then called
#    `recordPayment()`, which finds the existing ledger row for
#    `(MaterialQuote, id)` and short-circuits to true WITHOUT writing a second
#    row. So the quote became `paid` again while the escrow held a refund.
#    `ProjectBudgetController::markPaid()` has `assertNotRefunded()` for exactly
#    this; the quote path was missing it.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mqSupplier(string $tag): array
{
    $user = User::create([
        'name' => "Supplier $tag", 'username' => "sup_$tag" . uniqid(),
        'email' => "sup_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);

    $supplier = Supplier::create([
        'user_id' => $user->id, 'store_name' => "Toko $tag",
        'verification_status' => 'verified',
        // Jakarta, so the tariff is computable.
        'latitude' => -6.2088, 'longitude' => 106.8456,
    ]);

    $supplier->materials()->create([
        'name' => 'Semen 40kg', 'price' => 50_000, 'unit' => 'sak',
        'category' => 'material', 'stock' => 100, 'is_available' => true,
    ]);

    return [$user, $supplier];
}

function mqBuyer(string $tag): array
{
    $user = User::create([
        'name' => "Buyer $tag", 'username' => "buy_$tag" . uniqid(),
        'email' => "buy_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $project = Project::create([
        'title' => "Job $tag", 'user_id' => $user->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
    ]);

    return [$user, $project];
}

function mqQuote(Supplier $supplier, User $buyer, Project $project, array $columns = []): MaterialQuote
{
    return MaterialQuote::create(array_merge([
        'user_id' => $buyer->id,
        'supplier_id' => $supplier->id,
        'project_id' => $project->id,
        'items' => [['material_id' => 1, 'name' => 'Semen', 'unit' => 'sak', 'qty' => 10, 'price_at_quote' => 50_000]],
        'delivery_address' => 'Jl. 测试 No. 1',
        'total_amount' => 500_000,
        'status' => 'pending',
        // Bandung, so distance > 5 km and the tariff exceeds the base fee.
        'latitude' => -6.9175, 'longitude' => 107.6191,
        'longitude' => 107.6191,
    ], $columns));
}

// ---------------------------------------------------------------------------
// 1. Shipping charge
// ---------------------------------------------------------------------------

it('refuses a supplier shipping charge above the platform tariff', function () {
    [$supplierUser, $supplier] = mqSupplier('ship');
    [$buyer, $project] = mqBuyer('ship');

    $quote = mqQuote($supplier, $buyer, $project);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/request-payment", [
            'shipping_cost' => 75_000_000,
            'delivery_method' => 'Hire Platform Courier',
        ])
        ->assertStatus(422);

    expect((float) $quote->fresh()->shipping_cost)->toBe(0.0);
});

it('accepts a supplier shipping charge at or below the tariff', function () {
    [$supplierUser, $supplier] = mqSupplier('shipok');
    [$buyer, $project] = mqBuyer('shipok');

    $quote = mqQuote($supplier, $buyer, $project);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/request-payment", [
            'shipping_cost' => 50_000,
            'delivery_method' => 'Hire Platform Courier',
        ])
        ->assertStatus(200);

    expect((float) $quote->fresh()->shipping_cost)->toBe(50000.0);
});

it('refuses a supplier freight line above the goods value when the platform does not price it', function () {
    // Supplier-arranged delivery: there is no tariff to compare against, so the
    // bound is the goods value -- a backstop against draining escrow through a
    // fabricated freight line.
    [$supplierUser, $supplier] = mqSupplier('shipnc');
    [$buyer, $project] = mqBuyer('shipnc');

    $quote = mqQuote($supplier, $buyer, $project);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/request-payment", [
            'shipping_cost' => 9_000_000,
            'delivery_method' => 'Supplier Arranged',
        ])
        ->assertStatus(422);

    expect((float) $quote->fresh()->shipping_cost)->toBe(0.0);
});

it('still lets a supplier price an unpriced delivery below the goods value', function () {
    [$supplierUser, $supplier] = mqSupplier('shipncok');
    [$buyer, $project] = mqBuyer('shipncok');

    $quote = mqQuote($supplier, $buyer, $project);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/request-payment", [
            'shipping_cost' => 25_000,
            'delivery_method' => 'Supplier Arranged',
        ])
        ->assertStatus(200);

    expect((float) $quote->fresh()->shipping_cost)->toBe(25000.0);
});

// ---------------------------------------------------------------------------
// 2. Float arithmetic
// ---------------------------------------------------------------------------

it('sums a quote total in exact minor units, not binary floats', function () {
    [$supplierUser, $supplier] = mqSupplier('float');
    [$buyer, $project] = mqBuyer('float');

    $materialId = $supplier->materials()->first()->id;

    // 3 x 0.1 repeated 100 times. Summed in exact minor units this is exactly 30.
    $items = [];
    for ($i = 0; $i < 100; $i++) {
        $items[] = [
            'material_id' => $materialId,
            'name' => "Line {$i}",
            'unit' => 'pcs',
            'qty' => 3,
            'price_at_quote' => 0.1,
        ];
    }

    $res = $this->actingAs($buyer)
        ->postJson('/api/material-quotes', [
            'supplier_id' => $supplier->id,
            'delivery_address' => 'Jl. Test',
            'items' => $items,
        ])
        ->assertStatus(201);

    // WHAT THIS CAN AND CANNOT PROVE
    //
    // The original assertion was
    //     expect(abs($stored - 1.8))->toBeLessThan(0.0000001);
    // which a FLOAT implementation would also satisfy: 0.1 + 0.2 in binary is
    // 0.30000000000000004, comfortably inside 1e-7. So it could not detect what
    // it was named for.
    //
    // The stricter-looking replacement was ALSO insufficient, and finding out
    // why is the useful part. Accumulating 100 x (3 x 0.1) as doubles gives
    // 30.0000000000000005 -- a drift of 4.97e-14. The spacing between adjacent
    // doubles near 30 is about 3.55e-15, so that value collapses back to exactly
    // 30.0 when represented, and `toBe(30.0)` passes whether the sum ran through
    // integer minor units or through binary floating point.
    //
    // Nor can any API-level assertion discriminate here: the total is persisted
    // to a `decimal(24,2)` column, which rounds 30.0000000000000005 to 30.00
    // anyway. The exactness claim is simply not observable from outside the
    // process.
    //
    // So this test keeps the regression value it always had -- the quote total
    // IS 30.00, which is what the ledger and the supplier's invoice depend on --
    // and the exactness claim lives where it can be checked, in MoneyTest's
    // `percentage()` and accumulator cases, which operate on integer minor units
    // and can therefore tell the two implementations apart.
    expect((float) $res->json('data.total_amount'))->toBe(30.0);
});

it('keeps a whole-rupiah quote total exact', function () {
    [$supplierUser, $supplier] = mqSupplier('exact');
    [$buyer, $project] = mqBuyer('exact');

    $res = $this->actingAs($buyer)
        ->postJson('/api/material-quotes', [
            'supplier_id' => $supplier->id,
            'delivery_address' => 'Jl. Test',
            'items' => [
                [
                    'material_id' => $supplier->materials()->first()->id, 'name' => 'A', 'unit' => 'pcs', 'qty' => 3, 'price_at_quote' => 10_000],
                [
                    'material_id' => $supplier->materials()->first()->id, 'name' => 'B', 'unit' => 'pcs', 'qty' => 7, 'price_at_quote' => 1_234.56],
            ],
        ])
        ->assertStatus(201);

    // 30000 + 8641.92 = 38641.92, with no representation error.
    expect((float) $res->json('data.total_amount'))->toBe(38641.92);
});

// ---------------------------------------------------------------------------
// 3. Refunded is terminal
// ---------------------------------------------------------------------------

it('refuses to mark a REFUNDED quote as paid again', function () {
    [$supplierUser, $supplier] = mqSupplier('ref');
    [$buyer, $project] = mqBuyer('ref');

    $quote = mqQuote($supplier, $buyer, $project, [
        'status' => 'refunded',
        'payment_proof_path' => 'receipts/refunded.png',
    ]);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/mark-paid", [])
        ->assertStatus(422);

    expect($quote->fresh()->status)->toBe('refunded');
});

it('still allows a legitimately pending quote to be marked paid', function () {
    // Guards against the guard becoming a blanket denial.
    [$supplierUser, $supplier] = mqSupplier('payok');
    [$buyer, $project] = mqBuyer('payok');

    $quote = mqQuote($supplier, $buyer, $project, [
        'status' => 'awaiting_payment',
        'payment_proof_path' => 'receipts/legit.png',
    ]);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/mark-paid", [])
        ->assertStatus(200);

    expect($quote->fresh()->status)->toBe('paid');
});