<?php

use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Kontraktor;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Chat: conversations and messages
|--------------------------------------------------------------------------
|
| - the inbox is `{data:[{id, other_user, last_message, unread_count,
|   last_message_at}]}`, newest activity first, capped at 100;
| - `other_user.pic` comes from the ROLE PROFILE's `foto`, not `users.pic`
|   (the controller's resolveAvatars map — it used to be dead code because an
|   arrow function captured the array by value);
| - store normalises the pair to min/max, refuses self (400) and staff (403);
| - show is participant-only (403 "Unauthorized"), marks the caller's unread
|   messages read, and answers 50 messages plus meta {oldest_id, has_more};
| - sendMessage answers the CREATED message (payload order, updated_at then
|   created_at, id, image_url, sender) and notifies the recipient.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function chatUser(string $tag, string $role = 'user', string $name = 'Chatter'): User
{
    return User::create([
        'name' => "$name $tag", 'username' => "ch_$tag" . uniqid(),
        'email' => "ch_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $role,
    ]);
}

it('answers an empty inbox', function () {
    $user = chatUser('empty');

    $this->actingAs($user)
        ->getJson('/api/conversations')
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);
});

it('creates one conversation per pair, normalised to min/max', function () {
    $owner = chatUser('own');
    $other = chatUser('oth', 'kontraktor', 'Contractor');

    $first = $this->actingAs($owner)
        ->postJson('/api/conversations', ['user_id' => $other->id])
        ->assertStatus(200);

    expect(array_keys($first->json()))->toBe(['data']);

    $conversation = Conversation::sole();
    expect($conversation->user_one_id)->toBe(min($owner->id, $other->id));
    expect($conversation->user_two_id)->toBe(max($owner->id, $other->id));

    // The reverse direction returns the SAME row.
    $this->actingAs($other)
        ->postJson('/api/conversations', ['user_id' => $owner->id])
        ->assertStatus(200)
        ->assertJsonPath('data', $conversation->id);

    expect(Conversation::count())->toBe(1);

    $this->actingAs($owner)
        ->postJson('/api/conversations', ['user_id' => $owner->id])
        ->assertStatus(400)
        ->assertJsonPath('message', 'Cannot chat with yourself.');

    $admin = chatUser('adm', 'admin');
    $this->actingAs($owner)
        ->postJson('/api/conversations', ['user_id' => $admin->id])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Staff accounts cannot receive direct messages.');
});

it('lists the inbox with the role-profile avatar and unread count', function () {
    $owner = chatUser('idx');
    $other = chatUser('idxo', 'kontraktor', 'Contractor');
    Kontraktor::create([
        'user_id' => $other->id, 'nama' => 'Build Co', 'foto' => 'profiles/k.jpg',
    ]);
    $conversation = Conversation::create([
        'user_one_id' => min($owner->id, $other->id),
        'user_two_id' => max($owner->id, $other->id),
        'last_message_at' => now(),
    ]);
    ChatMessage::create([
        'conversation_id' => $conversation->id, 'sender_id' => $other->id,
        'content' => 'Hello there', 'is_read' => false,
    ]);
    $last = ChatMessage::create([
        'conversation_id' => $conversation->id, 'sender_id' => $owner->id,
        'content' => 'Hi back', 'is_read' => true,
    ]);

    $response = $this->actingAs($owner)
        ->getJson('/api/conversations')
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(1);
    $entry = $response->json('data.0');
    expect(array_keys($entry))->toBe(['id', 'other_user', 'last_message', 'unread_count', 'last_message_at']);
    // The avatar is the PROFILE's foto (a raw path/URL), never users.pic.
    expect($entry['other_user']['pic'])->toBe('profiles/k.jpg');
    expect($entry['last_message']['id'])->toBe($last->id);
    expect($entry['unread_count'])->toBe(1);
});

it('shows the thread, marks unread messages read, and enforces membership', function () {
    $owner = chatUser('show');
    $other = chatUser('showo', 'user', 'Other');
    $stranger = chatUser('showx');
    $conversation = Conversation::create([
        'user_one_id' => min($owner->id, $other->id),
        'user_two_id' => max($owner->id, $other->id),
    ]);
    $incoming = ChatMessage::create([
        'conversation_id' => $conversation->id, 'sender_id' => $other->id,
        'content' => 'Hello there', 'is_read' => false,
    ]);
    ChatMessage::create([
        'conversation_id' => $conversation->id, 'sender_id' => $owner->id,
        'content' => 'Hi back', 'is_read' => true,
    ]);

    $this->actingAs($stranger)
        ->getJson("/api/conversations/{$conversation->id}")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    $response = $this->actingAs($owner)
        ->getJson("/api/conversations/{$conversation->id}")
        ->assertStatus(200);

    expect($response->json('data'))->toHaveCount(2);
    // Newest first (the collection is reversed), and the cursor is the newest.
    expect($response->json('data.0.content'))->toBe('Hi back');
    expect($response->json('meta.oldest_id'))->toBe($response->json('data.0.id'));
    expect($response->json('meta.has_more'))->toBeFalse();

    // The incoming message was marked read.
    expect($incoming->fresh()->is_read)->toBe(true);
});

it('sends a message, bumps the thread and notifies the recipient', function () {
    $owner = chatUser('send');
    $other = chatUser('sendo', 'user', 'Other');
    $conversation = Conversation::create([
        'user_one_id' => min($owner->id, $other->id),
        'user_two_id' => max($owner->id, $other->id),
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'New message'])
        ->assertStatus(200);

    expect(array_keys($response->json('data')))->toBe([
        'conversation_id', 'sender_id', 'content', 'image', 'updated_at',
        'created_at', 'id', 'image_url', 'sender',
    ]);
    expect($response->json('data.sender.id'))->toBe($owner->id);

    expect($conversation->fresh()->last_message_at)->not->toBeNull();
    expect(Notification::where('user_id', $other->id)->where('type', 'chat_message')->count())->toBe(1);

    // Content is required when no image is attached.
    $this->actingAs($owner)
        ->postJson("/api/conversations/{$conversation->id}/messages", [])
        ->assertStatus(422)
        ->assertJsonPath('errors.content', ['The content field is required when image is not present.']);

    $stranger = chatUser('sendx');
    $this->actingAs($stranger)
        ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'x'])
        ->assertStatus(403);
});
