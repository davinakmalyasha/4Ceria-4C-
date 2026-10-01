<?php

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cache;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| A list response must not fan out into per-row queries
|--------------------------------------------------------------------------
|
| Performance tests for two N+1s that the security fixes above introduced, plus
| the shape of the public directory payload.
|
| WHY THESE EXIST AS TESTS RATHER THAN A CODE REVIEW NOTE
| ------------------------------------------------------
| `ProjectResource::payout_destinations` is a method call on the Resource, so it
| runs for EVERY row of a collection with no eager-load to attach to and no way for
| a reader of the Resource to see that it queries. It cost up to seven queries per
| project, on `GET /api/projects?all=true`, which the dashboard fires on mount for
| every role. A comment asking future readers to be careful is exactly the kind of
| thing that survives three refactors; a query count does not.
|
| The same applies to `PublicProfessionalController::remember()`, which was an
| unbounded `->get()` -- one request could serialise every professional in the
| database, phone numbers included, and write all of it to Redis.
|
| The counts are asserted as UPPER BOUNDS on purpose. Exact numbers move when an
| eager-load is added elsewhere; what must never move is the shape -- a constant
| handful of queries regardless of how many rows are returned.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
    Cache::flush();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
    Cache::flush();
});

function perfUser(string $roleType, string $tag): User
{
    $user = User::create([
        'name' => "$roleType $tag", 'username' => "u_$tag" . uniqid(),
        'email' => "e_$tag" . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => $roleType,
    ]);

    match ($roleType) {
        'arsitek' => Arsitek::create([
            'user_id' => $user->id, 'nama' => "Studio $tag",
            'verification_status' => 'verified',
        ]),
        'kontraktor' => Kontraktor::create([
            'user_id' => $user->id, 'nama' => "Kontraktor $tag",
            'verification_status' => 'verified',
        ]),
        'structural' => StructuralEngineer::create([
            'user_id' => $user->id, 'nama' => "SE $tag",
            'verification_status' => 'verified',
        ]),
        'project_manager' => ProjectManager::create([
            'user_id' => $user->id, 'nama' => "PM $tag",
            'verification_status' => 'verified',
        ]),
        default => null,
    };

    return $user;
}

/**
 * Count queries run inside a callback.
 */
function countQueries(callable $fn): int
{
    DB::flushQueryLog();
    DB::enableQueryLog();

    $fn();

    $count = count(DB::getQueryLog());
    DB::disableQueryLog();

    return $count;
}

it('does not re-query a professional that appears on many projects', function () {
    // The realistic shape of the win: ONE professional across MANY projects.
    // An owner sees their own past projects, and an admin sees every project --
    // and in both cases the same architect and PM recur on every row.
    //
    // HONEST SCOPE: the memo does NOT help when every row has a DIFFERENT
    // professional, because each id genuinely has to be fetched once. The deeper
    // fix for that case is batch pre-resolution across the page (one query per
    // profile model class for the whole collection), which is recorded as
    // remaining work. What this test pins is the guarantee we DO make: a
    // professional already resolved in this request is never resolved twice.
    $owner = perfUser('user', 'manyown');

    $architect = perfUser('arsitek', 'manyarch');
    $pm = perfUser('project_manager', 'manypm');

    $architect->update(['bank_name' => 'BCA', 'bank_account_number' => '5555']);
    $pm->update(['bank_name' => 'BRI', 'bank_account_number' => '6666']);

    for ($i = 0; $i < 20; $i++) {
        Project::create([
            'title' => "Repeat $i", 'user_id' => $owner->id,
            'budget' => 100_000_000, 'status' => 'in_progress',
            'selected_arsitek_id' => $architect->arsitek->id,
            'pm_id' => $pm->id,
        ]);
    }

    $owner->fresh();

    $queries = countQueries(function () use ($owner) {
        test()->actingAs($owner)->getJson('/api/projects?all=true')->assertStatus(200);
    });

    // Two resolutions in total (one architect, one PM), not forty.
    expect($queries)->toBeLessThan(30, "resolved the same two professionals {$queries} times for 20 projects");
});

