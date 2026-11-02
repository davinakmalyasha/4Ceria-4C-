<?php

use App\Models\House;
use App\Models\HouseAnswer;
use App\Models\HousePic;
use App\Models\HouseQuestion;
use App\Models\Region;
use App\Models\Room;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| House writes: create, update, delete, rooms and Q&A
|--------------------------------------------------------------------------
|
| THE DEFECT THIS SUITE PINS
| --------------------------
| `lat`/`lng` are validated request fields but NOT columns: passing them to
| `House::create()` / `$house->update()` throws MassAssignmentException under
| `Model::shouldBeStrict()` (and is silently discarded in production, where
| the answer then had a null `views`). Every listing creation answered 500
| locally. The controller now folds them into `coordinate` and drops them,
| then refreshes the row so the payload carries the DB defaults.
|
| The answer shapes matter too: store/update/room-store load only
| `housePic` + `room`, so `owner` is ABSENT (the list/show endpoints load
| `user` and include it).
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function hwUser(string $tag, string $role = 'user'): User
{
    return User::create([
        'name' => "HW $tag", 'username' => "hw_$tag" . uniqid(),
        'email' => "hw_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

function hwPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Parity House', 'price' => 750_000_000,
        'house_desc' => 'desc', 'width' => 10, 'length' => 20,
        'ba' => 2, 'br' => 3, 'floors' => 2,
        'street_name' => 'Jl. Test', 'kelurahan' => 'Kel',
        'kecamatan' => 'Kec', 'kab_kota' => 'Bandung',
        'province' => 'Jawa Barat', 'postal_code' => 12345,
        'lat' => -6.2, 'lng' => 106.8,
    ], $overrides);
}

// hwCreate seeds a row for the write endpoints: `lat`/`lng` are request
// fields, not columns, and the owner column is `id_user`.
function hwCreate(User $owner, array $overrides = []): House
{
    $payload = hwPayload($overrides);
    unset($payload['lat'], $payload['lng']);
    $payload['coordinate'] = '-6.2, 106.8';
    $payload['id_user'] = $owner->id;

    return House::create($payload);
}

it('creates a house with coordinate, regions and the created shape', function () {
    $owner = hwUser('store');

    $response = $this->actingAs($owner)
        ->postJson('/api/houses', hwPayload())
        ->assertStatus(201);

    $data = $response->json('data');
    expect(array_keys($data))->toBe([
        'id', 'name', 'price', 'description', 'dimensions', 'rooms', 'address',
        'coordinate', 'user_id', 'views', 'created_at', 'updated_at',
        'housePic', 'roomList',
    ]);
    expect($data['price'])->toBe('750000000.00');
    expect($data['coordinate'])->toBe('-6.2, 106.8');
    expect($data['address']['coordinates'])->toBe('-6.2, 106.8');
    expect($data['views'])->toBe(0);
    // These endpoints never load `user`, so `owner` is absent.
    expect($data)->not->toHaveKey('owner');

    $house = House::sole();
    expect($house->id_user)->toBe($owner->id);
    expect($house->coordinate)->toBe('-6.2, 106.8');
    // The province/city pair was materialised for the address filter.
    expect(DB::table('regions')->where('name', 'Bandung')->count())->toBe(1);
});

it('validates the store payload field by field', function () {
    $owner = hwUser('val');

    $response = $this->actingAs($owner)
        ->postJson('/api/houses', [])
        ->assertStatus(422);

    expect($response->json('errors'))->toHaveKeys([
        'name', 'price', 'house_desc', 'width', 'length', 'ba', 'br', 'floors',
        'street_name', 'kelurahan', 'kecamatan', 'kab_kota', 'province',
        'postal_code', 'lat', 'lng',
    ]);
    expect($response->json('errors.name'))->toBe(['The name field is required.']);

    $this->actingAs($owner)
        ->postJson('/api/houses', hwPayload(['floors' => 0]))
        ->assertStatus(422)
        ->assertJsonPath('errors.floors', ['The floors field must be at least 1.']);

    $this->actingAs($owner)
        ->postJson('/api/houses', hwPayload(['width' => 12345]))
        ->assertStatus(422)
        ->assertJsonPath('errors.width', ['The width field must not have more than 4 digits.']);
});

