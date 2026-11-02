<?php

use App\Models\Material;
use App\Models\MaterialOrder;
use App\Models\MaterialOrderItem;
use App\Models\MaterialOrderReview;
use App\Models\Project;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Material order reviews: create, edit, delete and the supplier allowlist
|--------------------------------------------------------------------------
|
| - the buyer may review an order only once, and only after it ARRIVED
|   (order delivered/completed, or a delivery job in delivered/completed);
| - validation failures answer a BARE {"errors": …} 422;
| - update/delete are author-only, and `images` replace the old set;
| - GET suppliers/{id}/reviews exposes an ALLOWLIST: rating, comment, images
|   and only the two order facts a buyer needs — never the address,
|   coordinates, receipt path or internal notes.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    Storage::fake('public');
    Storage::fake(config('filesystems.vault_disk', 'railway'));
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * @return array{0: User, 1: Supplier, 2: MaterialOrder, 3: Material}
 */
function mreScenario(string $tag, string $status = 'delivered'): array
{
    $buyer = User::create([
        'name' => "RB {$tag}", 'username' => "rb_$tag" . uniqid(),
        'email' => "rb_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $supplier = Supplier::create([
        'user_id' => User::create([
            'name' => "RS {$tag}", 'username' => "rs_$tag" . uniqid(),
            'email' => "rs_$tag" . uniqid() . '@example.test',
            'password' => Hash::make('password123'), 'role_type' => 'supplier',
        ])->id,
        'store_name' => "R Store {$tag}",
    ]);

    $project = Project::create([
        'title' => "Review {$tag}", 'user_id' => $buyer->id,
        'budget' => 500_000_000, 'status' => 'in_progress',
    ]);

    $material = Material::create([
        'supplier_id' => $supplier->id, 'category' => 'Interior',
        'name' => "R Material {$tag}", 'price' => 100_000, 'unit' => 'pcs',
        'stock' => 10, 'is_available' => true,
    ]);

    $order = MaterialOrder::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'project_id' => $project->id, 'status' => $status,
        'total_price' => 1_000_000, 'shipping_cost' => 50_000,
        'whatsapp_order_id' => 'ORD-' . strtoupper(substr(uniqid(), -8)),
        'delivery_address' => 'Jl. Rahasia 1', 'address_detail' => 'Unit X',
        'latitude' => -6.2, 'longitude' => 106.8,
    ]);
    MaterialOrderItem::create([
        'order_id' => $order->id, 'material_id' => $material->id,
        'quantity' => 1, 'price_at_order' => 1_000_000,
    ]);

    return [$buyer, $supplier, $order, $material];
}

