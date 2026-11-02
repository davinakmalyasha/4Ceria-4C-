<?php

use App\Models\Material;
use App\Models\MaterialImage;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Merchant material writes
|--------------------------------------------------------------------------
|
| - POST: supplier-scoped (firstOrFail → 404), hand-built validator → BARE
|   `{errors}` 422, and the CREATED model in `only([...])` order + supplier_id,
|   timestamps, id, then images;
| - PUT: only the caller's OWN material (404 otherwise), updates present keys,
|   validates deleted_image_ids against material_images, answers the HYDRATED
|   model in table order;
| - DELETE: files + row, `{status, message}` with no data.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mwSupplier(string $tag): array
{
    $user = User::create([
        'name' => "MW $tag", 'username' => "mw_$tag" . uniqid(),
        'email' => "mw_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $user->id, 'store_name' => "MW Store $tag",
        'verification_status' => 'verified',
    ]);

    return [$user, $supplier];
}

function mwMaterial(Supplier $supplier, array $overrides = []): Material
{
    return Material::create(array_merge([
        'supplier_id' => $supplier->id, 'name' => 'Seed Material',
        'description' => 'd', 'price' => 100, 'unit' => 'pcs',
        'category' => 'Test', 'stock' => 1, 'is_available' => true,
    ], $overrides));
}

it('creates a material in the only() order with a bare errors envelope', function () {
    [$user, $supplier] = mwSupplier('store');

    $response = $this->actingAs($user)
        ->postJson('/api/merchant/materials', [
            'name' => 'Parity Material', 'description' => 'd',
            'price' => 12345, 'unit' => 'pcs', 'category' => 'Test',
            'stock' => 7, 'specifications' => ['color' => 'grey'],
        ])
        ->assertStatus(200)
        ->assertJsonPath('status', 'success')
        ->assertJsonPath('message', 'Material added successfully with multiple images');

    expect(array_keys($response->json('data')))->toBe([
        'name', 'description', 'price', 'unit', 'category', 'stock',
        'specifications', 'supplier_id', 'updated_at', 'created_at', 'id', 'images',
    ]);
    // The decimal:2 cast renders two places.
    expect($response->json('data.price'))->toBe('12345.00');
    expect($response->json('data.images'))->toBe([]);

    $invalid = $this->actingAs($user)
        ->postJson('/api/merchant/materials', [])
        ->assertStatus(422);
    // The controller's own validator: errors only, no message.
    expect(array_keys($invalid->json()))->toBe(['errors']);
    expect($invalid->json('errors'))->toHaveKeys(['name', 'price', 'unit', 'category']);

    // A user with no supplier row is a 404 (firstOrFail).
    $stranger = User::create([
        'name' => 'No Store', 'username' => 'ns' . uniqid(),
        'email' => 'ns' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $this->actingAs($stranger)
        ->postJson('/api/merchant/materials', ['name' => 'x'])
        ->assertStatus(404);
});

it('updates only my material and answers the hydrated row', function () {
    [$user, $supplier] = mwSupplier('upd');
    $material = mwMaterial($supplier);
    $image = MaterialImage::create([
        'material_id' => $material->id, 'image_path' => 'materials/a.jpg',
    ]);

    $response = $this->actingAs($user)
        ->putJson("/api/merchant/materials/{$material->id}", [
            'name' => 'Seed Material Updated', 'price' => 67890,
            'stock' => 3, 'is_available' => false,
            'deleted_image_ids' => [$image->id],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Material updated successfully');

    expect(array_keys($response->json('data')))->toBe([
        'id', 'supplier_id', 'name', 'description', 'price', 'unit', 'category',
        'stock', 'is_available', 'image_path', 'specifications', 'created_at',
        'updated_at', 'images',
    ]);
    expect($response->json('data.name'))->toBe('Seed Material Updated');
    expect($response->json('data.price'))->toBe('67890.00');
    expect($response->json('data.is_available'))->toBeFalse();
    expect($response->json('data.images'))->toBe([]);

    $this->actingAs($user)
        ->putJson("/api/merchant/materials/{$material->id}", ['is_available' => 'x'])
        ->assertStatus(422)
        ->assertJsonPath('errors.is_available', ['The is available field must be true or false.']);

    $invalidImage = $this->actingAs($user)
        ->putJson("/api/merchant/materials/{$material->id}", ['deleted_image_ids' => [999999999]])
        ->assertStatus(422);
    // The nested key contains a literal dot.
    expect($invalidImage->json('errors')['deleted_image_ids.0'])
        ->toBe(['The selected deleted_image_ids.0 is invalid.']);

    // Another supplier's material is a 404, not a 403.
    [$otherUser, ] = mwSupplier('other');
    $this->actingAs($otherUser)
        ->putJson("/api/merchant/materials/{$material->id}", ['name' => 'hijack'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'No query results for model [App\\Models\\Material].');
});

it('deletes my material and its images', function () {
    [$user, $supplier] = mwSupplier('del');
    $material = mwMaterial($supplier);
    MaterialImage::create(['material_id' => $material->id, 'image_path' => 'materials/a.jpg']);

    [$otherUser, ] = mwSupplier('delx');
    $this->actingAs($otherUser)
        ->deleteJson("/api/merchant/materials/{$material->id}")
        ->assertStatus(404);

    $this->actingAs($user)
        ->deleteJson("/api/merchant/materials/{$material->id}")
        ->assertStatus(200)
        ->assertExactJson([
            'status' => 'success',
            'message' => 'Material and its images deleted successfully',
        ]);

    expect(Material::find($material->id))->toBeNull();
    expect(MaterialImage::where('material_id', $material->id)->count())->toBe(0);
});
