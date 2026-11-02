<?php

use App\Models\TeamMember;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Team members
|--------------------------------------------------------------------------
|
| The account-less roster a professional keeps:
|   - GET allows seven roles and answers {"data": []} to everyone else;
|   - POST is limited to the five professional roles (403 otherwise);
|   - PUT/DELETE are OWNERSHIP-scoped: a foreign id is 404, not 403;
|   - `photo_url` is an append (/storage/<path>, relative), and a created
|     member is serialized in PAYLOAD order with updated_at before created_at,
|     id last, then the append.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function tmUser(string $tag, string $role, string $name = 'Owner'): User
{
    return User::create([
        'name' => "$name $tag", 'username' => "tm_$tag" . uniqid(),
        'email' => "tm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function tmMember(User $owner, array $overrides = []): TeamMember
{
    return TeamMember::create(array_merge([
        'owner_user_id' => $owner->id, 'owner_role' => $owner->role_type,
        'name' => 'Siti', 'role_title' => 'Drafter', 'bio' => 'Detail',
        'skills' => ['AutoCAD'], 'phone' => '08123', 'email' => 'siti@example.test',
    ], $overrides));
}

it('lists only my active members for the allowed roles', function () {
    $owner = tmUser('idx', 'arsitek');
    $active = tmMember($owner);
    tmMember($owner, ['name' => 'Gone', 'status' => 'inactive']);

    $response = $this->actingAs($owner)
        ->getJson('/api/team-members')
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.id'))->toBe($active->id);
    expect($response->json('data.0.skills'))->toBe(['AutoCAD']);
    // The append is /storage/<path>, not an absolute URL.
    expect($response->json('data.0.photo_url'))->toBeNull();
    expect(array_slice(array_keys($response->json('data.0')), -1))->toBe(['photo_url']);

    // A role outside the seven gets an empty board, not a 403.
    $plain = tmUser('idxp', 'user');
    $this->actingAs($plain)
        ->getJson('/api/team-members')
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);
});

it('adds a member with the created payload order', function () {
    $owner = tmUser('add', 'arsitek');

    $response = $this->actingAs($owner)
        ->postJson('/api/team-members', [
            'name' => 'Siti', 'role_title' => 'Drafter', 'bio' => 'Detail',
            'skills' => ['AutoCAD', 'Revit'], 'phone' => '08123',
            'email' => 'siti@example.test',
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Team member added.');

    expect(array_keys($response->json('data')))->toBe([
        'owner_user_id', 'owner_role', 'name', 'photo_path', 'role_title',
        'bio', 'skills', 'phone', 'email', 'updated_at', 'created_at', 'id',
        'photo_url',
    ]);
    expect($response->json('data.owner_role'))->toBe('arsitek');
    expect($response->json('data.skills'))->toBe(['AutoCAD', 'Revit']);

    // A non-professional role is refused before validation.
    $plain = tmUser('addp', 'user');
    $this->actingAs($plain)
        ->postJson('/api/team-members', ['name' => 'x', 'role_title' => 'y'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized role for team management.');

    $this->actingAs($owner)
        ->postJson('/api/team-members', [])
        ->assertStatus(422)
        ->assertJsonPath('errors.name', ['The name field is required.']);

    $this->actingAs($owner)
        ->postJson('/api/team-members', [
            'name' => 'x', 'role_title' => 'y', 'email' => 'not-an-email',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.email', ['The email field must be a valid email address.']);
});

it('updates my member and refuses a foreign one with 404', function () {
    $owner = tmUser('upd', 'arsitek');
    $member = tmMember($owner, ['photo_path' => 'team-members/a.jpg']);

    $response = $this->actingAs($owner)
        ->putJson("/api/team-members/{$member->id}", [
            'name' => 'Siti Updated', 'role_title' => 'Senior Drafter',
            'skills' => ['Revit'], 'bio' => 'Updated',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Team member updated.');

    expect($response->json('data.name'))->toBe('Siti Updated');
    expect($response->json('data.skills'))->toBe(['Revit']);
    expect($response->json('data.photo_path'))->toBe('team-members/a.jpg');
    expect($response->json('data.photo_url'))->toBe('/storage/team-members/a.jpg');
    // Table order on a hydrated row, append last.
    expect(array_slice(array_keys($response->json('data')), 0, 3))
        ->toBe(['id', 'owner_user_id', 'owner_role']);

    $stranger = tmUser('updx', 'arsitek');
    $this->actingAs($stranger)
        ->putJson("/api/team-members/{$member->id}", ['name' => 'hijack', 'role_title' => 'x'])
        ->assertStatus(404);

    expect($member->fresh()->name)->toBe('Siti Updated');
});

it('removes my member by deactivating it', function () {
    $owner = tmUser('del', 'arsitek');
    $member = tmMember($owner);

    $stranger = tmUser('delx', 'arsitek');
    $this->actingAs($stranger)
        ->deleteJson("/api/team-members/{$member->id}")
        ->assertStatus(404);

    $this->actingAs($owner)
        ->deleteJson("/api/team-members/{$member->id}")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Team member removed.']);

    expect($member->fresh()->status)->toBe('inactive');
    expect($member->fresh())->not->toBeNull();
});
