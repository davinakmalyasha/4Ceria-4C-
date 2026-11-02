<?php

use App\Models\Kontraktor;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectManager;
use App\Models\StickyNote;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Sharing, sticky notes and notifications
|--------------------------------------------------------------------------
|
| - sticky notes are participant-only, per-author, ordered by position and
|   optionally filtered by phase;
| - the share token is contractor-or-owner only, 24 hex characters, stable
|   across repeated calls and revocable;
| - preferences group by type then channel, refuse ALWAYS_ON types (money
|   and arbitration), and answer `[]` (not `{}`) when empty;
| - read/read-all only ever touch the caller's rows;
| - broadcast-phase appends a bidding role once and answers the plain
|   project resource.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function shrOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "shr_$tag" . uniqid(),
        'email' => "shr_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function shrContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "shrk_$tag" . uniqid(),
        'email' => "shrk_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);

    return $user;
}

function shrPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "shrpm_$tag" . uniqid(),
        'email' => "shrpm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag", 'no_telp' => '081200000004']);

    return $user;
}

function shrProject(User $owner, User $kon, ?User $pm = null, string $tag = 'p'): Project
{
    return Project::create([
        'title' => "Sharing $tag", 'user_id' => $owner->id,
        'budget' => 99_000_000, 'status' => 'open', 'target_role' => 'both',
        'selected_kontraktor_id' => $kon->kontraktor->id,
        'pm_id' => $pm?->project_manager->id,
        'published_bidding_roles' => [],
    ]);
}

it('creates, filters and orders sticky notes per author', function () {
    $owner = shrOwner('sn');
    $kon = shrContractor('sn');
    $project = shrProject($owner, $kon, null, 'sn');

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/sticky-notes", [
            'phase_context' => 'design', 'title' => 'Check tiles',
            'content' => 'ask supplier', 'position_index' => 2,
        ])
        ->assertStatus(200);

    // The CREATED model: payload keys, then the relation-stamped project_id.
    expect(array_keys($response->json('data')))->toBe([
        'user_id', 'phase_context', 'title', 'content', 'position_index',
        'project_id', 'updated_at', 'created_at', 'id',
    ]);
    expect($response->json('data.title'))->toBe('Check tiles');
    expect($response->json('data.position_index'))->toBe(2);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/sticky-notes", [
            'phase_context' => 'build', 'title' => 'Second', 'position_index' => 1,
        ])
        ->assertStatus(200);

    // Defaults: empty title/content and position 0.
    $defaults = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/sticky-notes", [])
        ->assertStatus(200);
    expect($defaults->json('data.title'))->toBe('');
    expect($defaults->json('data.content'))->toBe('');
    expect($defaults->json('data.position_index'))->toBe(0);

    $list = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/sticky-notes")
        ->assertStatus(200);

    // Ordered by position_index: 0, 1, 2.
    expect($list->json('data'))->toHaveCount(3);
    expect(array_column($list->json('data'), 'position_index'))->toBe([0, 1, 2]);

    $filtered = $this->actingAs($owner)
        ->getJson("/api/projects/{$project->id}/sticky-notes?phase_context=design")
        ->assertStatus(200);
    expect($filtered->json('data'))->toHaveCount(1);

    // Another participant sees none of the owner's notes.
    $this->actingAs($kon)
        ->getJson("/api/projects/{$project->id}/sticky-notes")
        ->assertStatus(200)
        ->assertExactJson(['data' => []]);

    $stranger = shrOwner('out');
    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/sticky-notes")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');
});

it('edits and deletes only my own sticky note in this project', function () {
    $owner = shrOwner('se');
    $kon = shrContractor('se');
    $project = shrProject($owner, $kon, null, 'se');
    $note = StickyNote::create([
        'project_id' => $project->id, 'user_id' => $owner->id,
        'phase_context' => 'design', 'title' => 'Old', 'content' => 'x', 'position_index' => 1,
    ]);

    $response = $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/sticky-notes/{$note->id}", [
            'title' => 'Renamed', 'position_index' => 5,
        ])
        ->assertStatus(200);

    expect(array_keys($response->json('data')))->toBe([
        'id', 'project_id', 'user_id', 'phase_context', 'title', 'content',
        'position_index', 'created_at', 'updated_at',
    ]);
    expect($response->json('data.title'))->toBe('Renamed');
    expect($response->json('data.content'))->toBe('x');

    $this->actingAs($kon)
        ->putJson("/api/projects/{$project->id}/sticky-notes/{$note->id}", ['title' => 'hijack'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    // A note from another project is the plain 404.
    $other = shrProject($owner, $kon, null, 'other');
    $foreign = StickyNote::create([
        'project_id' => $other->id, 'user_id' => $owner->id, 'title' => 'Foreign',
    ]);

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/sticky-notes/{$foreign->id}")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found');

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/sticky-notes/{$note->id}")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Deleted successfully');

    expect(StickyNote::find($note->id))->toBeNull();
    expect(StickyNote::find($foreign->id))->not->toBeNull();
});

it('generates one stable share token for the owner or contractor', function () {
    $owner = shrOwner('tok');
    $kon = shrContractor('tok');
    $project = shrProject($owner, $kon, null, 'tok');

    $first = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/share-token")
        ->assertStatus(200);

    $token = $first->json('share_token');
    expect($token)->toMatch('/^[a-f0-9]{24}$/');
    expect($first->json('share_url'))->toBe(url('/brief/' . $token));

    // A second call keeps the token.
    $second = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/share-token")
        ->assertStatus(200);
    expect($second->json('share_token'))->toBe($token);

    // The hired contractor may also read it.
    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/share-token")
        ->assertStatus(200)
        ->assertJsonPath('share_token', $token);

    $stranger = shrOwner('out');
    $this->actingAs($stranger)
        ->postJson("/api/projects/{$project->id}/share-token")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($owner)
        ->deleteJson("/api/projects/{$project->id}/share-token")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Share link revoked.');

    expect($project->fresh()->share_token)->toBeNull();
});

