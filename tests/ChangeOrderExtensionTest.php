<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectChangeOrder;
use App\Models\ProjectManager;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectTimelineExtension;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Change orders and timeline extensions
|--------------------------------------------------------------------------
|
| Change orders: participants propose, the PM reviews, the owner decides —
| an approval with a positive cost mints EXACTLY ONE payment stage after
| the escrow check, and a decided order cannot be decided again. The list
| merges billable addendums into the same timeline.
|
| Extensions: participants request, the PM reviews, the owner approves —
| an approval moves projects.deadline forward by the requested days.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function coOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "coown_$tag" . uniqid(),
        'email' => "coown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function coContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "cok_$tag" . uniqid(),
        'email' => "cok_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);
    return $user;
}

function coPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "copm_$tag" . uniqid(),
        'email' => "copm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag"]);
    return $user;
}

function coProject(User $owner, User $kon, User $pm, string $tag): Project
{
    return Project::create([
        'title' => "CO $tag", 'user_id' => $owner->id,
        'budget' => 200_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_kontraktor_id' => $kon->kontraktor->id,
        'pm_id' => $pm->project_manager->id,
        'deadline' => '2026-12-31',
    ]);
}

it('proposes, reviews and approves a change order into one payment stage', function () {
    $owner = coOwner('ok');
    $kon = coContractor('ok');
    $pm = coPM('ok');
    $project = coProject($owner, $kon, $pm, 'ok');

    $created = $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/change-orders", [
            'title' => 'Extra wall', 'description' => 'add wall',
            'cost_impact' => 5_000_000, 'time_impact_days' => 3,
        ])
        ->assertStatus(201);

    expect(array_keys($created->json('data')))->toBe([
        'requested_by', 'role_type', 'milestone_id', 'title', 'description', 'cost_impact',
        'time_impact_days', 'status', 'project_id', 'updated_at', 'created_at', 'id',
    ]);
    $order = ProjectChangeOrder::where('project_id', $project->id)->sole();

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/change-orders/{$order->id}/pm-review", ['pm_notes' => 'ok', 'action' => 'approve'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'pm_reviewed');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/change-orders/{$order->id}/owner-decide", ['action' => 'approve', 'owner_notes' => 'fine'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'owner_approved');

    $termins = ProjectPaymentTermin::where('project_id', $project->id)->get();
    expect($termins)->toHaveCount(1);
    expect($termins[0]->label)->toBe('Change Order: Extra wall');
    expect($termins[0]->change_order_id)->toBe($order->id);

    // A decided order cannot be decided again.
    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/change-orders/{$order->id}/owner-decide", ['action' => 'reject'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'This change order has already been decided (status: owner_approved).');
});

it('refuses a change order the escrow cannot cover', function () {
    $owner = coOwner('poor');
    $kon = coContractor('poor');
    $pm = coPM('poor');
    $project = coProject($owner, $kon, $pm, 'poor');
    $project->update(['budget' => 1_000]);

    $order = ProjectChangeOrder::create([
        'project_id' => $project->id, 'requested_by' => $kon->id, 'role_type' => 'kontraktor',
        'title' => 'Big', 'description' => 'x', 'cost_impact' => 5_000_000,
        'time_impact_days' => 0, 'status' => 'pm_reviewed',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/change-orders/{$order->id}/owner-decide", ['action' => 'approve'])
        ->assertStatus(422);

    expect(ProjectPaymentTermin::where('project_id', $project->id)->count())->toBe(0);
    expect($order->fresh()->status)->toBe('pm_reviewed');
});

it('requests, reviews and approves an extension, moving the deadline', function () {
    $owner = coOwner('ext');
    $kon = coContractor('ext');
    $pm = coPM('ext');
    $project = coProject($owner, $kon, $pm, 'ext');

    $created = $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/extensions", ['reason' => 'rain', 'description' => 'monsoon', 'days_requested' => 7])
        ->assertStatus(200);

    expect(array_keys($created->json('data')))->toBe([
        'requester_id', 'reason', 'description', 'days_requested', 'original_deadline',
        'status', 'project_id', 'updated_at', 'created_at', 'id',
    ]);
    $extension = ProjectTimelineExtension::where('project_id', $project->id)->sole();

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/extensions/{$extension->id}/pm-review", ['status' => 'pm_reviewed', 'pm_notes' => 'ok'])
        ->assertStatus(200);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/extensions/{$extension->id}/owner-decide", ['status' => 'approved', 'owner_notes' => 'ok'])
        ->assertStatus(200);

    expect($extension->fresh()->status)->toBe('approved');
    expect($project->fresh()->deadline)->toStartWith('2027-01-07');
});

it('gates both machines', function () {
    $owner = coOwner('gate');
    $kon = coContractor('gate');
    $pm = coPM('gate');
    $stranger = coOwner('out');
    $project = coProject($owner, $kon, $pm, 'gate');

    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/change-orders")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/change-orders", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['title', 'description', 'cost_impact']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/extensions", ['reason' => 'x', 'days_requested' => 0])
        ->assertStatus(422)
        ->assertJsonPath('errors.days_requested', ['The days requested field must be at least 1.']);
});
