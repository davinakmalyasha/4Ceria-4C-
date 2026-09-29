<?php

use App\Models\Arsitek;
use App\Models\House;
use App\Models\Project;
use App\Models\ProjectSchedule;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| API surface smoke test
|--------------------------------------------------------------------------
| Replaces the bespoke `refinement-tests/smoke-api.php` script, which was
| wired into CI but COULD NOT PASS there: it read rows out of the live tables
| and hard-failed ("no nested user in first row (empty table?)") because the
| API job migrated the database and never seeded it. It also held no
| transaction, called `Auth::login()` on a real user, and reported pass/fail
| through its own exit code rather than the test runner.
|
| Everything asserted here is now self-fixturing inside a rolled-back
| transaction, so the suite is meaningful on an EMPTY database as well as on a
| developer's seeded one. The assertions themselves are the same ones the
| script made — they were good; only the harness was wrong.
|
| SAFETY MODEL: identical to the money suites — real MySQL (the legacy
| migrations contain raw ALTER/ENUM statements sqlite cannot run), DML only,
| always rolled back. See tests/Support/DatabaseHarness.php.
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();

    // The public directories and the house list are served from a 600s cache
    // (`PublicProfessionalController`, `HouseController::booted`). Without a
    // flush, one test's fixtures leak into the next and the assertions below
    // silently pass against a stale payload.
    Cache::flush();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
    Cache::flush();
});

function smokeUser(string $suffix, string $role = 'user'): User
{
    return User::create([
        'name' => "Smoke {$suffix}",
        'username' => 'smoke_' . $suffix . '_' . uniqid(),
        'email' => 'smoke_' . $suffix . '_' . uniqid() . '@example.test',
        'password' => Hash::make('password123'),
        'role_type' => $role,
    ]);
}