it('lists, upserts and resets notification preferences', function () {
    $owner = shrOwner('pref');

    $empty = $this->actingAs($owner)
        ->getJson('/api/notification-preferences')
        ->assertStatus(200);

    // PHP's empty array is [], not {}.
    expect($empty->json('preferences'))->toBe([]);
    expect($empty->json('channels'))->toBe(['inapp', 'webpush', 'email', 'whatsapp']);
    expect($empty->json('always_on'))->toContain('payment_verified');

    $insert = $this->actingAs($owner)
        ->putJson('/api/notification-preferences', [
            'channel' => 'email', 'enabled' => false,
            'digest' => 'weekly', 'quiet_hours_start' => '22:00', 'quiet_hours_end' => '06:00',
        ])
        ->assertStatus(200);

    // The CREATED model: match attributes, then values, then timestamps.
    expect(array_keys($insert->json('data')))->toBe([
        'user_id', 'type', 'channel', 'enabled', 'digest',
        'quiet_hours_start', 'quiet_hours_end', 'updated_at', 'created_at', 'id',
    ]);
    expect($insert->json('data.quiet_hours_start'))->toBe('22:00');
    expect($insert->json('data.enabled'))->toBeFalse();

    $this->actingAs($owner)
        ->putJson('/api/notification-preferences', [
            'type' => 'bid_received', 'channel' => 'inapp', 'enabled' => true,
        ])
        ->assertStatus(200);

    $grouped = $this->actingAs($owner)
        ->getJson('/api/notification-preferences')
        ->assertStatus(200);
    $prefs = $grouped->json('preferences');
    // The blanket row is keyed '*'; a concrete type overrides it.
    expect($prefs['*']['email']['enabled'])->toBeFalse();
    expect($prefs['*']['email']['quiet_hours_start'])->toBe('22:00');
    expect($prefs['bid_received']['inapp']['enabled'])->toBeTrue();

    // Money/arbitration types cannot be muted.
    $this->actingAs($owner)
        ->putJson('/api/notification-preferences', [
            'type' => 'payment_verified', 'channel' => 'inapp', 'enabled' => false,
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', "Notifications of type 'payment_verified' cover money movement or arbitration and cannot be disabled.");

    $this->actingAs($owner)
        ->putJson('/api/notification-preferences', ['channel' => 'pigeon', 'enabled' => 'maybe'])
        ->assertStatus(422)
        ->assertJsonPath('errors.channel', ['The selected channel is invalid.']);

    $this->actingAs($owner)
        ->deleteJson('/api/notification-preferences', ['channel' => 'email'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Preference reset to default.');

    expect(NotificationPreference::where('user_id', $owner->id)->where('channel', 'email')->count())->toBe(0);
    expect(NotificationPreference::where('user_id', $owner->id)->where('channel', 'inapp')->count())->toBe(1);
});

it('marks one notification read and then all of mine', function () {
    $owner = shrOwner('nf');
    $other = shrOwner('nf2');

    $mine = Notification::create([
        'user_id' => $owner->id, 'type' => 'project_message', 'title' => 'Mine', 'body' => 'x',
    ]);
    $theirs = Notification::create([
        'user_id' => $other->id, 'type' => 'project_message', 'title' => 'Theirs', 'body' => 'y',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/notifications/{$mine->id}/read")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Notification marked as read');

    expect($mine->fresh()->read_at)->not->toBeNull();

    // Someone else's row is refused and untouched.
    $this->actingAs($owner)
        ->postJson("/api/notifications/{$theirs->id}/read")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized');

    expect($theirs->fresh()->read_at)->toBeNull();

    $second = Notification::create([
        'user_id' => $owner->id, 'type' => 'project_message', 'title' => 'Second', 'body' => 'z',
    ]);

    $this->actingAs($owner)
        ->postJson('/api/notifications/read-all')
        ->assertStatus(200)
        ->assertJsonPath('message', 'All notifications marked as read');

    expect($second->fresh()->read_at)->not->toBeNull();
    // Only the caller's rows are touched.
    expect($theirs->fresh()->read_at)->toBeNull();
});

it('broadcasts a bidding phase once and answers the plain resource', function () {
    $owner = shrOwner('bc');
    $kon = shrContractor('bc');
    $pm = shrPM('bc');
    $project = shrProject($owner, $kon, $pm, 'bc');

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/broadcast-phase", ['role' => 'arsitek'])
        ->assertStatus(200);

    // The plain resource carries has_submitted_bid and budget_summary.
    expect($response->json('data.has_submitted_bid'))->toBeFalse();
    expect($response->json('data'))->toHaveKey('budget_summary');
    expect($response->json('data.published_bidding_roles'))->toBe(['arsitek']);

    expect($project->fresh()->published_bidding_roles)->toBe(['arsitek']);
    expect(ProjectActivityLog::where('project_id', $project->id)->where('action', 'phase_broadcast')->count())->toBe(1);

    // Broadcasting the same role again is a no-op.
    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/broadcast-phase", ['role' => 'arsitek'])
        ->assertStatus(200);

    expect($project->fresh()->published_bidding_roles)->toBe(['arsitek']);
    expect(ProjectActivityLog::where('project_id', $project->id)->where('action', 'phase_broadcast')->count())->toBe(1);

    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/broadcast-phase", ['role' => 'kontraktor'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/broadcast-phase", ['role' => 'chef'])
        ->assertStatus(422)
        ->assertJsonPath('errors.role', ['The selected role is invalid.']);
});
