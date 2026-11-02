<?php

use App\Models\Arsitek;
use App\Models\Favorite;
use App\Models\Material;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Favorites
|--------------------------------------------------------------------------
|
| - GET answers `{data, items}`; an empty account is `{"data":[],"items":[]}`
|   (PHP's empty array, not `{}`);
| - `data` groups stored ids by morph alias, `items` resolves light cards in a
|   FIXED order (house, seven professional types, material);
| - toggle is a switch: existing row → 200 favorited:false; new row needs an
|   existing target (404 "Item not found.") and answers 201 favorited:true;
| - merge uses insertOrIgnore (duplicates collapse) and answers the index;
| - destroy is ownership-scoped (403 "Unauthorized.").
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function favUser(string $tag): User
{
    return User::create([
        'name' => "FAV $tag", 'username' => "fav_$tag" . uniqid(),
        'email' => "fav_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function favMaterial(string $tag): Material
{
    $supplierUser = User::create([
        'name' => "FS $tag", 'username' => "fs_$tag" . uniqid(),
        'email' => "fs_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create(['user_id' => $supplierUser->id, 'store_name' => "F Store $tag"]);

    return Material::create([
        'supplier_id' => $supplier->id, 'category' => 'Furniture', 'name' => "Sofa $tag",
        'price' => 100, 'unit' => 'pcs', 'stock' => 5, 'is_available' => true,
    ]);
}

it('answers an empty account with two empty arrays', function () {
    $user = favUser('empty');

    $response = $this->actingAs($user)
        ->getJson('/api/favorites')
        ->assertStatus(200);

    // PHP's empty array, not {}.
    expect($response->getContent())->toBe('{"data":[],"items":[]}');
});

it('toggles on and off against an existing target', function () {
    $user = favUser('tog');
    $material = favMaterial('tog');

    $on = $this->actingAs($user)
        ->postJson('/api/favorites/toggle', [
            'favoritable_type' => 'material', 'favoritable_id' => $material->id,
        ])
        ->assertStatus(201)
        ->assertJsonPath('favorited', true);
    expect(array_keys($on->json()))->toBe(['favorited', 'type', 'id']);

    expect(Favorite::where('user_id', $user->id)->count())->toBe(1);

    $off = $this->actingAs($user)
        ->postJson('/api/favorites/toggle', [
            'favoritable_type' => 'material', 'favoritable_id' => $material->id,
        ])
        ->assertStatus(200)
        ->assertJsonPath('favorited', false);

    expect(Favorite::where('user_id', $user->id)->count())->toBe(0);

    // An orphan reference is refused before any row is written.
    $this->actingAs($user)
        ->postJson('/api/favorites/toggle', [
            'favoritable_type' => 'house', 'favoritable_id' => 999999999,
        ])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Item not found.');

    $this->actingAs($user)
        ->postJson('/api/favorites/toggle', [
            'favoritable_type' => 'chef', 'favoritable_id' => 1,
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.favoritable_type', ['The selected favoritable type is invalid.']);
});

it('resolves stored ids into cards in the fixed order', function () {
    $user = favUser('idx');
    $architect = User::create([
        'name' => 'Arch', 'username' => 'arch' . uniqid(),
        'email' => 'arch' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $profile = Arsitek::create([
        'user_id' => $architect->id, 'nama' => 'Studio A',
        'spesialisasi' => 'Eco', 'foto' => 'profiles/a.jpg',
    ]);
    $material = favMaterial('idx');

    Favorite::create(['user_id' => $user->id, 'favoritable_type' => 'material', 'favoritable_id' => $material->id]);
    Favorite::create(['user_id' => $user->id, 'favoritable_type' => 'arsitek', 'favoritable_id' => $profile->id]);

    $response = $this->actingAs($user)
        ->getJson('/api/favorites')
        ->assertStatus(200);

    // MySQL serves the rows through the (user_id, type, id) unique index, so
    // the grouping keys arrive TYPE-ordered regardless of insertion.
    expect(array_keys($response->json('data')))->toBe(['arsitek', 'material']);
    // `items` is in the FIXED order, not the grouping order.
    expect(array_keys($response->json('items')))->toBe(['arsitek', 'material']);

    $architectCard = $response->json('items.arsitek.0');
    expect($architectCard['type'])->toBe('arsitek');
    expect($architectCard['title'])->toBe('Studio A');
    expect($architectCard['subtitle'])->toBe('Eco');
    expect($architectCard['image'])->toBe(url('/storage/profiles/a.jpg'));
    expect($architectCard['price'])->toBeNull();

    $materialCard = $response->json('items.material.0');
    expect($materialCard['title'])->toBe($material->name);
    expect($materialCard['subtitle'])->toBe('Furniture · pcs');
    // PHP encodes an integral float without a decimal point, so the decoded
    // value is an int.
    expect($materialCard['price'])->toBe(100);
});

it('merges guest items without duplicating them', function () {
    $user = favUser('merge');
    $material = favMaterial('merge');

    $response = $this->actingAs($user)
        ->postJson('/api/favorites/merge', [
            'items' => [
                ['type' => 'material', 'id' => $material->id],
                ['type' => 'material', 'id' => $material->id],
            ],
        ])
        ->assertStatus(200);

    expect($response->json('data.material'))->toBe([$material->id]);
    expect(Favorite::where('user_id', $user->id)->count())->toBe(1);

    $this->actingAs($user)
        ->postJson('/api/favorites/merge', [])
        ->assertStatus(422)
        ->assertJsonPath('errors.items', ['The items field is required.']);
});

it('removes a favorite only for its owner', function () {
    $user = favUser('del');
    $stranger = favUser('delx');
    $favorite = Favorite::create([
        'user_id' => $user->id, 'favoritable_type' => 'arsitek', 'favoritable_id' => 6634,
    ]);

    $this->actingAs($stranger)
        ->deleteJson("/api/favorites/{$favorite->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($user)
        ->deleteJson("/api/favorites/{$favorite->id}")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Removed from favorites.']);

    expect(Favorite::find($favorite->id))->toBeNull();
});
