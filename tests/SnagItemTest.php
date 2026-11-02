<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectSnagItem;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Snag items: report, progress, resolve and accept
|--------------------------------------------------------------------------
|
| - only the owner or assigned PM reports defects; `due_at` is now + the
|   severity's SLA (critical 3, major 7, minor 14 days);
| - only the assigned contractor (or the interior designer for interior
|   snags) progresses/resolves their own defect;
| - only RESOLVED items can be accepted, and the answer sets `accepted`;
| - rows carry `is_overdue`/`age_days` and URL-resolved photo arrays, with
|   the repo reduced to {id,name} on the list.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function snagOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "snagown_$tag" . uniqid(),
        'email' => "snagown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function snagContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "snagk_$tag" . uniqid(),
        'email' => "snagk_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);

    return $user;
}

function snagProject(User $owner, User $kon, string $tag): Project
{
    return Project::create([
        'title' => "Snags $tag", 'user_id' => $owner->id,
        'budget' => 150_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_kontraktor_id' => $kon->kontraktor->id,
    ]);
}

it('reports a defect with the severity SLA and photos', function () {
    Storage::fake('public');
    $owner = snagOwner('ok');
    $kon = snagContractor('ok');
    $project = snagProject($owner, $kon, 'ok');

    $response = $this->actingAs($owner)
        ->post("/api/projects/{$project->id}/snag-items", [
            'title' => 'Cracked tile', 'description' => 'hallway', 'location' => 'L1',
            'severity' => 'major', 'assigned_role' => 'kontraktor',
            'photos' => [UploadedFile::fake()->image('crack.png', 20, 20)],
        ])
        ->assertStatus(201)
        ->assertJsonPath('message', 'Defect reported.');

    expect(array_keys($response->json('data')))->toBe([
        'title', 'description', 'location', 'severity', 'assigned_role', 'reported_by',
        'photos', 'due_at', 'project_id', 'updated_at', 'created_at', 'id',
        'is_overdue', 'age_days',
    ]);
    expect($response->json('data.is_overdue'))->toBeFalse();
    expect($response->json('data.age_days'))->toBe(0);
    expect($response->json('data.photos.0'))->toContain('/storage/projects/');

    $snag = ProjectSnagItem::where('project_id', $project->id)->sole();
    expect($snag->status)->toBe('open');
    expect($snag->due_at->format('Y-m-d'))->toBe(now()->addDays(7)->format('Y-m-d'));
    expect($snag->photos[0])->toStartWith("projects/{$project->id}/snags/");

    // Only the owner or PM reports.
    $this->actingAs($kon)
        ->postJson("/api/projects/{$project->id}/snag-items", ['title' => 'x', 'severity' => 'minor'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the Owner or PM can report defects.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/snag-items", ['severity' => 'huge'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['title', 'severity']);
});

it('lists with the reporter and overdue flag', function () {
    $owner = snagOwner('list');
    $kon = snagContractor('list');
    $project = snagProject($owner, $kon, 'list');

    ProjectSnagItem::create([
        'project_id' => $project->id, 'title' => 'Late defect', 'severity' => 'minor',
        'status' => 'open', 'assigned_role' => 'kontraktor', 'reported_by' => $owner->id,
        'photos' => [], 'due_at' => now()->subDay(),
    ]);

    $response = $this->actingAs($kon)
        ->getJson("/api/projects/{$project->id}/snag-items")
        ->assertStatus(200);

    expect($response->json('data.0.is_overdue'))->toBeTrue();
    expect($response->json('data.0.reporter'))->toBe(['id' => $owner->id, 'name' => $owner->name]);

    $stranger = snagOwner('out');
    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/snag-items")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');
});

it('progresses and resolves as the assigned professional', function () {
    Storage::fake('public');
    $owner = snagOwner('upd');
    $kon = snagContractor('upd');
    $project = snagProject($owner, $kon, 'upd');
    $snag = ProjectSnagItem::create([
        'project_id' => $project->id, 'title' => 'Wet wall', 'severity' => 'major',
        'status' => 'open', 'assigned_role' => 'kontraktor', 'reported_by' => $owner->id,
        'photos' => [], 'due_at' => now()->addDays(3),
    ]);

    $this->actingAs($kon)
        ->putJson("/api/projects/{$project->id}/snag-items/{$snag->id}", ['status' => 'in_progress'])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Snag item updated.')
        ->assertJsonPath('data.status', 'in_progress');

    // A JSON update cannot carry uploads; the multipart path is spoofed.
    $response = $this->actingAs($kon)
        ->post("/api/projects/{$project->id}/snag-items/{$snag->id}", [
            '_method' => 'PUT',
            'status' => 'resolved',
            'resolution_note' => 'replaced tile',
            'resolution_photos' => [UploadedFile::fake()->image('fix.png', 20, 20)],
        ]);

    $response->assertStatus(200)->assertJsonPath('data.status', 'resolved');
    expect($response->json('data.resolution_note'))->toBe('replaced tile');
    expect($response->json('data.resolved_at'))->not->toBeNull();
    expect($response->json('data.is_overdue'))->toBeFalse();

    // An interior-assigned snag rejects the contractor.
    $interior = ProjectSnagItem::create([
        'project_id' => $project->id, 'title' => 'Scuff', 'severity' => 'minor',
        'status' => 'open', 'assigned_role' => 'interior', 'reported_by' => $owner->id,
        'photos' => [], 'due_at' => now()->addDays(3),
    ]);
    $this->actingAs($kon)
        ->putJson("/api/projects/{$project->id}/snag-items/{$interior->id}", ['status' => 'in_progress'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the assigned professional can update this defect.');
});

it('accepts only resolved items and binds to the project', function () {
    $owner = snagOwner('acc');
    $kon = snagContractor('acc');
    $project = snagProject($owner, $kon, 'acc');

    $open = ProjectSnagItem::create([
        'project_id' => $project->id, 'title' => 'Open', 'severity' => 'minor',
        'status' => 'open', 'reported_by' => $owner->id, 'photos' => [], 'due_at' => now()->addDay(),
    ]);
    $resolved = ProjectSnagItem::create([
        'project_id' => $project->id, 'title' => 'Done', 'severity' => 'minor',
        'status' => 'resolved', 'reported_by' => $owner->id, 'photos' => [], 'due_at' => now()->addDay(),
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/snag-items/{$open->id}/accept")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Only resolved defect items can be accepted.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/snag-items/{$resolved->id}/accept")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Resolution accepted.');

    expect($resolved->fresh()->status)->toBe('accepted');

    // Cross-project binding answers the plain 404.
    $other = Project::create([
        'title' => 'Other', 'user_id' => $owner->id,
        'budget' => 1_000_000, 'status' => 'open', 'target_role' => 'both',
    ]);
    $foreign = ProjectSnagItem::create([
        'project_id' => $other->id, 'title' => 'Foreign', 'severity' => 'minor',
        'status' => 'resolved', 'reported_by' => $owner->id, 'photos' => [], 'due_at' => now()->addDay(),
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/snag-items/{$foreign->id}/accept")
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');
});
