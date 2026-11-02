<?php

use App\Models\Material;
use App\Models\MaterialImage;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Merchant: profile and catalogue
|--------------------------------------------------------------------------
|
| - GET/PUT /merchant/profile are supplier-only (403 "Unauthorized");
| - the first GET CREATES a blank profile (`"<name>'s Store"`, pending) and
|   answers the CREATED model (payload order, unset columns absent);
| - PUT validates by hand, so a failure is a BARE `{errors}` 422 with no
|   `message`, and answers `{status, message, data}`;
| - GET /merchant/materials has NO role gate: it resolves the supplier by user
|   id (404 when absent) and lists the store's materials with images.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function merchUser(string $tag, string $role): User
{
    return User::create([
        'name' => "Merchant $tag", 'username' => "mc_$tag" . uniqid(),
        'email' => "mc_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

it('refuses the profile endpoints to non-suppliers', function () {
    $user = merchUser('gate', 'user');

    $this->actingAs($user)
        ->getJson('/api/merchant/profile')
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    $this->actingAs($user)
        ->putJson('/api/merchant/profile', ['store_name' => 'x'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');
});

it('creates a blank profile on the first read with the created order', function () {
    $supplier = merchUser('new', 'supplier');

    $response = $this->actingAs($supplier)
        ->getJson('/api/merchant/profile')
        ->assertStatus(200)
        ->assertJsonPath('status', 'success');

    expect(array_keys($response->json('data')))->toBe([
        'user_id', 'store_name', 'verification_status', 'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.store_name'))->toBe("Merchant new's Store");
    expect($response->json('data.verification_status'))->toBe('pending');

    // A second read answers the HYDRATED row (table order, nulls present).
    $second = $this->actingAs($supplier)
        ->getJson('/api/merchant/profile')
        ->assertStatus(200);
    expect(array_keys($second->json('data')))->toBe([
        'id', 'user_id', 'store_name', 'address', 'no_telp', 'category', 'bio',
        'verification_status', 'rejection_reason', 'foto', 'created_at',
        'updated_at', 'detail_location', 'latitude', 'longitude',
    ]);
});

it('updates the profile and answers a bare errors envelope', function () {
    $supplier = merchUser('upd', 'supplier');
    $row = Supplier::create([
        'user_id' => $supplier->id, 'store_name' => 'Parity Store',
        'address' => 'Jl. Lama', 'latitude' => -6.2, 'longitude' => 106.8,
        'verification_status' => 'verified',
    ]);

    $response = $this->actingAs($supplier)
        ->putJson('/api/merchant/profile', [
            'store_name' => 'Parity Store Updated', 'address' => 'Jl. Baru',
            'latitude' => -6.3, 'longitude' => 106.9,
            'no_telp' => '0813', 'category' => 'Furniture', 'bio' => 'new',
            'detail_location' => 'Blok B',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Profile updated successfully');

    expect($response->json('data.store_name'))->toBe('Parity Store Updated');
    expect($row->fresh()->address)->toBe('Jl. Baru');
    expect((float) $row->fresh()->latitude)->toBe(-6.3);

    $invalid = $this->actingAs($supplier)
        ->putJson('/api/merchant/profile', [])
        ->assertStatus(422);

    // The controller's own validator: errors only, no `message`.
    expect(array_keys($invalid->json()))->toBe(['errors']);
    expect($invalid->json('errors.store_name'))->toBe(['The store name field is required.']);
});

it('lists the merchant catalogue with images and filters', function () {
    $supplierUser = merchUser('cat', 'supplier');
    $supplier = Supplier::create(['user_id' => $supplierUser->id, 'store_name' => 'Catalogue Store']);
    $first = Material::create([
        'supplier_id' => $supplier->id, 'category' => 'Furniture', 'name' => 'Sofa',
        'price' => 100, 'unit' => 'pcs', 'stock' => 5, 'is_available' => true,
    ]);
    MaterialImage::create(['material_id' => $first->id, 'image_path' => 'materials/a.jpg']);
    Material::create([
        'supplier_id' => $supplier->id, 'category' => 'Decor', 'name' => 'Lamp',
        'price' => 50, 'unit' => 'pcs', 'stock' => 2, 'is_available' => true,
    ]);

    $response = $this->actingAs($supplierUser)
        ->getJson('/api/merchant/materials')
        ->assertStatus(200)
        ->assertJsonPath('status', 'success');

    expect($response->json('data'))->toHaveCount(2);
    $card = $response->json('data.0');
    expect($card['images'])->toHaveCount(1);
    expect($card['images'][0]['image_path'])->toBe('materials/a.jpg');
    expect($card['price'])->toBe('100.00');

    $filtered = $this->actingAs($supplierUser)
        ->getJson('/api/merchant/materials?category=Decor')
        ->assertStatus(200);
    expect($filtered->json('data'))->toHaveCount(1);
    expect($filtered->json('data.0.name'))->toBe('Lamp');

    $searched = $this->actingAs($supplierUser)
        ->getJson('/api/merchant/materials?search=Sof')
        ->assertStatus(200);
    expect($searched->json('data'))->toHaveCount(1);

    // A user without a supplier row is a 404 (firstOrFail).
    $stranger = merchUser('nostore', 'user');
    $this->actingAs($stranger)
        ->getJson('/api/merchant/materials')
        ->assertStatus(404);
});
