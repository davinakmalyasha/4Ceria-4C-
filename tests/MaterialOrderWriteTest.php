<?php

use App\Models\Material;
use App\Models\MaterialOrder;
use App\Models\MaterialOrderItem;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectRequirement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Material order writes: the status machine and payment verification
|--------------------------------------------------------------------------
|
| - verify-payment is seller-only, needs a proof, refuses settled/refunded
|   orders, posts ONE ledger row behind the dispute freeze, claims the stock
|   flag and decrements materials;
| - update is buyer-or-supplier per status: the buyer may complete a delivered
|   order or cancel an unprocessed one; the supplier may move any status but
|   `paid` (which requires a proof and delegates to verify-payment);
| - `delivered` increments `quantity_on_site` on requirements scoped to the
|   order's project; `cancelled` restores stock exactly once.
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
 * @return array{0: User, 1: User, 2: Supplier, 3: Project, 4: MaterialOrder, 5: Material, 6: ProjectRequirement}
 */
function mowScenario(string $tag, array $overrides = []): array
{
    $buyer = User::create([
        'name' => "WB {$tag}", 'username' => "wb_$tag" . uniqid(),
        'email' => "wb_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplierUser = User::create([
        'name' => "WS {$tag}", 'username' => "ws_$tag" . uniqid(),
        'email' => "ws_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $supplierUser->id, 'store_name' => "W Store {$tag}",
    ]);

    $project = Project::create([
        'title' => "Write {$tag}", 'user_id' => $buyer->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    $material = Material::create([
        'supplier_id' => $supplier->id, 'category' => 'Interior',
        'name' => "W Material {$tag}", 'price' => 100_000, 'unit' => 'pcs',
        'stock' => 10, 'is_available' => true,
    ]);

    $requirement = ProjectRequirement::create([
        'project_id' => $project->id, 'user_id' => $buyer->id,
        'name' => "W Requirement {$tag}", 'bom_type' => 'raw',
        'quantity_required' => 1, 'unit' => 'pcs', 'quality_level' => 'standard',
        'quantity_on_site' => 0,
    ]);

    $order = MaterialOrder::create(array_merge([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id, 'status' => 'pending',
        'total_price' => 1_000_000, 'shipping_cost' => 50_000,
        'whatsapp_order_id' => 'ORD-' . strtoupper(substr(uniqid(), -8)), 'notes' => 'note',
        'delivery_address' => 'Jl. Buyer 1',
    ], $overrides));

    MaterialOrderItem::create([
        'order_id' => $order->id, 'material_id' => $material->id,
        'requirement_id' => $requirement->id,
        'quantity' => 2, 'price_at_order' => 1_000_000,
    ]);

    return [$buyer, $supplierUser, $supplier, $project, $order, $material, $requirement];
}

it('verifies payment, writing one ledger row and decrementing stock', function () {
    [$buyer, $supplierUser, , $project, $order, $material] =
        mowScenario('pay', ['status' => 'pending', 'payment_proof_path' => 'payment_proofs/proof.png']);

    $response = $this->actingAs($supplierUser)
        ->postJson("/api/material-orders/{$order->id}/verify-payment")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Payment verified.')
        ->assertJsonPath('data.status', 'paid');

    // The route-bound model keeps its stale stock flag in the answer.
    expect($response->json('data.is_stock_decremented'))->toBe(0);
    expect($response->json('data.items'))->toHaveCount(1);

    $fresh = $order->fresh();
    expect($fresh->status)->toBe('paid');
    expect($fresh->paid_at)->not->toBeNull();
    expect((int) $fresh->is_stock_decremented)->toBe(1);
    expect($material->fresh()->stock)->toBe(8);

    $ledger = ProjectBudgetTransaction::where('reference_id', $order->id)
        ->where('transaction_type', 'payment')->sole();
    expect((float) $ledger->amount)->toBe(1050000.0);

    expect(\App\Models\Notification::where('user_id', $buyer->id)
        ->where('type', 'payment_verified')->count())->toBe(1);
});

it('refuses verification without a proof, from the buyer, or when settled', function () {
    [$buyer, $supplierUser, , , $order] = mowScenario('guard');

    $this->actingAs($supplierUser)
        ->postJson("/api/material-orders/{$order->id}/verify-payment")
        ->assertStatus(422)
        ->assertJsonPath('message', 'No payment proof has been uploaded yet.');

    $order->update(['payment_proof_path' => 'payment_proofs/proof.png']);
    $this->actingAs($buyer)
        ->postJson("/api/material-orders/{$order->id}/verify-payment")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the seller of this order can verify its payment.');

    $order->update(['status' => 'paid']);
    $this->actingAs($supplierUser)
        ->postJson("/api/material-orders/{$order->id}/verify-payment")
        ->assertStatus(422)
        ->assertJsonPath('message', 'This order is already marked as paid.');

    $order->update(['status' => 'refunded']);
    $this->actingAs($supplierUser)
        ->postJson("/api/material-orders/{$order->id}/verify-payment")
        ->assertStatus(422)
        ->assertJsonPath('message', 'This order was refunded, so its payment cannot be verified again.');
});

it('walks the status machine and syncs stock and site inventory', function () {
    [$buyer, $supplierUser, , , $order, $material, $requirement] = mowScenario('flow');

    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'processing'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'processing');

    expect($material->fresh()->stock)->toBe(8);

    // Delivered adds the item quantity to the project's requirement.
    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'shipping'])
        ->assertStatus(200);
    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'delivered'])
        ->assertStatus(200)
        ->assertJsonPath('data.delivered_at', fn ($value) => $value !== null);

    expect((float) $requirement->fresh()->quantity_on_site)->toBe(2.0);

    // The buyer completes a delivered order.
    $this->actingAs($buyer)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'completed'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'completed');

    // A buyer cannot cancel a processing order.
    $order->update(['status' => 'processing']);
    $this->actingAs($buyer)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'cancelled'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized to update this status');

    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'cancelled'])
        ->assertStatus(200);

    // Restoring stock happens exactly once.
    expect($material->fresh()->stock)->toBe(10);
});

it('delegates a paid update to the verification path', function () {
    [$buyer, $supplierUser, , , $order, $material] =
        mowScenario('delegate', ['status' => 'pending', 'payment_proof_path' => 'payment_proofs/proof.png']);

    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'paid'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Payment verified.');

    expect($order->fresh()->status)->toBe('paid');
    expect(ProjectBudgetTransaction::where('reference_id', $order->id)->count())->toBe(1);
    expect($material->fresh()->stock)->toBe(8);

    // A second paid update on an ALREADY-paid order is a no-op status write
    // (the delegation guard only fires while the order is not yet paid), and
    // it must not add a second ledger row.
    $this->actingAs($supplierUser)
        ->putJson("/api/material-orders/{$order->id}", ['status' => 'paid'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'paid');

    expect(ProjectBudgetTransaction::where('reference_id', $order->id)->count())->toBe(1);
});
