<?php

use App\Models\Material;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Marketplace: public supplier directory and material listing
|--------------------------------------------------------------------------
|
| Both routes are UNAUTHENTICATED and strip identity fields from the owner's
| user payload (email, google/two-factor, bank details, unique_code).
|
| - GET /marketplace/suppliers: verified only, `materials_count` (available),
|   `reviews_avg_rating`, `reviews_count`, THEN user;
| - GET /marketplace/suppliers/{id}: two review aggregates only (no
|   materials_count), then user, available materials, reviews; 404 with the
|   binding message for a missing id;
| - GET /marketplace/materials: available rows of VERIFIED suppliers, with
|   supplier.user and images; `latest()` ties arrive id DESCENDING.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mktSupplier(string $tag, string $status = 'verified'): array
{
    $user = User::create([
        'name' => "MKT $tag", 'username' => "mk_$tag" . uniqid(),
        'email' => "mk_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $user->id, 'store_name' => "MKT Store $tag",
        'category' => 'Furniture', 'verification_status' => $status,
        'latitude' => -6.2, 'longitude' => 106.8,
    ]);

    return [$user, $supplier];
}

function mktMaterial(Supplier $supplier, string $name, array $overrides = []): Material
{
    return Material::create(array_merge([
        'supplier_id' => $supplier->id, 'category' => 'Furniture', 'name' => $name,
        'price' => 100, 'unit' => 'pcs', 'stock' => 5, 'is_available' => true,
    ], $overrides));
}

it('lists only verified suppliers with hidden owner fields', function () {
    [$user, $supplier] = mktSupplier('list');
    [, $hidden] = mktSupplier('hidden', 'pending');
    mktMaterial($supplier, 'Sofa');

    // The live fixture owns one verified supplier too: scope by store name.
    $response = $this->getJson('/api/marketplace/suppliers?search=MKT Store list')
        ->assertStatus(200)
        ->assertJsonPath('status', 'success');

    expect($response->json('data'))->toHaveCount(1);
    $row = $response->json('data.0');
    expect($row['id'])->toBe($supplier->id);
    expect($row['materials_count'])->toBe(1);
    expect($row['reviews_count'])->toBe(0);
    expect($row['reviews_avg_rating'])->toBeNull();
    // The owner card is present but stripped of identity data.
    expect($row['user']['id'])->toBe($user->id);
    expect($row['user'])->not->toHaveKeys(['email', 'unique_code', 'bank_name']);

    // A search filter narrows the list.
    $this->getJson('/api/marketplace/suppliers?search=Nope')
        ->assertStatus(200)
        ->assertExactJson(['status' => 'success', 'data' => []]);
});

it('shows one supplier with available materials and reviews', function () {
    [$user, $supplier] = mktSupplier('show');
    mktMaterial($supplier, 'Sofa');
    mktMaterial($supplier, 'Hidden', ['is_available' => false]);

    $response = $this->getJson("/api/marketplace/suppliers/{$supplier->id}")
        ->assertStatus(200);

    $data = $response->json('data');
    expect(array_keys($data))->toBe([
        'id', 'user_id', 'store_name', 'address', 'no_telp', 'category', 'bio',
        'verification_status', 'rejection_reason', 'foto', 'created_at',
        'updated_at', 'detail_location', 'latitude', 'longitude',
        'reviews_avg_rating', 'reviews_count', 'user', 'materials', 'reviews',
    ]);
    // No materials_count on the show payload.
    expect($data)->not->toHaveKey('materials_count');
    expect($data['materials'])->toHaveCount(1);
    expect($data['materials'][0]['name'])->toBe('Sofa');
    expect($data['reviews'])->toBe([]);
    expect($data['user'])->not->toHaveKey('email');

    $this->getJson('/api/marketplace/suppliers/999999999')
        ->assertStatus(404)
        ->assertJsonPath('message', 'No query results for model [App\\Models\\Supplier] 999999999');
});

it('lists available marketplace materials with the owner card and filters', function () {
    [$user, $supplier] = mktSupplier('mat');
    [, $pending] = mktSupplier('pend', 'pending');
    // A category no fixture row uses, so the list is only this test's rows.
    $first = mktMaterial($supplier, 'Sofa', ['price' => 100, 'category' => 'MktCat']);
    $second = mktMaterial($supplier, 'Lamp', ['price' => 50, 'category' => 'MktCat']);
    mktMaterial($supplier, 'Unavailable', ['is_available' => false, 'category' => 'MktCat']);
    mktMaterial($pending, 'Unverified', ['category' => 'MktCat']);

    $response = $this->getJson('/api/marketplace/materials?category=MktCat')
        ->assertStatus(200)
        ->assertJsonPath('status', 'success');

    // Same-second rows come back id DESCENDING for this query shape.
    expect(array_column($response->json('data'), 'id'))->toBe([$second->id, $first->id]);
    $card = $response->json('data.0');
    expect($card['supplier']['user']['id'])->toBe($user->id);
    expect($card['supplier']['user'])->not->toHaveKey('email');
    expect($card['images'])->toBe([]);

    $searched = $this->getJson('/api/marketplace/materials?category=MktCat&search=Sof')
        ->assertStatus(200);
    expect(array_column($searched->json('data'), 'id'))->toBe([$first->id]);

    $priced = $this->getJson('/api/marketplace/materials?category=MktCat&max_price=60')
        ->assertStatus(200);
    expect(array_column($priced->json('data'), 'id'))->toBe([$second->id]);
});
