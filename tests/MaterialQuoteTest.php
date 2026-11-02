<?php

use App\Models\Material;
use App\Models\MaterialQuote;
use App\Models\Project;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Material quotes: the buyer's RFQ list and creation
|--------------------------------------------------------------------------
|
| - the list shows the caller's SENT quotes and, for a supplier account, the
|   quotes addressed to their store; newest first, capped at 100;
| - creation sums the line totals in EXACT minor units (never float
|   accumulation), refuses a project the caller neither owns nor works on,
|   and answers 201 with the CREATED model plus supplier/project;
| - nested validation keeps Laravel's underscore attribute names
|   ("items.0.material_id").
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function mqOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "mqo_$tag" . uniqid(),
        'email' => "mqo_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function mqSupplierUser(string $tag): array
{
    $user = User::create([
        'name' => "Supplier $tag", 'username' => "mqs_$tag" . uniqid(),
        'email' => "mqs_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'supplier',
    ]);
    $supplier = Supplier::create([
        'user_id' => $user->id, 'store_name' => "Store $tag",
        'address' => 'Jl. Supplier', 'verification_status' => 'verified',
    ]);

    return [$user, $supplier];
}

function mqMaterial(string $tag, Supplier $supplier): Material
{
    return Material::create([
        'supplier_id' => $supplier->id, 'category' => 'Interior',
        'name' => "Material $tag", 'price' => 100_000, 'unit' => 'pcs',
        'stock' => 10, 'is_available' => true,
    ]);
}

it('creates a quote with an exact total and the created shape', function () {
    $owner = mqOwner('new');
    $project = Project::create([
        'title' => 'Quote Project', 'user_id' => $owner->id,
        'budget' => 500_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
    [$supplierUser, $supplier] = mqSupplierUser('new');
    $first = mqMaterial('one', $supplier);
    $second = mqMaterial('two', $supplier);

    $response = $this->actingAs($owner)
        ->postJson('/api/material-quotes', [
            'supplier_id' => $supplier->id,
            'project_id' => $project->id,
            'items' => [
                ['material_id' => $first->id, 'name' => 'Sofa', 'price_at_quote' => '1250000.75', 'qty' => 2, 'unit' => 'pcs'],
                ['material_id' => $second->id, 'name' => 'Table', 'price_at_quote' => 500000, 'qty' => 1, 'unit' => 'pcs'],
            ],
            'delivery_address' => 'Jl. Test 1',
            'address_detail' => 'Unit A',
            'note' => 'rush',
            'latitude' => -6.2,
            'longitude' => 106.8,
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Quote request recorded successfully.');

    $data = $response->json('data');
    expect(array_keys($data))->toBe([
        'user_id', 'supplier_id', 'project_id', 'items', 'delivery_address',
        'address_detail', 'delivery_method', 'total_amount', 'status', 'note',
        'latitude', 'longitude', 'updated_at', 'created_at', 'id', 'supplier', 'project',
    ]);
    // 2 × 1,250,000.75 + 500,000.00 — exact minor units, not float drift.
    expect($data['total_amount'])->toBe('3000001.50');
    expect($data['status'])->toBe('pending');
    expect($data['supplier']['id'])->toBe($supplier->id);
    expect($data['project']['id'])->toBe($project->id);
    expect($data['items'][0]['price_at_quote'])->toBe('1250000.75');

    $quote = MaterialQuote::where('user_id', $owner->id)->sole();
    expect($quote->total_amount)->toBe('3000001.50');
    expect($quote->delivery_method)->toBe('Supplier Fleet');
});

it('refuses a project the caller neither owns nor works on', function () {
    $owner = mqOwner('own');
    $stranger = mqOwner('stranger');
    $project = Project::create([
        'title' => 'Owned Project', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
    [$supplierUser, $supplier] = mqSupplierUser('own');
    $material = mqMaterial('own', $supplier);

    $this->actingAs($stranger)
        ->postJson('/api/material-quotes', [
            'supplier_id' => $supplier->id,
            'project_id' => $project->id,
            'items' => [[
                'material_id' => $material->id, 'name' => 'S',
                'price_at_quote' => '1', 'qty' => 1, 'unit' => 'pcs',
            ]],
            'delivery_address' => 'x',
        ])
        ->assertStatus(403)
        ->assertJsonPath('message', 'You can only request quotes for your own projects.');
});

it('validates the nested payload with Laravel attribute names', function () {
    $owner = mqOwner('val');

    $this->actingAs($owner)
        ->postJson('/api/material-quotes', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['supplier_id', 'items', 'delivery_address']);

    $this->actingAs($owner)
        ->postJson('/api/material-quotes', [
            'supplier_id' => 999999,
            'items' => 'nope',
            'delivery_address' => 'x',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.supplier_id', ['The selected supplier id is invalid.'])
        ->assertJsonPath('errors.items', ['The items field must be an array.']);

    [, $supplier] = mqSupplierUser('val');

    $invalid = $this->actingAs($owner)
        ->postJson('/api/material-quotes', [
            'supplier_id' => $supplier->id,
            'items' => [[
                'material_id' => 999999, 'name' => 'x',
                'price_at_quote' => '1', 'qty' => 1, 'unit' => 'pcs',
            ]],
            'delivery_address' => 'x',
        ])
        ->assertStatus(422);

    // Laravel keeps the underscores inside nested attribute names, and the
    // KEY ITSELF contains dots — read it from the errors map.
    expect($invalid->json('errors')['items.0.material_id'])
        ->toBe(['The selected items.0.material_id is invalid.']);
});

it('lists the caller quotes and a supplier store incoming ones', function () {
    $owner = mqOwner('list');
    [$supplierUser, $supplier] = mqSupplierUser('list');
    $material = mqMaterial('list', $supplier);

    MaterialQuote::create([
        'user_id' => $owner->id, 'supplier_id' => $supplier->id,
        'items' => [[
            'material_id' => $material->id, 'name' => 'Sofa',
            'price_at_quote' => '100', 'qty' => 1, 'unit' => 'pcs',
        ]],
        'delivery_address' => 'x', 'total_amount' => 100, 'status' => 'pending',
    ]);

    $own = $this->actingAs($owner)
        ->getJson('/api/material-quotes')
        ->assertStatus(200);
    expect($own->json('success'))->toBeTrue();
    expect($own->json('data'))->toHaveCount(1);
    expect($own->json('data.0.supplier.id'))->toBe($supplier->id);
    expect($own->json('data.0.project'))->toBeNull();
    expect($own->json('data.0.user.id'))->toBe($owner->id);

    $incoming = $this->actingAs($supplierUser)
        ->getJson('/api/material-quotes')
        ->assertStatus(200);
    expect($incoming->json('data'))->toHaveCount(1);
    expect($incoming->json('data.0.user.id'))->toBe($owner->id);

    // A participant without quotes sees an empty board.
    $other = mqOwner('other');
    $this->actingAs($other)
        ->getJson('/api/material-quotes')
        ->assertStatus(200)
        ->assertExactJson(['success' => true, 'data' => []]);
});
