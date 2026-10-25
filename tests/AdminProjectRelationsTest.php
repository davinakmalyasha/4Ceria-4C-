<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/*
|--------------------------------------------------------------------------
| The admin project list must not 500
|--------------------------------------------------------------------------
|
| Regression suite for two defects found in the audit that no test covered,
| because the endpoint had never returned anything but a 500.
|
| B1 — `Project::selectedKontraktor` DID NOT EXIST
| ------------------------------------------------
| `AdminDashboardController::projects()` eager-loaded
|
|     Project::with(['user', 'selectedArsitek', 'selectedKontraktor'])
|
| and `selectedKontraktor` was not a relation on the model. Laravel throws
| `RelationNotFoundException` when it cannot resolve an eager-load name, so
| `GET /api/admin/projects` returned 500 for EVERY project.
|
| The same relation name appeared in `terminateProject()`, where it was worse:
| the handler updated `status = 'cancelled'` FIRST and eager-loaded
| afterwards, so the update was committed and THEN the 500 was thrown. The
| client saw a failure, the project was cancelled anyway, and a retry
| cancelled it again.
|
| B2 — `Project::selectedArsitek` JOINED THE WRONG ID SPACE
| ----------------------------------------------------------
| It was `belongsTo(User::class, 'selected_arsitek_id')` — joining `users.id`
| to an `arsiteks.id`. `projects.selected_arsitek_id` stores a PROFILE id;
| the live value 6634 exists in `arsiteks` and does NOT exist in `users`, so
| the relation could never resolve.
|
| It was also the wrong SHAPE. The admin UI reads `selected_arsitek.nama`,
| and `users` has `name`, not `nama` — so even in the impossible case where
| the join did match, the field the UI displays would have been undefined.
|
| THE FIX
| -------
| The relations are gone rather than repaired. `Project` already had
| `arsitek()` and `kontraktor()` pointing at the right models, and
| `ProjectResource` already emits them under the `arsitek` / `kontraktor`
| keys. The admin endpoints now use those, so the admin list and
| `GET /api/projects/{id}` speak ONE contract instead of two.
|
| The tests below pin the behaviour that matters:
|   - the endpoint returns 200 and the rows carry the hired professionals;
|   - the architect is the PROJECT's architect, not somebody else's;
|   - a project with no hired professional says so, rather than naming one.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function adminTestUser(): User
{
    return User::create([
        'name' => 'Admin User',
        'username' => 'admin_'.uniqid(),
        'email' => 'admin_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'admin',
    ]);
}

function ownerTestUser(): User
{
    return User::create([
        'name' => 'Project Owner',
        'username' => 'owner_'.uniqid(),
        'email' => 'owner_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'user',
    ]);
}

function arsitekTestUser(string $nama): User
{
    $user = User::create([
        'name' => "Arsitek {$nama}",
        'username' => 'ar_'.uniqid(),
        'email' => 'ar_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'arsitek',
    ]);

    Arsitek::create(['user_id' => $user->id, 'nama' => $nama]);

    return $user;
}

function kontraktorTestUser(string $nama, string $perusahaan): User
{
    $user = User::create([
        'name' => "Kontraktor {$nama}",
        'username' => 'ko_'.uniqid(),
        'email' => 'ko_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'kontraktor',
    ]);

    Kontraktor::create(['user_id' => $user->id, 'nama' => $nama, 'nama_perusahaan' => $perusahaan]);

    return $user;
}

it('lists admin projects instead of 500ing', function () {
    $admin = adminTestUser();
    $owner = ownerTestUser();

    Project::create([
        'title' => 'A listed project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
    ]);

    $this->actingAs($admin)
        ->getJson('/api/admin/projects')
        ->assertStatus(200)
        ->assertJsonPath('data.0.title', 'A listed project');
});

it('carries the hired architect and contractor on the admin list', function () {
    $admin = adminTestUser();
    $owner = ownerTestUser();
    $arsitek = arsitekTestUser('Arsitek Satu');
    $kontraktor = kontraktorTestUser('Kontraktor Satu', 'PT Kontraktor Satu');

    Project::create([
        'title' => 'A staffed project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'selected_arsitek_id' => $arsitek->arsitek->id,
        'selected_kontraktor_id' => $kontraktor->kontraktor->id,
    ]);

    $row = $this->actingAs($admin)
        ->getJson('/api/admin/projects')
        ->assertStatus(200)
        ->json('data.0');

    // The relation names are the ones `ProjectResource` already uses.
    expect($row['arsitek']['nama'] ?? null)->toBe('Arsitek Satu')
        ->and($row['kontraktor']['nama_perusahaan'] ?? null)->toBe('PT Kontraktor Satu');
});

it('resolves the architect to the PROJECT\'s architect and nobody else', function () {
    $admin = adminTestUser();
    $owner = ownerTestUser();

    // Two architects. The project's column points at ONE of them. A relation
    // that joins the wrong id space would show the other one — or none.
    $hired = arsitekTestUser('The Hired One');
    $other = arsitekTestUser('Somebody Else');

    Project::create([
        'title' => 'A staffed project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'selected_arsitek_id' => $hired->arsitek->id,
    ]);

    $row = $this->actingAs($admin)
        ->getJson('/api/admin/projects')
        ->assertStatus(200)
        ->json('data.0');

    expect($row['arsitek']['nama'] ?? null)->toBe('The Hired One')
        ->and($row['arsitek']['nama'] ?? null)->not->toBe('Somebody Else');
});

it('reports no hired professional rather than naming one', function () {
    $admin = adminTestUser();
    $owner = ownerTestUser();

    Project::create([
        'title' => 'An unstaffed project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
    ]);

    $row = $this->actingAs($admin)
        ->getJson('/api/admin/projects')
        ->assertStatus(200)
        ->json('data.0');

    expect($row['arsitek'] ?? null)->toBeNull()
        ->and($row['kontraktor'] ?? null)->toBeNull();
});

it('force-terminates a project and returns it, without a silent partial failure', function () {
    $admin = adminTestUser();
    $owner = ownerTestUser();
    $arsitek = arsitekTestUser('Arsitek Satu');

    $project = Project::create([
        'title' => 'A doomed project',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'selected_arsitek_id' => $arsitek->arsitek->id,
    ]);

    $response = $this->actingAs($admin)
        ->postJson("/api/admin/projects/{$project->id}/force-terminate")
        ->assertStatus(200);

    expect($response->json('project.status'))->toBe('cancelled')
        ->and($response->json('project.arsitek.nama'))->toBe('Arsitek Satu')
        ->and($project->fresh()->status)->toBe('cancelled');
});
