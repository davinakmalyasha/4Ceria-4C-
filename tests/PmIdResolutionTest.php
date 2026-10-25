<?php

use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\User;
use App\Support\Hire;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/*
|--------------------------------------------------------------------------
| `projects.pm_id` holds a PROFILE id, and the rule has no exception left
|--------------------------------------------------------------------------
|
| `projects.pm_id` was the ONE column in the schema whose id space nobody had
| to think about, because it was the exception: it held the PM's USER id,
| while every other `selected_*` column on `projects` held a PROFILE id.
|
| It also DISAGREED WITH ITS OWN BID TABLE — `bids_project_manager.pm_id`
| held the PM's PROFILE id — so "the project's PM" and "the PM's bid" were two
| different numbers for the same person.
|
| The pm_id resolution migration made the column hold the PM's PROFILE id, so
| the convention is now ONE convention, and these tests pin it:
|
|   1. `projects.pm_id` resolves to a `project_managers` row.
|   2. The rule that decides "is this user the project's PM?" is stated ONCE,
|      in `Hire::isAssignedPm()`, and it compares profile ids.
|   3. The migration REFUSES to run when it cannot resolve a row, rather than
|      silently un-assigning a PM from a live project.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

function pmUser(string $tag): User
{
    $user = User::create([
        'name' => "PM {$tag}",
        'username' => "pm_{$tag}".uniqid(),
        'email' => "pm_{$tag}".uniqid().'@example.test',
        'password' => Hash::make('password123'),
        'role_type' => 'project_manager',
    ]);

    $profile = ProjectManager::create(['user_id' => $user->id, 'nama' => "PM {$tag}"]);

    return $user;
}

it('stores the PM PROFILE id in projects.pm_id, not the user id', function () {
    $owner = User::create([
        'name' => 'Owner', 'username' => 'own_'.uniqid(), 'email' => 'own_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pm = pmUser('resolve');

    $project = Project::create([
        'title' => 'A project with a PM',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'pm_id' => $pm->project_manager->id,
    ]);

    // The column resolves to the PROFILE row — and to nothing else.
    expect($project->fresh()->pm_id)->toBe($pm->project_manager->id)
        ->and(DB::table('project_managers')->where('id', $project->pm_id)->exists())->toBeTrue();
});

it('resolves the model relation to the PM profile, with no owner key', function () {
    $owner = User::create([
        'name' => 'Owner', 'username' => 'own_'.uniqid(), 'email' => 'own_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pm = pmUser('relation');

    $project = Project::create([
        'title' => 'A project with a PM',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'pm_id' => $pm->project_manager->id,
    ]);

    // The relation used to be `belongsTo(ProjectManager::class, 'pm_id',
    // 'user_id')` — the third argument existed ONLY because the column held a
    // user id.
    expect($project->fresh()->projectManager)->not->toBeNull()
        ->and($project->fresh()->projectManager->id)->toBe($pm->project_manager->id)
        ->and($project->fresh()->projectManager->user_id)->toBe($pm->id);
});

it('decides "is this user the assigned PM" by PROFILE id, and only for that person', function () {
    $owner = User::create([
        'name' => 'Owner', 'username' => 'own_'.uniqid(), 'email' => 'own_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $assigned = pmUser('assigned');
    $other = pmUser('other');

    $project = Project::create([
        'title' => 'A project with a PM',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'pm_id' => $assigned->project_manager->id,
    ]);

    expect(Hire::isAssignedPm($project, $assigned))->toBeTrue()
        ->and(Hire::isAssignedPm($project, $other))->toBeFalse()
        ->and(Hire::isAssignedPm($project, $owner))->toBeFalse()
        ->and(Hire::isAssignedPm($project, null))->toBeFalse();
});

it('does not let a user id stand in for a profile id', function () {
    $owner = User::create([
        'name' => 'Owner', 'username' => 'own_'.uniqid(), 'email' => 'own_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pm = pmUser('mixed');

    // The project column holds the PM's USER id — the OLD semantics. The rule
    // must not match it, because the user's id and the profile's id are
    // different numbers for the same person.
    $project = Project::create([
        'title' => 'A project with a PM',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        'pm_id' => $pm->id,
    ]);

    expect(Hire::isAssignedPm($project, $pm))->toBeFalse();
});

it('has no PM on a project with no PM assigned', function () {
    $owner = User::create([
        'name' => 'Owner', 'username' => 'own_'.uniqid(), 'email' => 'own_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);
    $pm = pmUser('unassigned');

    $project = Project::create([
        'title' => 'A project with no PM',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'open',
    ]);

    expect(Hire::isAssignedPm($project, $pm))->toBeFalse()
        ->and(Hire::isOwnerOrAssignedPm($project, $pm))->toBeFalse()
        ->and(Hire::isOwnerOrAssignedPm($project, $owner))->toBeTrue();
});

it('refuses to run the migration when a pm_id cannot be resolved', function () {
    // A `pm_id` that resolves to no profile row would be silently NULLed by a
    // naive migration — which UN-ASSIGNS a PM from a live project, and nobody
    // would find out until a stage stopped being payable.
    //
    // The pre-flight is what prevents that, so it is exercised here against a
    // row that cannot be resolved.
    $migration = require __DIR__.'/../database/migrations/2026_10_21_000001_resolve_projects_pm_id_to_a_profile_id.php';

    $owner = User::create([
        'name' => 'Owner', 'username' => 'own_'.uniqid(), 'email' => 'own_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $project = Project::create([
        'title' => 'A project with a dangling PM',
        'user_id' => $owner->id,
        'budget' => 100_000_000,
        'status' => 'in_progress',
        // A user id with no `project_managers` row.
        'pm_id' => 999_999_999,
    ]);

    expect(fn () => $migration->up())->toThrow(RuntimeException::class, 'refuses to run');

    // And the row is untouched.
    expect($project->fresh()->pm_id)->toBe(999_999_999);
});