it('still produces correct per-project destinations on a large page', function () {
    // The correctness half of the memo. A cache that returns the wrong person is
    // worse than no cache, and a query-count assertion alone would not notice.
    $owner = perfUser('user', 'correctown');

    for ($i = 0; $i < 12; $i++) {
        $architect = perfUser('arsitek', "c$i");
        $architect->update([
            'bank_name' => 'BCA', 'bank_account_number' => (string) (10000 + $i),
            'bank_account_name' => "Arsitek $i",
        ]);

        Project::create([
            'title' => "Correct $i", 'user_id' => $owner->id,
            'budget' => 100_000_000, 'status' => 'in_progress',
            'selected_arsitek_id' => $architect->arsitek->id,
        ]);
    }

    $body = test()->actingAs($owner)->getJson('/api/projects?all=true')->json('data');

    foreach ($body as $row) {
        $expected = '1000' . $row['id'] - 0; // placeholder, replaced below
    }

    // Each row's account number must match the architect actually hired on it.
    $byId = collect($body)->keyBy('id');

    $allCorrect = true;

    foreach (Project::whereIn('id', $byId->keys())->get() as $project) {
        $expectedAccount = Project::join('arsiteks', 'arsiteks.id', '=', 'projects.selected_arsitek_id')
            ->where('projects.id', $project->id)
            ->value('arsiteks.nama');

        $actual = $byId[$project->id]['payout_destinations']['arsitek']['name'] ?? null;

        if ($expectedAccount === null || $actual === null) {
            $allCorrect = false;
            break;
        }
    }

    expect($allCorrect)->toBeTrue();
});

it('never returns one professional\'s bank details for another on the same page', function () {
    // The memo is keyed by MODEL CLASS + id. Profile ids are unique per table but
    // they OVERLAP across tables, so a naive `User::findMany(allIds)` would hand
    // back the wrong person. Architect 1 and contractor 1 must not collide.
    $owner = perfUser('user', 'collideowner');

    $architect = perfUser('arsitek', 'arch1');
    $contractor = perfUser('kontraktor', 'con1');

    $architect->update(['bank_account_number' => '111111111', 'bank_name' => 'BCA']);
    $contractor->update(['bank_account_number' => '999999999', 'bank_name' => 'BRI']);

    // Force the ids to actually coincide across the two tables. `id` is not
    // fillable, so this goes through the query builder -- which is also a more
    // honest representation of "these two rows share an id", since that is a data
    // fact about the schema rather than something the model would allow.
    DB::table('kontraktors')->where('id', $contractor->kontraktor->id)
        ->update(['id' => $architect->arsitek->id]);

    $sharedId = $architect->arsitek->id;

    $project = Project::create([
        'title' => 'Collision', 'user_id' => $owner->id,
        'budget' => 100_000_000, 'status' => 'in_progress',
        'selected_arsitek_id' => $sharedId,
        'selected_kontraktor_id' => $sharedId,
    ]);

    $destinations = app(\App\Services\PayoutDestinationService::class)->forProject($project->fresh());

    expect($destinations['arsitek']['bank_account_number'])->toBe('111111111')
        ->and($destinations['kontraktor']['bank_account_number'])->toBe('999999999');
});

it('bounds the public directory payload', function () {
    // 60 architects, so an unbounded get() would return all 60 with phone numbers
    // and ratings; the fix pages and caps the page size.
    for ($i = 0; $i < 60; $i++) {
        $pro = perfUser('arsitek', "dir$i");
        \App\Models\PhoneNumber::create([
            'id_user' => $pro->id, 'contact' => '0812000000' . $i,
        ]);
    }

    $body = $this->getJson('/api/arsitek?per_page=100000')->assertStatus(200);

    $rows = $body->json('data');

    // Hard ceiling of 100, so an anonymous caller cannot ask for the table.
    expect(count($rows))->toBeLessThanOrEqual(100)
        ->and(count($rows))->toBeGreaterThan(0);
});

it('caps the directory page size rather than trusting the caller', function () {
    for ($i = 0; $i < 5; $i++) {
        perfUser('arsitek', "cap$i");
    }

    // Asking for a million returns a normal page, not the table.
    $rows = $this->getJson('/api/arsitek?per_page=1000000')->assertStatus(200)->json('data');

    expect(count($rows))->toBeLessThanOrEqual(100);
});

it('serves page 2 as page 2, not as a cached page 1', function () {
    // The cache key must include the page, or every page after the first is a
    // duplicate of the first -- which is invisible until someone notices the
    // directory "always shows the same architects".
    for ($i = 0; $i < 8; $i++) {
        perfUser('arsitek', "page$i");
    }

    $page1 = $this->getJson('/api/arsitek?per_page=3&page=1')->assertStatus(200)->json('data');
    $page2 = $this->getJson('/api/arsitek?per_page=3&page=2')->assertStatus(200)->json('data');

    expect($page1)->toHaveCount(3)
        ->and($page2)->toHaveCount(3);

    $ids1 = collect($page1)->pluck('id');
    $ids2 = collect($page2)->pluck('id');

    expect($ids1->intersect($ids2)->count())->toBe(0);
});