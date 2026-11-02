<?php

use App\Models\NotarisConsultation;
use App\Models\NotarisProfile;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Notary consultations
|--------------------------------------------------------------------------
|
| - POST parses the naive WIB wall clock (`Asia/Jakarta`) and stores UTC,
|   caps pending bookings at five per day (429), refuses a duplicate slot
|   (422), and answers 201 with the CREATED model + a notary notification;
| - GET lists the caller's bookings as client OR as the booked notary;
| - POST /{id}/respond is notary-only (403), enforces per-action statuses
|   (422) and answers the hydrated row + a client notification.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function consNotary(string $tag): array
{
    $user = User::create([
        'name' => "Notaris $tag", 'username' => "nt_$tag" . uniqid(),
        'email' => "nt_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'notaris',
    ]);
    $profile = NotarisProfile::create(['user_id' => $user->id, 'nama' => "Kantor $tag"]);

    return [$user, $profile];
}

function consClient(string $tag): User
{
    return User::create([
        'name' => "Client $tag", 'username' => "cl_$tag" . uniqid(),
        'email' => "cl_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function consWhen(int $days = 2): string
{
    return now('Asia/Jakarta')->addDays($days)->setTime(10, 0)->format('Y-m-d\TH:i');
}

it('books a consultation and notifies the notary', function () {
    [$notaryUser, $notary] = consNotary('book');
    $client = consClient('book');

    $response = $this->actingAs($client)
        ->postJson('/api/consultations', [
            'notaris_id' => $notary->id,
            'schedule_date' => consWhen(),
            'notes' => 'Need advice',
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Consultation booked successfully.');

    expect(array_keys($response->json('data')))->toBe([
        'notaris_id', 'user_id', 'schedule_date', 'status', 'notes',
        'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.status'))->toBe('pending');

    $row = NotarisConsultation::sole();
    // The WIB wall clock is stored as UTC.
    expect($row->schedule_date->utc()->format('H:i'))->toBe('03:00');
    expect(Notification::where('user_id', $notaryUser->id)
        ->where('type', 'consultation_requested')->count())->toBe(1);

    // The same slot cannot be booked twice.
    $this->actingAs($client)
        ->postJson('/api/consultations', [
            'notaris_id' => $notary->id, 'schedule_date' => consWhen(),
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'You already have a consultation booked for this time.');

    // Past wall clocks are refused by the closure.
    $this->actingAs($client)
        ->postJson('/api/consultations', [
            'notaris_id' => $notary->id, 'schedule_date' => '2020-01-01T10:00',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.schedule_date', ['The schedule date must be a datetime in the future.']);
});

it('caps pending bookings at five per day', function () {
    [, $notary] = consNotary('cap');
    $client = consClient('cap');

    for ($i = 0; $i < 5; $i++) {
        $this->actingAs($client)
            ->postJson('/api/consultations', [
                'notaris_id' => $notary->id,
                'schedule_date' => consWhen(2 + $i),
            ])
            ->assertStatus(201);
    }

    $this->actingAs($client)
        ->postJson('/api/consultations', [
            'notaris_id' => $notary->id, 'schedule_date' => consWhen(10),
        ])
        ->assertStatus(429)
        ->assertJsonPath('message', 'You have too many pending consultation requests. Please wait for confirmations.');
});

it('lists the caller bookings as client and as notary', function () {
    [$notaryUser, $notary] = consNotary('list');
    $client = consClient('list');
    NotarisConsultation::create([
        'notaris_id' => $notary->id, 'user_id' => $client->id,
        'schedule_date' => now()->addDays(2), 'status' => 'pending',
    ]);

    $asClient = $this->actingAs($client)
        ->getJson('/api/consultations')
        ->assertStatus(200);
    expect($asClient->json('data'))->toHaveCount(1);
    expect(array_keys($asClient->json('data.0')))->toBe([
        'id', 'notaris_id', 'user_id', 'schedule_date', 'status', 'notes',
        'created_at', 'updated_at', 'notaris', 'user',
    ]);
    expect($asClient->json('data.0.notaris.id'))->toBe($notary->id);

    $asNotary = $this->actingAs($notaryUser)
        ->getJson('/api/consultations')
        ->assertStatus(200);
    expect($asNotary->json('data'))->toHaveCount(1);

    $stranger = consClient('outside');
    $this->actingAs($stranger)
        ->getJson('/api/consultations')
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);
});

it('confirms, completes and guards the lifecycle', function () {
    [$notaryUser, $notary] = consNotary('resp');
    $client = consClient('resp');
    $consultation = NotarisConsultation::create([
        'notaris_id' => $notary->id, 'user_id' => $client->id,
        'schedule_date' => now()->addDays(2), 'status' => 'pending', 'notes' => 'Original',
    ]);

    $this->actingAs($client)
        ->postJson("/api/consultations/{$consultation->id}/respond", ['action' => 'confirm'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the booked notary can manage this consultation.');

    $this->actingAs($notaryUser)
        ->postJson("/api/consultations/{$consultation->id}/respond", ['action' => 'complete'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Only confirmed bookings can be completed.');

    $this->actingAs($notaryUser)
        ->postJson("/api/consultations/{$consultation->id}/respond", ['action' => 'confirm'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'confirmed');

    expect(Notification::where('user_id', $client->id)
        ->where('type', 'consultation_confirmed')->count())->toBe(1);

    $this->actingAs($notaryUser)
        ->postJson("/api/consultations/{$consultation->id}/respond", ['action' => 'confirm'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Only pending bookings can be confirmed.');

    $this->actingAs($notaryUser)
        ->postJson("/api/consultations/{$consultation->id}/respond", [
            'action' => 'complete', 'notes' => 'All good',
        ])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'completed');

    expect(Notification::where('user_id', $client->id)
        ->where('type', 'consultation_completed')->count())->toBe(1);

    // Reschedule requires the new date.
    $second = NotarisConsultation::create([
        'notaris_id' => $notary->id, 'user_id' => $client->id,
        'schedule_date' => now()->addDays(3), 'status' => 'pending',
    ]);
    $this->actingAs($notaryUser)
        ->postJson("/api/consultations/{$second->id}/respond", ['action' => 'reschedule'])
        ->assertStatus(422)
        ->assertJsonPath('errors.schedule_date', ['The schedule date field is required when action is reschedule.']);
});
