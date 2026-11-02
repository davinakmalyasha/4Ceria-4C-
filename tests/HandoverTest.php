<?php

use App\Models\Arsitek;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\ProjectSnagItem;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Handover: initiate the walkthrough and let the owner accept
|--------------------------------------------------------------------------
|
| - initiate-walkthrough needs the assigned PM (role AND hire), flips the
|   project to completed_build and opens the walkthrough;
| - owner-accept is owner-only, refuses while a snag is not accepted, runs
|   finalizeProject (new builds need SLF; needed_phases must equal
|   completed_phases) and opens the 180-day warranty window;
| - an optional rating is stored in arsitek_ratings against the hired
|   architect (the old payload sent `user_id`/`review`, neither fillable,
|   and omitted the NOT NULL arsitek_id);
| - the answer is the lean resource plus `review_arsitek` (project-scoped)
|   and `project_manager` — and no `review_kontraktor`.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function hoOwner(string $tag): User
{
    return User::create([
        'name' => "Owner $tag", 'username' => "hoown_$tag" . uniqid(),
        'email' => "hoown_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
}

function hoPM(string $tag): User
{
    $user = User::create([
        'name' => "PM $tag", 'username' => "hopm_$tag" . uniqid(),
        'email' => "hopm_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    ProjectManager::create(['user_id' => $user->id, 'nama' => "PM $tag", 'no_telp' => '081200000000']);

    return $user;
}

function hoArchitect(string $tag): User
{
    $user = User::create([
        'name' => "Arsitek $tag", 'username' => "hoa_$tag" . uniqid(),
        'email' => "hoa_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    Arsitek::create(['user_id' => $user->id, 'nama' => "Studio $tag"]);

    return $user;
}

function hoProject(User $owner, User $pm, User $architect, string $tag, array $overrides = []): Project
{
    return Project::create(array_merge([
        'title' => "Handover $tag", 'user_id' => $owner->id,
        'budget' => 250_000_000, 'status' => 'in_progress', 'target_role' => 'both',
        'selected_arsitek_id' => $architect->arsitek->id,
        'pm_id' => $pm->project_manager->id,
        'needed_phases' => ['construction'], 'completed_phases' => ['construction'],
    ], $overrides));
}

it('initiates the walkthrough for the assigned PM only', function () {
    $owner = hoOwner('walk');
    $pm = hoPM('walk');
    $architect = hoArchitect('walk');
    $project = hoProject($owner, $pm, $architect, 'walk');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/initiate-walkthrough")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the assigned PM can initiate the final walkthrough.');

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/initiate-walkthrough")
        ->assertStatus(200)
        ->assertJsonPath('message', 'Final walkthrough initiated.');

    $fresh = $project->fresh();
    expect($fresh->status)->toBe('completed_build');
    expect($fresh->walkthrough_status)->toBe('in_progress');
    expect($fresh->final_walkthrough_at)->not->toBeNull();

    $log = \App\Models\ProjectActivityLog::where('project_id', $project->id)->latest('id')->first();
    expect($log->action)->toBe('walkthrough_initiated');
});

it('accepts the project, opens the warranty and stores the rating', function () {
    $owner = hoOwner('acc');
    $pm = hoPM('acc');
    $architect = hoArchitect('acc');
    $project = hoProject($owner, $pm, $architect, 'acc');

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/owner-accept", ['rating' => 5, 'review' => 'great'])
        ->assertStatus(200);

    $fresh = $project->fresh();
    expect($fresh->status)->toBe('completed');
    expect($fresh->completed_at)->not->toBeNull();
    expect($fresh->owner_accepted_at)->not->toBeNull();
    expect($fresh->walkthrough_status)->toBe('completed');
    expect($fresh->warranty_start_at)->not->toBeNull();
    expect($fresh->warranty_end_at->diffInDays($fresh->warranty_start_at))->toEqual(-180.0);

    // The lean resource plus the two trailing keys.
    expect($response->json('data.review_arsitek.rating'))->toBe(5);
    expect($response->json('data.review_arsitek.comment'))->toBe('great');
    expect($response->json('data.project_manager.id'))->toBe($pm->project_manager->id);
    expect($response->json('data'))->not->toHaveKey('review_kontraktor');
    expect($response->json('data'))->not->toHaveKey('payment_termins');

    $rating = \App\Models\ArsitekRating::where('project_id', $project->id)->sole();
    expect($rating->reviewer_id)->toBe($owner->id);
    expect($rating->arsitek_id)->toBe($architect->arsitek->id);
    expect($rating->komentar)->toBe('great');

    expect(\App\Models\ProjectActivityLog::where('project_id', $project->id)->where('action', 'project_finalized')->count())->toBe(1);
});

it('refuses unaccepted snags and failed finalization', function () {
    $owner = hoOwner('blk');
    $pm = hoPM('blk');
    $architect = hoArchitect('blk');
    $project = hoProject($owner, $pm, $architect, 'blk');

    ProjectSnagItem::create([
        'project_id' => $project->id, 'title' => 'Open', 'severity' => 'minor',
        'status' => 'open', 'reported_by' => $owner->id, 'photos' => [], 'due_at' => now()->addDay(),
    ]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/owner-accept")
        ->assertStatus(422)
        ->assertJsonPath('message', 'Cannot accept project with unaccepted snag items.');

    ProjectSnagItem::where('project_id', $project->id)->update(['status' => 'accepted']);
    $project->update(['needed_phases' => ['legal']]);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/owner-accept")
        ->assertStatus(500)
        ->assertJsonPath('message', 'Failed to finalize project. Check SLF and Phase requirements.');

    expect($project->fresh()->status)->toBe('in_progress');
});

it('gates the owner and validates the rating', function () {
    $owner = hoOwner('gate');
    $pm = hoPM('gate');
    $architect = hoArchitect('gate');
    $project = hoProject($owner, $pm, $architect, 'gate');

    $this->actingAs($pm)
        ->postJson("/api/projects/{$project->id}/owner-accept")
        ->assertStatus(403)
        ->assertJsonPath('message', 'Only the project Owner can accept the building.');

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/owner-accept", ['rating' => 9])
        ->assertStatus(422)
        ->assertJsonPath('errors.rating', ['The rating field must not be greater than 5.']);

    $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/owner-accept", ['review' => str_repeat('x', 1001)])
        ->assertStatus(422)
        ->assertJsonPath('errors.review', ['The review field must not be greater than 1000 characters.']);
});
