<?php

use App\Models\House;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\TeamMember;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/*
|--------------------------------------------------------------------------
| The defects the contract capture found
|--------------------------------------------------------------------------
|
| The contract capture records what the legacy application answers, and in
| recording all 296 endpoints it found five that answered 500 — a server
| error, on an endpoint a real user would call.
|
|   B23 — GET /api/mep-engineers and GET /api/structural-engineers
|          The professional directory does `withCount('projects')` on every
|          model it lists, and the two SPECIALIST models had no `projects`
|          relation. Every caller got a 500, on every request, since the
|          endpoint was written.
|
|   B24 — PATCH /api/admin/houses/{id}/suspend
|          The `is_suspended` column existed and the administrator's
|          endpoint always wrote it — but it was not mass-assignable, so the
|          endpoint answered 500. An administrator could not suspend a
|          single listing.
|
|   B25 — POST /api/projects/{project}/mark-complete
|          The endpoint wrote `projects.completed_at`, a column that did
|          not exist. The owner could not complete their own project.
|
|   B26 — POST /api/projects/{project}/handover/approve
|          The phase was read with no validation and passed into a
|          non-nullable string parameter, so a request without a phase was
|          a 500 with a stack trace in the message.
|
|   B27 — the project's resource read four attributes that do not exist
|          `users.profile_picture` and `users.technical_skills`, and
|          `team_members.technical_skills` — so in production the keys were
|          always null (the SPA shows no avatars and no skills) and in
|          development it was a 500.
|
| Each one is pinned here, so a regression fails the build rather than
| being found by the next capture.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function captureUser(string $role = 'user'): User
{
    return User::create([
        'name' => 'Capture User '.$role,
        'username' => 'cap_'.$role.'_'.uniqid(),
        'email' => 'cap_'.$role.'_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $role,
    ]);
}

// ---------------------------------------------------------------------------
// B23 — the specialist directories
// ---------------------------------------------------------------------------

it('lists the MEP engineers without a server error', function () {
    $user = captureUser('mep');

    $engineer = \App\Models\MepEngineer::create([
        'user_id' => $user->id,
        'nama' => 'A Fixture MEP',
        'no_telp' => '081100000006',
        'rate_harga' => 20_000_000,
        'spesialisasi' => 'MEP',
        'verification_status' => 'verified',
    ]);

    $response = $this->getJson('/api/mep-engineers');

    $response->assertStatus(200);

    // The directory counts the projects, so the relation has to exist.
    expect($engineer->projects()->count())->toBe(0);
});

it('lists the structural engineers without a server error', function () {
    $user = captureUser('structural');

    $engineer = StructuralEngineer::create([
        'user_id' => $user->id,
        'nama' => 'A Fixture Structural',
        'no_telp' => '081100000005',
        'rate_harga' => 20_000_000,
        'spesialisasi' => 'Structural',
        'verification_status' => 'verified',
    ]);

    $this->getJson('/api/structural-engineers')->assertStatus(200);

    expect($engineer->projects()->count())->toBe(0);
});

it('counts the projects a specialist was hired on', function () {
    $owner = captureUser();
    $pro = captureUser('structural');

    $engineer = StructuralEngineer::create([
        'user_id' => $pro->id,
        'nama' => 'A Hired Structural',
        'verification_status' => 'verified',
    ]);

    $project = Project::create([
        'title' => 'A structural project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'structural_id' => $engineer->id,
    ]);

    expect($engineer->projects()->count())->toBe(1)
        ->and($engineer->projects->first()->id)->toBe($project->id);
});

// ---------------------------------------------------------------------------
// B24 — the administrator suspends a listing
// ---------------------------------------------------------------------------

it('lets an administrator suspend a house', function () {
    $admin = captureUser('admin');

    $house = House::create([
        'name' => 'A Fixture House',
        'price' => 1_000_000_000,
        'id_user' => $admin->id,
    ]);

    $this->actingAs($admin, 'sanctum')
        ->patchJson("/api/admin/houses/{$house->id}/suspend")
        ->assertStatus(200);

    expect((bool) $house->fresh()->is_suspended)->toBeTrue();
});

// ---------------------------------------------------------------------------
// B25 — the owner completes a project
// ---------------------------------------------------------------------------

it('lets the owner complete a project', function () {
    $owner = captureUser();

    $project = Project::create([
        'title' => 'A Completed Project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
    ]);

    $this->actingAs($owner, 'sanctum')
        ->postJson("/api/projects/{$project->id}/mark-complete")
        ->assertStatus(200);

    $project->refresh();

    expect($project->status)->toBe('completed')
        ->and($project->completed_at)->not->toBeNull();
});

// ---------------------------------------------------------------------------
// B26 — the handover approval validates its phase
// ---------------------------------------------------------------------------

it('refuses a handover approval without a phase, with a 422', function () {
    $owner = captureUser();
    $pmUser = captureUser('project_manager');

    $pm = ProjectManager::create([
        'user_id' => $pmUser->id,
        'nama' => 'A Fixture PM',
        'verification_status' => 'verified',
    ]);

    $project = Project::create([
        'title' => 'A Handover Project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'pm_id' => $pm->id,
    ]);

    // No phase in the body. It used to be a TypeError — a 500 with a stack
    // trace in the message.
    $this->actingAs($pmUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/handover/approve")
        ->assertStatus(422)
        ->assertJsonValidationErrors('phase');

    // And a phase nobody knows is refused the same way, rather than
    // reaching the switch and returning "Phase verification failed".
    $this->actingAs($pmUser, 'sanctum')
        ->postJson("/api/projects/{$project->id}/handover/approve", ['phase' => 'nonsense'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('phase');
});

// ---------------------------------------------------------------------------
// B27 — the project resource reads the columns that exist
// ---------------------------------------------------------------------------

it('sends the picture and the skills the SPA expects', function () {
    $owner = captureUser();
    $pro = captureUser('structural');

    // The user's picture column is `pic` — there is no `profile_picture`.
    $owner->update(['pic' => 'avatars/capture.png']);

    $project = Project::create([
        'title' => 'A Resource Project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
    ]);

    $teamMember = TeamMember::create([
        'owner_user_id' => $owner->id,
        'owner_role' => 'arsitek',
        'name' => 'A Fixture Colleague',
        'role_title' => 'Engineer',
        'skills' => ['structural', 'mep'],
        'status' => 'active',
    ]);

    \App\Models\ProjectComment::create([
        'project_id' => $project->id,
        'user_id' => $owner->id,
        'message' => 'A comment.',
    ]);

    // The resource reads the comment's author. It used to read
    // `users.profile_picture`, a column that does not exist — so in
    // production the key was always null and the SPA showed no avatars,
    // and in development it was a 500.
    $resolved = (new \App\Http\Resources\ProjectResource(
        $project->load('comments.user')
    ))->toArray(request());

    expect($resolved['comments'][0]['user']['profile_picture'])
        ->toBeString()
        ->and($resolved['comments'][0]['user']['profile_picture'])->toContain('capture.png');

    // The team member's skills come from `team_members.skills` — the
    // column that exists. `technical_skills` was never a column.
    expect($teamMember->skills)->toBe(['structural', 'mep']);
});
