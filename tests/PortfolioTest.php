<?php

use App\Models\ProfessionalPortfolio;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Professional portfolios
|--------------------------------------------------------------------------
|
| - GET requires ?user_id and answers a BARE JSON ARRAY (no `data` wrapper),
|   newest first;
| - POST validates the role allow-list and answers a created model in PAYLOAD
|   order, then updated_at before created_at, then id;
| - POST /{id} and DELETE /{id} are ownership-scoped with a 403, and update
|   answers the hydrated model in TABLE order.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function pfUser(string $tag, string $role = 'arsitek'): User
{
    return User::create([
        'name' => "PF $tag", 'username' => "pf_$tag" . uniqid(),
        'email' => "pf_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function pfItem(User $owner, array $overrides = []): ProfessionalPortfolio
{
    return ProfessionalPortfolio::create(array_merge([
        'user_id' => $owner->id, 'role_type' => 'arsitek',
        'title' => 'Villa Ubud', 'description' => 'Design and build',
        'image_path' => 'portfolios/a.jpg', 'duration' => '6 months',
        'client_review' => 'Great',
    ], $overrides));
}

it('requires user_id and answers a bare array', function () {
    $owner = pfUser('idx');

    $this->actingAs($owner)
        ->getJson('/api/portfolios')
        ->assertStatus(400)
        ->assertExactJson(['message' => 'User ID is required']);

    $newer = pfItem($owner);
    $older = pfItem($owner, ['title' => 'Older']);
    // created_at is not fillable: assign it directly to order the list.
    $older->timestamps = false;
    $older->created_at = now()->subDay();
    $older->save();

    $response = $this->actingAs($owner)
        ->getJson("/api/portfolios?user_id={$owner->id}")
        ->assertStatus(200);

    // A bare array, not {data: [...]}.
    expect($response->json())->toBeArray();
    expect(array_column($response->json(), 'id'))->toBe([$newer->id, $older->id]);
    expect($response->json('0.image_path'))->toBe('portfolios/a.jpg');
});

it('creates a portfolio with the payload order', function () {
    $owner = pfUser('add');

    $response = $this->actingAs($owner)
        ->postJson('/api/portfolios', [
            'role_type' => 'arsitek', 'title' => 'Villa Ubud',
            'description' => 'Design and build', 'duration' => '6 months',
            'client_review' => 'Great',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Portfolio added successfully');

    expect(array_keys($response->json('data')))->toBe([
        'user_id', 'role_type', 'title', 'description', 'duration',
        'client_review', 'image_path', 'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.user_id'))->toBe($owner->id);

    $this->actingAs($owner)
        ->postJson('/api/portfolios', [])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The role type field is required.'])
        ->assertJsonPath('errors.title', ['The title field is required.'])
        ->assertJsonPath('errors.description', ['The description field is required.']);

    $this->actingAs($owner)
        ->postJson('/api/portfolios', [
            'role_type' => 'chef', 'title' => 'x', 'description' => 'y',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.role_type', ['The selected role type is invalid.']);
});

it('updates my portfolio and refuses a foreign one', function () {
    $owner = pfUser('upd');
    $item = pfItem($owner);

    $response = $this->actingAs($owner)
        ->postJson("/api/portfolios/{$item->id}", [
            'title' => 'Villa Ubud 2', 'description' => 'Updated',
            'duration' => '8 months', 'client_review' => 'Excellent',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Portfolio updated successfully');

    // Hydrated model: table order.
    expect(array_keys($response->json('data')))->toBe([
        'id', 'user_id', 'role_type', 'title', 'description', 'image_path',
        'duration', 'client_review', 'created_at', 'updated_at',
    ]);
    expect($response->json('data.title'))->toBe('Villa Ubud 2');
    expect($response->json('data.image_path'))->toBe('portfolios/a.jpg');

    $stranger = pfUser('updx');
    $this->actingAs($stranger)
        ->postJson("/api/portfolios/{$item->id}", ['title' => 'x', 'description' => 'y'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    expect($item->fresh()->title)->toBe('Villa Ubud 2');
});

it('deletes my portfolio row', function () {
    $owner = pfUser('del');
    $item = pfItem($owner);
    $stranger = pfUser('delx');

    $this->actingAs($stranger)
        ->deleteJson("/api/portfolios/{$item->id}")
        ->assertStatus(403);

    $this->actingAs($owner)
        ->deleteJson("/api/portfolios/{$item->id}")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Portfolio deleted successfully']);

    expect(ProfessionalPortfolio::find($item->id))->toBeNull();
});