function smokeArsitek(string $suffix): Arsitek
{
    $user = smokeUser($suffix, 'arsitek');

    return Arsitek::create([
        'user_id' => $user->id,
        'nama' => "Arsitek {$suffix}",
        'no_telp' => '081200000000',
        // Deliberately populated: every one of these must be absent from the
        // public payload, so a test that leaves them null proves nothing.
        'npwp' => '09.254.294.3-407.000',
        'npwp_number' => '092542943407000',
        'file_portofolio' => 'portofolio/ktp-scan.pdf',
        'identity_number' => '3201234567890001',
        'verification_status' => 'verified',
    ]);
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

it('serves the public house explorer with its filters applied', function () {
    $owner = smokeUser('houseowner');

    House::create([
        'name' => 'Rumah uji coba',
        'price' => 750_000_000,
        'house_desc' => 'Rumah untuk smoke test.',
        'width' => '10',
        'length' => '12',
        'br' => 2,
        'ba' => 1,
        'floors' => 1,
        'coordinate' => '-6.200000,106.816666',
        'id_user' => $owner->id,
    ]);

    $this->getJson('/api/houses?bedrooms=2&min_area=50&per_page=4')
        ->assertOk()
        ->assertJsonStructure(['data']);
});

it('serves the public professional directory and strips KYC-grade fields', function () {
    smokeArsitek('pub');

    $response = $this->getJson('/api/arsitek')->assertOk();

    $rows = $response->json('data');
    expect($rows)->toBeArray()->not->toBeEmpty();

    $row = collect($rows)->firstWhere('nama', 'like', 'Arsitek pub%') ?? $rows[0];

    // C1 regression: the nested user object must never leak auth material.
    $user = $row['user'] ?? [];
    expect($user)->toBeArray();
    expect($user)->not->toHaveKey('email');
    expect($user)->not->toHaveKey('bank_account_number');
    expect($user)->not->toHaveKey('bank_name');
    expect($user)->not->toHaveKey('two_factor_secret');

    // Government identity numbers + private-bucket KYC document paths.
    // `file_portofolio` is KYC-grade: several verification flows store the
    // KTP/ID scan in that column and it shares its path with `npwp`.
    foreach (['file_portofolio', 'file_sertifikat', 'npwp', 'npwp_number', 'siup', 'siup_number', 'identity_number', 'verification_status'] as $forbidden) {
        expect($row)->not->toHaveKey($forbidden);
    }
});

// ---------------------------------------------------------------------------
// Router hygiene
// ---------------------------------------------------------------------------

it('does not route removed debug endpoints', function () {
    // Unmatched /api/* GETs fall through to the web.php SPA catch-all and come
    // back as HTML 200, so this is asserted against the route collection
    // rather than the HTTP status.
    $removed = ['jit-status', 'request-engineering-revision'];

    foreach (app('router')->getRoutes() as $route) {
        foreach ($removed as $needle) {
            expect($route->uri())->not->toContain($needle);
        }
    }
});

it('renders JSON (not the SPA shell) for unmatched /api routes', function () {
    // Trap #7. `bootstrap/app.php::shouldRenderJsonWhen` only fixes the
    // EXCEPTION path — a path that matches no api route at all was still
    // swallowed by the web.php catch-all and answered 200 text/html, so the
    // SPA could not tell "typo'd/renamed endpoint" from "success".
    $response = $this->getJson('/api/definitely-not-a-real-endpoint')->assertNotFound();

    expect($response->headers->get('content-type'))->toContain('application/json');
    expect($response->json())->toHaveKey('message');

    // The SPA shell must still answer genuine deep links.
    $this->get('/definitely-not-an-spa-route')->assertOk();
});

// ---------------------------------------------------------------------------
// Auth gates — these need no fixtures beyond the request itself
// ---------------------------------------------------------------------------

it('rejects anonymous callers on every authenticated-only surface', function (string $method, string $uri) {
    $this->json($method, $uri)->assertUnauthorized();
})->with([
    'favorites index' => ['GET', '/api/favorites'],
    'push public key' => ['GET', '/api/push/public-key'],
    'active projects' => ['GET', '/api/user/active-projects'],
    'unread summary' => ['GET', '/api/me/unread-summary'],
]);

it('rejects anonymous callers on per-project mutation routes', function () {
    $project = Project::create([
        'title' => 'Anonymous probe',
        'user_id' => smokeUser('anon')->id,
        'budget' => 10_000_000,
    ]);

    $this->putJson("/api/projects/{$project->id}")->assertUnauthorized();
    $this->postJson("/api/projects/{$project->id}/documents")->assertUnauthorized();
    $this->postJson("/api/projects/{$project->id}/budget/transactions")->assertUnauthorized();
});

// ---------------------------------------------------------------------------
// Authorization — a logged-in outsider must not reach a participant surface
// ---------------------------------------------------------------------------

it('blocks the document vault for a logged-in non-participant', function () {
    $owner = smokeUser('vaultowner');
    $outsider = smokeUser('vaultoutsider');
    $project = Project::create([
        'title' => 'Vault isolation',
        'user_id' => $owner->id,
        'budget' => 50_000_000,
    ]);

    $this->actingAs($outsider, 'sanctum')
        ->getJson("/api/projects/{$project->id}/documents")
        ->assertForbidden();
});

it('blocks schedule mutation for an authenticated non-participant', function () {
    $owner = smokeUser('schedowner');
    $outsider = smokeUser('schedoutsider');
    $project = Project::create([
        'title' => 'Schedule isolation',
        'user_id' => $owner->id,
        'budget' => 50_000_000,
    ]);

    $schedule = ProjectSchedule::create([
        'project_id' => $project->id,
        'phase_slug' => 'construction',
        'target_start_date' => now()->addWeek()->toDateString(),
        'target_end_date' => now()->addWeeks(3)->toDateString(),
        'progress_percentage' => 0,
        'status' => 'planned',
    ]);

    $this->actingAs($outsider, 'sanctum')
        ->putJson("/api/projects/{$project->id}/schedules/{$schedule->id}", [
            'progress_percentage' => 100,
        ])
        ->assertForbidden();
});

// ---------------------------------------------------------------------------
// Authenticated happy paths — shape only, the behaviour suites own semantics
// ---------------------------------------------------------------------------

it('returns the unread heartbeat shape for an authenticated user', function () {
    $this->actingAs(smokeUser('unread'), 'sanctum')
        ->getJson('/api/me/unread-summary')
        ->assertOk()
        ->assertJsonStructure(['unread_messages', 'unread_notifications']);
});

it('returns the favorites envelope for an authenticated user', function () {
    $this->actingAs(smokeUser('fav'), 'sanctum')
        ->getJson('/api/favorites')
        ->assertOk()
        ->assertJsonStructure(['items']);
});

it('returns the VAPID public key, or 501 when the trio is not configured', function () {
    // Web push shipped code-complete but the VAPID keys are owner-supplied
    // (see docs/BACKLOG.md B2), so both answers are correct — only a 500 or a
    // crash would be a defect.
    $status = $this->actingAs(smokeUser('push'), 'sanctum')
        ->getJson('/api/push/public-key')
        ->getStatusCode();

    expect($status)->toBeIn([200, 501]);
});

it('authenticates a valid user and rejects a wrong password', function () {
    $user = smokeUser('login');
    $user->email = 'smoke.login@example.test';
    $user->save();

    $this->postJson('/api/login', [
        'email' => 'smoke.login@example.test',
        'password' => 'password123',
    ])->assertOk();

    expect($this->postJson('/api/login', [
        'email' => 'smoke.login@example.test',
        'password' => 'definitely-wrong',
    ])->getStatusCode())->toBeIn([401, 422]);
});