it('creates one review for an arrived order', function () {
    [$buyer, , $order] = mreScenario('new');

    $response = $this->actingAs($buyer)
        ->post("/api/material-order-reviews", [
            'order_id' => $order->id, 'rating' => 5,
            'comment' => 'great', 'delivery_rating' => 4,
            'delivery_comment' => 'fast',
            'shop_images' => [UploadedFile::fake()->image('shop.jpg')],
            'delivery_images' => [UploadedFile::fake()->image('drop.jpg')],
        ])
        ->assertStatus(200)
        ->assertJsonPath('status', 'success')
        ->assertJsonPath('message', 'Thank you for your feedback!');

    expect(array_keys($response->json('data')))->toBe([
        'user_id', 'supplier_id', 'order_id', 'rating', 'comment',
        'delivery_rating', 'delivery_comment', 'delivery_user_id',
        'image_paths', 'delivery_image_paths', 'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.rating'))->toBe(5);
    expect($response->json('data.image_paths.0'))->toStartWith('reviews/shop/');
    expect($response->json('data.delivery_image_paths.0'))->toStartWith('reviews/delivery/');

    // Only once.
    $this->actingAs($buyer)
        ->postJson('/api/material-order-reviews', ['order_id' => $order->id, 'rating' => 4])
        ->assertStatus(400)
        ->assertJsonPath('message', 'You have already reviewed this order.');

    // Only the buyer.
    $stranger = User::create([
        'name' => 'Out', 'username' => 'out' . uniqid(),
        'email' => 'out' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $other = MaterialOrder::create([
        'user_id' => $stranger->id, 'supplier_id' => $order->supplier_id,
        'status' => 'delivered', 'total_price' => 1000,
        'whatsapp_order_id' => 'ORD-' . strtoupper(substr(uniqid(), -8)),
    ]);
    $this->actingAs($stranger)
        ->postJson('/api/material-order-reviews', ['order_id' => $order->id, 'rating' => 5])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');
});

it('refuses a review before arrival and answers a bare errors envelope', function () {
    [$buyer, , $order] = mreScenario('late', 'shipping');

    $this->actingAs($buyer)
        ->postJson('/api/material-order-reviews', ['order_id' => $order->id, 'rating' => 5])
        ->assertStatus(400)
        ->assertJsonPath('message', 'Only arrived or completed orders can be reviewed.');

    $invalid = $this->actingAs($buyer)
        ->postJson('/api/material-order-reviews', ['rating' => 9])
        ->assertStatus(422);

    expect(array_keys($invalid->json()))->toBe(['errors']);
    expect($invalid->json('errors'))->toHaveKeys(['order_id', 'rating']);
    expect($invalid->json('errors.rating'))->toBe(['The rating field must not be greater than 5.']);
});

it('updates and deletes the review as its author', function () {
    [$buyer, , $order] = mreScenario('edit');

    $review = MaterialOrderReview::create([
        'user_id' => $buyer->id, 'supplier_id' => $order->supplier_id,
        'order_id' => $order->id, 'rating' => 5, 'comment' => 'first',
        'image_paths' => [], 'delivery_image_paths' => [],
    ]);

    $response = $this->actingAs($buyer)
        ->post("/api/material-order-reviews/{$review->id}", [
            '_method' => 'PUT',
            'rating' => 4, 'comment' => 'updated',
            'images' => [UploadedFile::fake()->image('new.jpg')],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Review updated successfully!');

    expect($response->json('data.rating'))->toBe(4);
    expect($response->json('data.image_paths.0'))->toStartWith('reviews/materials/');

    $stranger = User::create([
        'name' => 'No', 'username' => 'no' . uniqid(),
        'email' => 'no' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $this->actingAs($stranger)
        ->putJson("/api/material-order-reviews/{$review->id}", ['rating' => 1])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    $this->actingAs($stranger)
        ->deleteJson("/api/material-order-reviews/{$review->id}")
        ->assertStatus(403);

    $this->actingAs($buyer)
        ->deleteJson("/api/material-order-reviews/{$review->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Review deleted successfully.');

    expect(MaterialOrderReview::find($review->id))->toBeNull();
});

it('exposes only the allowlisted review fields for a supplier', function () {
    [$buyer, $supplier, $order, $material] = mreScenario('list');

    MaterialOrderReview::create([
        'user_id' => $buyer->id, 'supplier_id' => $supplier->id,
        'order_id' => $order->id, 'rating' => 5, 'comment' => 'solid',
        'image_paths' => ['reviews/shop/a.jpg'], 'delivery_image_paths' => [],
    ]);

    $response = $this->actingAs($buyer)
        ->getJson("/api/suppliers/{$supplier->id}/reviews")
        ->assertStatus(200)
        ->assertJsonPath('status', 'success');

    $entry = $response->json('data.0');
    expect(array_keys($entry))->toBe([
        'id', 'rating', 'comment', 'image_path', 'image_paths', 'created_at',
        'delivery_rating', 'delivery_comment', 'delivery_image_paths',
        'reviewer', 'order',
    ]);
    expect($entry['reviewer'])->toBe([
        'id' => $buyer->id, 'name' => $buyer->name, 'pic' => null,
    ]);
    expect($entry['order']['total_price'])->toBe('1000000.00');
    expect($entry['order']['items'][0]['name'])->toBe($material->name);
    expect($entry['order']['items'][0]['qty'])->toBe(1);

    // The buyer's private order facts never appear.
    $encoded = json_encode($entry);
    expect($encoded)->not->toContain('Jl. Rahasia 1');
    expect($encoded)->not->toContain('106.8');
    expect($encoded)->not->toContain('whatsapp_order_id');
    expect($encoded)->not->toContain('delivery_address');

    // Filtering by rating works.
    $this->actingAs($buyer)
        ->getJson("/api/suppliers/{$supplier->id}/reviews?rating=3")
        ->assertStatus(200)
        ->assertExactJson(['status' => 'success', 'data' => []]);
});