it('updates a house and rebuilds the coordinate', function () {
    $owner = hwUser('upd');
    $house = hwCreate($owner);

    $response = $this->actingAs($owner)
        ->putJson("/api/houses/{$house->id}", [
            'name' => 'Parity House Updated', 'price' => 800_000_000,
            'lat' => -6.3, 'lng' => 106.9,
        ])
        ->assertStatus(200);

    expect($response->json('data.name'))->toBe('Parity House Updated');
    expect($response->json('data.coordinate'))->toBe('-6.3, 106.9');
    expect($house->fresh()->coordinate)->toBe('-6.3, 106.9');
    // Partial updates leave the rest alone.
    expect($house->fresh()->house_desc)->toBe('desc');

    $stranger = hwUser('out');
    $this->actingAs($stranger)
        ->putJson("/api/houses/{$house->id}", ['name' => 'hijack'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized action. You do not own this house.');
});

it('deletes a house and cascades its rooms', function () {
    $owner = hwUser('del');
    $house = hwCreate($owner);
    Room::create([
        'name' => 'Master', 'type' => 'bedroom', 'width' => '4', 'length' => '5',
        'desc' => 'big', 'id_house' => $house->id,
    ]);

    $stranger = hwUser('delout');
    $this->actingAs($stranger)
        ->deleteJson("/api/houses/{$house->id}")
        ->assertStatus(403);

    $this->actingAs($owner)
        ->deleteJson("/api/houses/{$house->id}")
        ->assertStatus(200)
        ->assertExactJson(['message' => 'House deleted successfully']);

    expect(House::find($house->id))->toBeNull();
    expect(Room::where('id_house', $house->id)->count())->toBe(0);
});

it('adds a room and answers the house resource', function () {
    $owner = hwUser('room');
    $house = hwCreate($owner);

    $response = $this->actingAs($owner)
        ->postJson("/api/houses/{$house->id}/rooms", [
            'name' => 'Master', 'type' => 'bedroom', 'width' => 4, 'length' => 5, 'desc' => 'big',
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Room added successfully');

    expect($response->json('house.roomList'))->toHaveCount(1);
    expect($response->json('house.roomList.0.name'))->toBe('Master');
    expect($response->json('house.roomList.0.width'))->toBe('4');
    expect($response->json('house'))->not->toHaveKey('owner');

    // `desc` is REQUIRED on this endpoint (unlike the nested store rules).
    $this->actingAs($owner)
        ->postJson("/api/houses/{$house->id}/rooms", [
            'name' => 'No desc', 'type' => 'room', 'width' => 1, 'length' => 1,
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.desc', ['The desc field is required.']);
});

it('lists and stores house questions with the user resource gate', function () {
    $owner = hwUser('qa');
    $house = hwCreate($owner);

    $question = HouseQuestion::create([
        'house_id' => $house->id, 'user_id' => $owner->id, 'question' => 'Is it available?',
    ]);
    HouseAnswer::create([
        'question_id' => $question->id, 'user_id' => $owner->id, 'answer' => 'Yes it is.',
    ]);

    // Public read: the asker's email is masked (no authenticated user).
    $public = $this->getJson("/api/houses/{$house->id}/questions")
        ->assertStatus(200);
    expect($public->json('data.0.question'))->toBe('Is it available?');
    expect($public->json('data.0.user.email'))->toBeNull();
    expect($public->json('data.0.answers.0.answer'))->toBe('Yes it is.');

    // Authenticated create: 201, and the email is visible to itself.
    $created = $this->actingAs($owner)
        ->postJson("/api/houses/{$house->id}/questions", ['question' => 'Is parking included?'])
        ->assertStatus(201);

    expect($created->json('data.user.email'))->toBe($owner->email);
    expect($created->json('data.answers'))->toBe([]);

    $this->actingAs($owner)
        ->postJson("/api/houses/{$house->id}/questions", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.question', ['The question field is required.']);
});

it("invalidates the public listings cache on every driver", function () {
    // The tag flush only works on redis/memcached; `file`/`array` used to skip
    // invalidation, leaving a just-posted house invisible for ten minutes.
    config(["cache.default" => "array"]);
    Cache::flush();

    $owner = hwUser("cache");
    $baseline = $this->getJson("/api/houses")->assertStatus(200)->json("data");

    // Warm the list cache with the baseline result.
    $this->getJson("/api/houses")->assertStatus(200)->assertJsonCount(count($baseline), "data");

    $this->actingAs($owner)
        ->postJson("/api/houses", hwPayload(["name" => "Cached Out"]))
        ->assertStatus(201);

    // The store bumped the version segment, so the list re-queries.
    $list = $this->getJson("/api/houses")->assertStatus(200);
    expect($list->json("data.0.name"))->toBe("Cached Out");

    $houseId = $list->json("data.0.id");
    $this->actingAs($owner)->deleteJson("/api/houses/{$houseId}")->assertStatus(200);

    $this->getJson("/api/houses")->assertStatus(200)->assertJsonCount(count($baseline), "data");
});

it('updates a house with gallery, deleted photos and rooms without mass-assignment failures', function () {
    // DEFECT: UpdateHouseRequest validates `house_pics`, `deleted_house_pics`
    // and `rooms`, so `validated()` includes them. Passing that array to
    // `$house->update()` raised MassAssignmentException — every edit that
    // carried the gallery (the legacy modal and the native form always do)
    // answered 500 AFTER the scalar columns had been written, and the gallery
    // side effects never ran. The controller now strips the relationship keys
    // before the update and still reads them from the request.
    Storage::fake('public');
    Queue::fake();

    $owner = hwUser('gallery');
    $house = hwCreate($owner);

    Storage::disk('public')->put("uploads/house/house_{$house->id}/old.png", 'x');
    $oldPic = HousePic::create([
        'file_name' => 'old.png',
        'dir' => "uploads/house/house_{$house->id}/old.png",
        'size' => '1',
        'id_house' => $house->id,
    ]);
    $room = Room::create([
        'name' => 'Master', 'type' => 'bedroom', 'width' => '4', 'length' => '5',
        'desc' => 'big', 'id_house' => $house->id,
    ]);

    $this->actingAs($owner)
        ->post("/api/houses/{$house->id}", [
            '_method' => 'PUT',
            'name' => 'Gallery Updated',
            'price' => 2_500_000_000,
            'house_desc' => 'edited',
            'width' => 12,
            'length' => 21,
            'floors' => 2,
            'br' => 4,
            'ba' => 3,
            'street_name' => 'Jl. Edited',
            'kelurahan' => 'Kel',
            'kecamatan' => 'Kec',
            'kab_kota' => 'Bandung',
            'province' => 'Jawa Barat',
            'postal_code' => 12345,
            'lat' => -6.3,
            'lng' => 106.9,
            'deleted_house_pics' => [$oldPic->id],
            'house_pics' => [UploadedFile::fake()->image('new.png')],
            'rooms' => [
                [
                    'id' => $room->id, 'name' => 'Master renamed', 'type' => 'bedroom',
                    'width' => '5', 'length' => '6', 'desc' => 'renamed',
                ],
            ],
        ])
        ->assertStatus(200);

    expect($house->fresh()->name)->toBe('Gallery Updated');
    expect($house->fresh()->coordinate)->toBe('-6.3, 106.9');
    expect((int) $house->fresh()->br)->toBe(4);

    // The deleted gallery row and its file are gone, the upload replaced it.
    expect(HousePic::find($oldPic->id))->toBeNull();
    expect(Storage::disk('public')->exists("uploads/house/house_{$house->id}/old.png"))->toBeFalse();
    expect(HousePic::where('id_house', $house->id)->count())->toBe(1);

    // The inline room edit ran.
    expect($room->fresh()->name)->toBe('Master renamed');
});
