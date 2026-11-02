<?php

use App\Models\MaterialOrder;
use App\Models\MaterialOrderItem;
use App\Models\MaterialQuote;
use App\Models\Project;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Material quote lifecycle: request payment, approve, post delivery job
|--------------------------------------------------------------------------
|
| - the supplier may DISCOUNT below the platform tariff (Rp 50.000 for the
|   first 5 km, Rp 4.000 per extra km over a 1.3x-routed Haversine) but never
|   exceed it;
| - approve creates the order, its items and — for the platform courier — the
|   delivery job in one transaction, with total = goods + shipping;
| - post-delivery-job forces the platform courier, prices it against the same
|   tariff and queues the job with the store's pickup address.
|
| The payment-proof / mark-paid pair already has its own B11 regression suite
| (tests/MaterialQuotePaymentTest.php).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: Supplier, 3: Project, 4: MaterialQuote}
 */
function mqlScenario(string $tag, array $overrides = []): array
{
    $buyer = User::create([
        'name' => "MLB {$tag}", 'username' => "mlb_$tag" . uniqid(),
        'email' => "mlb_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplierUser = User::create([
        'name' => "MLS {$tag}", 'username' => "mls_$tag" . uniqid(),
        'email' => "mls_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $supplierUser->id, 'store_name' => "ML Store {$tag}",
        'address' => 'Jl. Supplier 1', 'detail_location' => 'Blok A',
        'latitude' => -6.2, 'longitude' => 106.8,
    ]);

    $project = Project::create([
        'title' => "ML {$tag}", 'user_id' => $buyer->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    $quote = MaterialQuote::create(array_merge([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id,
        'items' => [['material_id' => 272, 'name' => 'Sofa', 'price_at_quote' => 1_000_000, 'qty' => 1, 'unit' => 'pcs']],
        'delivery_address' => 'Jl. Buyer 1', 'address_detail' => 'Unit B',
        'total_amount' => 1_000_000, 'shipping_cost' => 0,
        'status' => 'pending', 'delivery_method' => 'Supplier Fleet',
        'latitude' => -6.21, 'longitude' => 106.81, 'total_weight' => 10,
    ], $overrides));

    return [$buyer, $supplierUser, $supplier, $project, $quote];
}

it('caps the requested shipping at the platform tariff', function () {
    [$buyer, $supplierUser, , , $quote] = mqlScenario('rp');

    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/request-payment", [
            'shipping_cost' => 40000, 'delivery_method' => 'Hire Platform Courier',
            'total_weight' => '10',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Payment requested from buyer.')
        ->assertJsonPath('data.status', 'awaiting_payment')
        ->assertJsonPath('data.shipping_cost', '40000.00');

    expect($quote->fresh()->delivery_method)->toBe('Hire Platform Courier');

    // Above the Rp 50.000 tariff (distance is well under 5 km).
    $this->actingAs($supplierUser)
        ->putJson("/api/material-quotes/{$quote->id}/request-payment", [
            'shipping_cost' => 60000, 'delivery_method' => 'Hire Platform Courier',
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Shipping cost exceeds the platform tariff for this delivery method. The maximum chargeable is Rp 50.000. Lower your figure or arrange delivery outside the platform.');

    // Only the quote's supplier may name a shipping charge.
    $this->actingAs($buyer)
        ->putJson("/api/material-quotes/{$quote->id}/request-payment", [
            'shipping_cost' => 40000, 'delivery_method' => 'Hire Platform Courier',
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');
});

it('approves a quote into an order, items and a delivery job', function () {
    [, $supplierUser, $supplier, , $quote] = mqlScenario('ap');

    $response = $this->actingAs($supplierUser)
        ->postJson("/api/material-quotes/{$quote->id}/approve", [
            'delivery_method' => 'Hire Platform Courier',
            'notes' => 'approved ok', 'total_weight' => '10',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Quote approved and order created.');

    expect($response->json('order.total_price'))->toBe('1050000.00');
    expect($response->json('order.shipping_cost'))->toBe('50000.00');
    expect($response->json('order.whatsapp_order_id'))->toMatch('/^ORD-[A-F0-9]{8}$/');
    expect($response->json('order.items'))->toHaveCount(1);
    expect($response->json('order.items.0.quantity'))->toBe(1);
    expect($response->json('order.items.0.price_at_order'))->toBe('1000000.00');
    expect($response->json('order.items.0.material.id'))->toBe(272);

    expect($quote->fresh()->status)->toBe('approved');

    $order = MaterialOrder::where('supplier_id', $supplier->id)->sole();
    expect($order->total_price)->toBe('1050000.00');
    expect(MaterialOrderItem::where('order_id', $order->id)->count())->toBe(1);

    $job = DB::table('delivery_jobs')->where('quote_id', $quote->id)->first();
    expect($job)->not->toBeNull();
    expect((float) $job->agreed_fee)->toBe(50000.0);
    expect($job->status)->toBe('pending');
    expect($job->pickup_address)->toBe('ML Store ap — Jl. Supplier 1');

    // A second approval is refused and creates nothing.
    $this->actingAs($supplierUser)
        ->postJson("/api/material-quotes/{$quote->id}/approve", [])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Quote already approved');

    expect(MaterialOrder::where('supplier_id', $supplier->id)->count())->toBe(1);
});

it('posts a platform-courier delivery job against the same tariff', function () {
    [, $supplierUser, , , $quote] = mqlScenario('dj');

    $this->actingAs($supplierUser)
        ->postJson("/api/material-quotes/{$quote->id}/post-delivery-job", [
            'shipping_cost' => 50000, 'total_weight' => '10',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Delivery job posted.')
        ->assertJsonPath('data.status', 'awaiting_courier')
        ->assertJsonPath('data.delivery_method', 'Hire Platform Courier');

    $job = DB::table('delivery_jobs')->where('quote_id', $quote->id)->sole();
    expect((float) $job->agreed_fee)->toBe(50000.0);
    // post-delivery-job appends the store's detail_location.
    expect($job->pickup_address)->toBe('ML Store dj — Jl. Supplier 1 (Blok A)');

    $this->actingAs($supplierUser)
        ->postJson("/api/material-quotes/{$quote->id}/post-delivery-job", [
            'shipping_cost' => 60000,
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Shipping cost exceeds the platform courier tariff. The maximum chargeable is Rp 50.000. Lower your figure or arrange delivery outside the platform.');
});
