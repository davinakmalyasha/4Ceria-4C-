<?php

use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectWarrantyClaim;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Warranty claims: the post-handover defect window
|--------------------------------------------------------------------------
|
| - participants read the list (full reporter);
| - participants file claims only while the warranty runs: no end date is
|   a 422, a passed end date names the day, and the hired contractor's
|   user is notified;
| - the hired contractor or the owner updates the status; `cost_impact`
|   is owner-only when positive (the old guard used `??` with looser
|   precedence than `&&`, so it refused EVERY caller, owner included);
| - `resolved` stamps resolved_at; the status answer is the row in table
|   order without the reporter.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function warOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "warown_$tag" . uniqid(),
        'email' => "warown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function warContractor(string $tag): User
{
    $user = User::create([
        'name' => "Kon $tag", 'username' => "wark_$tag" . uniqid(),
        'email' => "wark_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    Kontraktor::create(['user_id' => $user->id, 'nama' => "Build $tag"]);

    return $user;
}

function warProject(User $owner, User $kon, string $tag, ?string $end = '2027-04-01'): Project
{
    return Project::create([
        'title' => "Warranty $tag", 'user_id' => $owner->id,
        'budget' => 120_000_000, 'status' => 'completed', 'target_role' => 'both',
        'selected_kontraktor_id' => $kon->kontraktor->id,
        'warranty_start_at' => '2026-10-01', 'warranty_end_at' => $end,
    ]);
}

it('files a claim with an image and notifies the contractor', function () {
    Storage::fake('public');
    $owner = warOwner('ok');
    $kon = warContractor('ok');
    $project = warProject($owner, $kon, 'ok');

    $response = $this->actingAs($owner)
        ->post("/api/projects/{$project->id}/warranty-claims", [
            'title' => 'Leaking roof', 'description' => 'bedroom ceiling',
            'images' => [UploadedFile::fake()->image('leak.png', 20, 20)],
        ])
        ->assertStatus(200)
        ->assertJsonPath('message', 'Warranty claim filed');

    expect(array_keys($response->json('data')))->toBe([
        'reporter_id', 'title', 'description', 'images', 'status',
        'project_id', 'updated_at', 'created_at', 'id',
    ]);
    // Paths stay RAW: this model has no toArray override.
    expect($response->json('data.images.0'))->toStartWith("projects/{$project->id}/warranty/");

    $claim = ProjectWarrantyClaim::where('project_id', $project->id)->sole();
    expect($claim->status)->toBe('open');
    expect($claim->cost_impact)->toBe('0.00');

    expect(\App\Models\Notification::where('user_id', $kon->id)->where('type', 'warranty_claim')->count())->toBe(1);
});

it('enforces the warranty window', function () {
    $owner = warOwner('win');
    $kon = warContractor('win');

    $notStarted = warProject($owner, $kon, 'none', null);
    $this->actingAs($owner)
        ->postJson("/api/projects/{$notStarted->id}/warranty-claims", ['title' => 'x', 'description' => 'y'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The warranty period has not started yet. Claims can be filed after project handover.');

    $expired = warProject($owner, $kon, 'old', '2026-01-15');
    $this->actingAs($owner)
        ->postJson("/api/projects/{$expired->id}/warranty-claims", ['title' => 'x', 'description' => 'y'])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The warranty period ended on 15 Jan 2026.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$expired->id}/warranty-claims", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['title', 'description']);
});

it('lists claims with the full reporter', function () {
    $owner = warOwner('list');
    $kon = warContractor('list');
    $project = warProject($owner, $kon, 'list');

    ProjectWarrantyClaim::create([
        'project_id' => $project->id, 'reporter_id' => $owner->id,
        'title' => 'Hairline crack', 'description' => 'wall', 'images' => [], 'status' => 'open',
    ]);

    $response = $this->actingAs($kon)
        ->getJson("/api/projects/{$project->id}/warranty-claims")
        ->assertStatus(200);

    expect($response->json('data.0.reporter.id'))->toBe($owner->id);
    expect($response->json('data.0.reporter.email'))->toBe($owner->email);

    $stranger = warOwner('out');
    $this->actingAs($stranger)
        ->getJson("/api/projects/{$project->id}/warranty-claims")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');
});

it('updates the status and keeps cost impact owner-only', function () {
    $owner = warOwner('upd');
    $kon = warContractor('upd');
    $project = warProject($owner, $kon, 'upd');
    $claim = ProjectWarrantyClaim::create([
        'project_id' => $project->id, 'reporter_id' => $owner->id,
        'title' => 'Leak', 'description' => 'ceiling', 'images' => [], 'status' => 'open',
    ]);

    $this->actingAs($kon)
        ->putJson("/api/projects/{$project->id}/warranty-claims/{$claim->id}/status", ['status' => 'resolved'])
        ->assertStatus(200)
        ->assertJsonPath('data.status', 'resolved');

    expect($claim->fresh()->resolved_at)->not->toBeNull();
    expect($claim->fresh()->cost_impact)->toBe('0.00');

    // A contractor cannot set a cost; the owner can (the old guard refused
    // everyone because `??` binds looser than `&&`).
    $this->actingAs($kon)
        ->putJson("/api/projects/{$project->id}/warranty-claims/{$claim->id}/status", ['status' => 'fixing', 'cost_impact' => 500000])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the project owner can set a cost impact.');

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/warranty-claims/{$claim->id}/status", ['status' => 'fixing', 'cost_impact' => 500000])
        ->assertStatus(200)
        ->assertJsonPath('data.cost_impact', '500000.00');

    // Binding: a claim from another project is the plain 404.
    $other = warProject($owner, $kon, 'other');
    $foreign = ProjectWarrantyClaim::create([
        'project_id' => $other->id, 'reporter_id' => $owner->id,
        'title' => 'Foreign', 'description' => 'x', 'images' => [], 'status' => 'open',
    ]);

    $this->actingAs($owner)
        ->putJson("/api/projects/{$project->id}/warranty-claims/{$foreign->id}/status", ['status' => 'closed'])
        ->assertStatus(404)
        ->assertJsonPath('message', 'Not found.');

    // An unrelated professional cannot update.
    $stranger = warContractor('out');
    $this->actingAs($stranger)
        ->putJson("/api/projects/{$project->id}/warranty-claims/{$claim->id}/status", ['status' => 'closed'])
        ->assertStatus(403)
        ->assertJsonPath('message', 'Unauthorized.');
});
