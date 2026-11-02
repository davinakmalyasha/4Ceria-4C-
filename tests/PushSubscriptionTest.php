<?php

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Web Push
|--------------------------------------------------------------------------
|
| - GET /push/public-key answers 501 when no VAPID key is configured (the
|   local .env has none);
| - POST /push/subscribe validates the browser payload, REFUSES loopback /
|   link-local / RFC1918 / non-vendor hosts (the queue worker fetches this
|   endpoint, so it is an SSRF surface), then updateOrCreates by endpoint;
| - POST /push/unsubscribe deletes the caller's row for that endpoint.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function pushUser(string $tag): User
{
    return User::create([
        'name' => "PUSH $tag", 'username' => "pu_$tag" . uniqid(),
        'email' => "pu_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

it('answers 501 while no VAPID key is configured', function () {
    $user = pushUser('key');

    $this->actingAs($user)
        ->getJson('/api/push/public-key')
        ->assertStatus(501)
        ->assertExactJson(['message' => 'Web push is not configured']);
});

it('saves one subscription per endpoint and refreshes it', function () {
    $user = pushUser('sub');
    $endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

    $this->actingAs($user)
        ->postJson('/api/push/subscribe', [
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'key1', 'auth' => 'auth1'],
        ])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Push subscription saved']);

    $row = PushSubscription::sole();
    expect($row->user_id)->toBe($user->id);
    expect($row->p256dh)->toBe('key1');
    expect($row->content_encoding)->toBe('aesgcm');

    // A second call refreshes the same row.
    $this->actingAs($user)
        ->postJson('/api/push/subscribe', [
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'key2', 'auth' => 'auth2'],
            'contentEncoding' => 'aes128gcm',
        ])
        ->assertStatus(200);

    expect(PushSubscription::count())->toBe(1);
    expect($row->fresh()->p256dh)->toBe('key2');
    expect($row->fresh()->content_encoding)->toBe('aes128gcm');
});

it('refuses untrusted and local endpoints', function () {
    $user = pushUser('ssrf');
    $payload = fn (string $endpoint) => [
        'endpoint' => $endpoint, 'keys' => ['p256dh' => 'k', 'auth' => 'a'],
    ];

    $this->actingAs($user)
        ->postJson('/api/push/subscribe', $payload('https://example.com/push'))
        ->assertStatus(422)
        ->assertJsonPath('message', 'Unrecognized push service endpoint.');

    $this->actingAs($user)
        ->postJson('/api/push/subscribe', $payload('https://127.0.0.1/push'))
        ->assertStatus(422)
        ->assertJsonPath('message', 'Invalid push endpoint.');

    $this->actingAs($user)
        ->postJson('/api/push/subscribe', $payload('https://169.254.169.254/latest'))
        ->assertStatus(422)
        ->assertJsonPath('message', 'Invalid push endpoint.');

    // A plain-http endpoint fails the starts_with rule before the SSRF guard.
    $this->actingAs($user)
        ->postJson('/api/push/subscribe', $payload('http://fcm.googleapis.com/x'))
        ->assertStatus(422)
        ->assertJsonPath('errors.endpoint', ['The endpoint field must start with one of the following: https://.']);

    expect(PushSubscription::count())->toBe(0);
});

it('validates the required fields', function () {
    $user = pushUser('val');

    $this->actingAs($user)
        ->postJson('/api/push/subscribe', [])
        ->assertStatus(422)
        ->assertJsonPath('errors.endpoint', ['The endpoint field is required.']);

    // Nested keys keep the literal dot.
    $errors = $this->actingAs($user)
        ->postJson('/api/push/subscribe', [])
        ->assertStatus(422)
        ->json('errors');
    expect($errors['keys.p256dh'])->toBe(['The keys.p256dh field is required.']);
    expect($errors['keys.auth'])->toBe(['The keys.auth field is required.']);

    $this->actingAs($user)
        ->postJson('/api/push/unsubscribe', [])
        ->assertStatus(422)
        ->assertJsonPath('errors.endpoint', ['The endpoint field is required.']);
});

it('unsubscribes by endpoint only for the caller', function () {
    $owner = pushUser('del');
    $stranger = pushUser('delx');
    $endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/xyz';
    PushSubscription::create([
        'user_id' => $owner->id, 'endpoint' => $endpoint,
        'p256dh' => 'k', 'auth' => 'a', 'content_encoding' => 'aesgcm',
    ]);

    // Another user's call does not remove it.
    $this->actingAs($stranger)
        ->postJson('/api/push/unsubscribe', ['endpoint' => $endpoint])
        ->assertStatus(200);

    expect(PushSubscription::count())->toBe(1);

    $this->actingAs($owner)
        ->postJson('/api/push/unsubscribe', ['endpoint' => $endpoint])
        ->assertStatus(200)
        ->assertExactJson(['message' => 'Push subscription removed']);

    expect(PushSubscription::count())->toBe(0);
});
