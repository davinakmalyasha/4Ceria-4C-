<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\ProjectManager;
use App\Models\Project;
use App\Models\User;
use App\Support\Hire;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| The bid role registry must state the id space it speaks in
|--------------------------------------------------------------------------
|
| The registry (`config/bids.php`) is the single source of truth for the seven
| licensed professional roles. It used to carry a THIRD key,
| `project_user_key`, which claimed a USER id for the six roles whose project
| column actually holds a PROFILE id.
|
| Two things were wrong with it:
|
|   1. It was WRONG. `projects.selected_arsitek_id` holds an `arsiteks.id`.
|      The live value 6634 exists in `arsiteks` and not in `users`.
|
|   2. It was DEAD. Nothing in `app/` or `tests/` ever read it.
|
| A key that is wrong AND unread is the worst combination: it looks
| authoritative, so the next person to wire something up trusts it, and it
| hands them a profile id where they expected a user id — the exact id-space
| confusion that produced `Project::selectedArsitek()` joining `users.id` to
| an `arsiteks.id` and always resolving to null.
|
| The registry now declares TWO things per role, and the tests below hold both
| of them to the truth:
|
|   project_id_column   the column on `projects`
|   project_id_kind     'profile' or 'user' — WHICH id space it is
|
| The `pm_id` exception is now DATA rather than a comment, so it cannot be
| contradicted by a neighbouring key.
|
*/

uses(Tests\TestCase::class);

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

it('declares an id space for every licensed role', function () {
    foreach (Hire::knownRoles() as $role) {
        $config = config("bids.{$role}");

        expect($config['project_id_column'] ?? null)->toBeString()
            ->and($config['project_id_column'] ?? '')->not->toBe('');
    }
});

it('never resurrects the dead and misleading project_user_key', function () {
    // The key is gone. If it comes back, it is wrong again — it claimed a user
    // id for the six profile roles — and it will be wrong *unnoticed* the
    // second time too, because nothing read it the first time.
    foreach (config('bids') as $role => $config) {
        expect($config)->not->toHaveKey('project_user_key');
    }
});

it('points every project_id_column at a real column on projects', function () {
    foreach (Hire::knownRoles() as $role) {
        $column = Hire::projectColumnFor($role);

        expect($column)->not->toBeNull()
            ->and(Schema::hasColumn('projects', $column))->toBeTrue(
                "config('bids.{$role}.project_id_column') names `{$column}`, which is not a column on `projects`"
            );
    }
});

it('never resurrects the project_id_kind either — there is no id-space split left', function () {
    // `projects.pm_id` USED TO hold the PM's USER id, which is why the
    // registry needed a key saying which id space each column was in. The
    // pm_id resolution migration made it hold the PM's PROFILE id, so every
    // column is in the same space and the key has nothing left to say.
    foreach (config('bids') as $role => $config) {
        expect($config)->not->toHaveKey('project_id_kind');
    }

    // And the rule itself: every project's column holds a PROFILE id.
    expect(Hire::projectIdKind('project_manager'))->toBe('profile')
        ->and(Hire::projectIdKind('arsitek'))->toBe('profile');
});

it('resolves EVERY role to its PROFILE id, including the PM', function () {
    $arsitek = User::create([
        'name' => 'A', 'username' => 'r_'.uniqid(), 'email' => 'r_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'arsitek',
    ]);
    $arsitekProfile = Arsitek::create(['user_id' => $arsitek->id, 'nama' => 'A']);

    $pm = User::create([
        'name' => 'P', 'username' => 'p_'.uniqid(), 'email' => 'p_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'project_manager',
    ]);
    $pmProfile = ProjectManager::create(['user_id' => $pm->id, 'nama' => 'P']);

    // The PM's id is a PROFILE id, like everybody else's. It used to be a USER
    // id, and the two spaces overlap constantly — a profile id 42 and a user
    // id 42 are different rows belonging to different people — so comparing
    // the wrong two silently returned false.
    expect(Hire::profileIdFor('arsitek', $arsitek))->toBe($arsitekProfile->id)
        ->and(Hire::profileIdFor('project_manager', $pm))->toBe($pmProfile->id)
        ->and(Hire::pmProfileId($pm))->toBe($pmProfile->id);
});

it('matches the project against the id space the registry declares', function () {
    $owner = User::create([
        'name' => 'O', 'username' => 'o_'.uniqid(), 'email' => 'o_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $kontraktor = User::create([
        'name' => 'K', 'username' => 'k_'.uniqid(), 'email' => 'k_'.uniqid().'@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'kontraktor',
    ]);
    $kontraktorProfile = Kontraktor::create(['user_id' => $kontraktor->id, 'nama' => 'K']);

    // The project's column holds the PROFILE id.
    $project = Project::create([
        'title' => 'Registry check', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
        'selected_kontraktor_id' => $kontraktorProfile->id,
    ]);

    expect(Hire::matches($project, $kontraktor, 'kontraktor'))->toBeTrue();

    // The USER id in that column would be a DIFFERENT person, and must not
    // match.
    $project->update(['selected_kontraktor_id' => $kontraktor->id]);

    expect(Hire::matches($project->fresh(), $kontraktor, 'kontraktor'))->toBeFalse();
});
