<?php

use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/*
|--------------------------------------------------------------------------
| B32 — the active-projects list leaked other people's projects
|--------------------------------------------------------------------------
|
| `ProjectController@getActiveProjects` built its filter like this:
|
|     $query->where('user_id', $user->id)
|         ->orWhere('selected_arsitek_id', $user->arsitek?->id)
|         ->orWhere('selected_kontraktor_id', $user->kontraktor?->id)
|         ...
|
| `?->id` answers NULL for a user who has no profile for that role, and
| `orWhere($column, null)` is `orWhereNull($column)`. So every role the caller
| did NOT hold added `column IS NULL` to the filter, and a user with no
| professional profiles matched every project whose selected_* columns were
| empty.
|
| That is exactly the account most likely to open the dashboard: an
| administrator. Verified live before the fix — an admin token returned two
| demo projects the account neither owned nor worked on, with their titles.
|
| The test asserts BOTH halves: the outsider sees nothing, and the owner still
| sees their own project. A filter that simply returned nothing would pass the
| first half and break the product.
|
*/

uses(Tests\TestCase::class);

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function activeProjectsUser(string $suffix, string $role): User
{
    return User::create([
        'name' => "Active {$suffix}",
        'username' => 'active_'.$suffix.'_'.uniqid(),
        'email' => 'active_'.$suffix.'_'.uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $role,
    ]);
}

it('does not show project titles to an account with no role on them', function () {
    $owner = activeProjectsUser('owner', 'user');

    Project::create([
        'title' => 'Someone else house',
        'user_id' => $owner->id,
        'budget' => 1_000_000,
        'status' => 'open',
        'selected_arsitek_id' => null,
        'selected_kontraktor_id' => null,
    ]);

    // An administrator: no arsiteks row, no kontraktors row, no profile of any
    // kind — which is what made every `orWhere(column, null)` match.
    $admin = activeProjectsUser('admin', 'admin');

    $response = $this->actingAs($admin)->getJson('/api/user/active-projects');

    $response->assertOk();

    expect($response->json('data'))->toBe([]);
});

it('still shows the owner their own active project', function () {
    $owner = activeProjectsUser('own', 'user');

    $project = Project::create([
        'title' => 'My own house',
        'user_id' => $owner->id,
        'budget' => 1_000_000,
        'status' => 'open',
    ]);

    $response = $this->actingAs($owner)->getJson('/api/user/active-projects');

    $response->assertOk();

    $ids = array_column($response->json('data'), 'id');

    expect($ids)->toContain($project->id);
});

it('names only statuses the ENUM actually has', function () {
    // `planning` was in the filter and is NOT a member of `projects.status`.
    // MySQL coerces and ignores it; PostgreSQL raises
    // `invalid input value for enum project_status`, so the ported query has to
    // say what the column can hold.
    $controller = file_get_contents(app_path('Http/Controllers/Api/ProjectController.php'));

    expect($controller)->not->toContain("'planning'");
});
