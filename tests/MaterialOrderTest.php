<?php

use App\Models\MaterialOrder;
use App\Models\MaterialOrderItem;
use App\Models\Project;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Material orders: list, show and the buyer's payment proof
|--------------------------------------------------------------------------
|
| - the list shows the caller's own orders and, for a supplier account, the
|   orders addressed to their store; newest first, with supplier/user/project/
|   items.material/review/deliveryJob;
| - show is buyer-or-supplier only (403 "Unauthorized") with four relations;
| - the receipt upload is buyer-or-assigned-PM, only while pending or
|   awaiting_payment, and lands on the PRIVATE vault. Reading the supplier for
|   the notification leaves that relation loaded on the answer.
|
| update and verify-payment move stock and escrow and are still proxied.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    Storage::fake(config('filesystems.vault_disk', 'railway'));
    Storage::fake('public');
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: User, 2: Supplier, 3: Project, 4: MaterialOrder}
 */
function morScenario(string $tag, array $overrides = []): array
{
    $buyer = User::create([
        'name' => "OB {$tag}", 'username' => "ob_$tag" . uniqid(),
        'email' => "ob_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplierUser = User::create([
        'name' => "OS {$tag}", 'username' => "os_$tag" . uniqid(),
        'email' => "os_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $supplierUser->id, 'store_name' => "O Store {$tag}",
        'address' => 'Jl. Supplier 1',
    ]);

    $project = Project::create([
        'title' => "Order {$tag}", 'user_id' => $buyer->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    $order = MaterialOrder::create(array_merge([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id, 'status' => 'pending',
        'total_price' => 1_000_000, 'shipping_cost' => 50_000,
        'whatsapp_order_id' => 'ORD-AAAABBBB', 'notes' => 'note',
        'delivery_address' => 'Jl. Buyer 1', 'address_detail' => 'Unit B',
    ], $overrides));

    MaterialOrderItem::create([
        'order_id' => $order->id, 'material_id' => 272,
        'quantity' => 1, 'price_at_order' => 1_000_000,
    ]);

    return [$buyer, $supplierUser, $supplier, $project, $order];
}

it('lists the caller orders and a supplier store incoming ones', function () {
    [$buyer, $supplierUser, , , $order] = morScenario('idx');

    $mine = $this->actingAs($buyer)
        ->getJson('/api/material-orders')
        ->assertStatus(200);
    expect($mine->json('success'))->toBeTrue();
    expect($mine->json('data'))->toHaveCount(1);
    expect($mine->json('data.0.id'))->toBe($order->id);
    expect($mine->json('data.0.items.0.material.id'))->toBe(272);
    expect($mine->json('data.0.review'))->toBeNull();
    expect($mine->json('data.0.delivery_job'))->toBeNull();
    // No cast on is_stock_decremented: MySQL's tinyint is 0.
    expect($mine->json('data.0.is_stock_decremented'))->toBe(0);

    $incoming = $this->actingAs($supplierUser)
        ->getJson('/api/material-orders')
        ->assertStatus(200);
    expect($incoming->json('data'))->toHaveCount(1);

    $other = User::create([
        'name' => 'Other', 'username' => 'oth' . uniqid(),
        'email' => 'oth' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $this->actingAs($other)
        ->getJson('/api/material-orders')
        ->assertStatus(200)
        ->assertExactJson(['success' => true, 'data' => []]);
});

it('shows an order to its buyer and supplier only', function () {
    [$buyer, $supplierUser, , , $order] = morScenario('show');

    $response = $this->actingAs($buyer)
        ->getJson("/api/material-orders/{$order->id}")
        ->assertStatus(200);

    expect($response->json('data.id'))->toBe($order->id);
    expect(array_slice(array_keys($response->json('data')), -4))
        ->toBe(['supplier', 'user', 'project', 'items']);
    expect($response->json('data.supplier.id'))->toBe($order->supplier_id);
    expect($response->json('data.project.id'))->toBe($order->project_id);
    expect($response->json('data.items.0.material.name'))->toContain('Sofa');

    $this->actingAs($supplierUser)
        ->getJson("/api/material-orders/{$order->id}")
        ->assertStatus(200);

    $stranger = User::create([
        'name' => 'Stranger', 'username' => 'str' . uniqid(),
        'email' => 'str' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $this->actingAs($stranger)
        ->getJson("/api/material-orders/{$order->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    $this->actingAs($buyer)
        ->getJson('/api/material-orders/999999999')
        ->assertStatus(404);
});

it('lets the buyer upload a receipt on an awaiting order', function () {
    [$buyer, , $supplier, , $order] = morScenario('proof');

    $response = $this->actingAs($buyer)
        ->post("/api/material-orders/{$order->id}/payment-proof", [
            'payment_proof' => UploadedFile::fake()->image('receipt.jpg'),
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Payment proof uploaded. Waiting for supplier verification.');

    // The supplier lookup for the notification leaves the relation loaded.
    expect($response->json('data.supplier.id'))->toBe($supplier->id);
    $path = $order->fresh()->payment_proof_path;
    expect($path)->not->toBeNull();
    Storage::disk(config('filesystems.vault_disk', 'railway'))->assertExists($path);

    expect(\App\Models\Notification::where('user_id', $supplier->user_id)
        ->where('type', 'order_payment_proof')->count())->toBe(1);

    // A settled order refuses another receipt.
    $order->update(['status' => 'paid']);
    $this->actingAs($buyer)
        ->post("/api/material-orders/{$order->id}/payment-proof", [
            'payment_proof' => UploadedFile::fake()->image('receipt2.jpg'),
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This order is not awaiting payment (current: paid).');

    // Only the buyer (or assigned PM) may upload.
    $order->update(['status' => 'pending']);
    $this->actingAs($supplierUser ?? User::find($order->supplier->user_id))
        ->post("/api/material-orders/{$order->id}/payment-proof", [
            'payment_proof' => UploadedFile::fake()->image('receipt3.jpg'),
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the buyer can upload a payment proof.');
});
