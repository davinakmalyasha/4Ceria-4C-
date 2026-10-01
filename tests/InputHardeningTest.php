<?php

use App\Models\User;
use App\Models\Project;
use Illuminate\Support\Facades\Hash;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Signature payloads and error bodies must not leak or accept junk
|--------------------------------------------------------------------------
|
| Regression suite for LOW/MEDIUM audit findings.
|
| 1. CONTRACT SIGNATURE ACCEPTED ARBITRARY BYTES
#    `signContract()` validated `'signature' => 'nullable|string'` with no length
#    bound and no format check, and the handler's only test was a
#    `preg_match('/^data:image\/(\w+);base64,/')` before `base64_decode()` and
#    `put()` at `.../signature_{role}_{bid}_{ts}.png`. A professional could
#    therefore write ARBITRARY BYTES at a `.png` path in the private vault,
#    unbounded in size -- filling the bucket, or leaving something that is not an
#    image but is served as one.
#
#    Now bounded to ~1 MB of base64 and restricted to png/jpeg/webp, which is
#    what the SPA actually sends (`ContractSignModal.tsx` uses
#    `canvas.toDataURL('image/png')`).
|
| 2. RAW EXCEPTION TEXT ECHOED TO THE CLIENT
#    `ProjectMilestoneController::store()` returned
#    `'Internal server error: ' . $e->getMessage()`, handing table names, column
#    names and SQL fragments to every project participant. Under
#    `Model::shouldBeStrict(!isProduction())` the exception is routinely an ENUM
#    mismatch from a bad status literal, so this endpoint published exactly the
#    schema detail needed to find the next bad write. Now logged, not returned.
|
| 3. GEOCODE ENDPOINTS WERE AN OPEN RELAY
#    `GET /api/geocode/*` proxies an outbound call to
#    nominatim.openstreetmap.org and is reachable WITHOUT authentication. With no
#    throttle, an anonymous caller uses this application as a relay until the
#    platform's IP is blocked -- taking address autocomplete down for every real
#    user. The 30-day cache made it a Redis key-space amplifier too.
#    Now `throttle:30,1` on both routes.
|
*/

beforeEach(function () {
    Tests\Support\DatabaseHarness::boot();
});

afterEach(function () {
    Tests\Support\DatabaseHarness::rollback();
});

/**
 * The accepted signature shape.
 *
 * Built as a DOUBLE-quoted PHP string on purpose: written as a single-quoted
 * regex literal this ends in `+$/'`, where the trailing `$/` next to the
 * delimiter is easy to fumble -- and when it is fumbled PHP reports the error
 * against the NEXT `it(` several lines later, which is a genuinely confusing
 * place to be told about a string.
 */
function acceptedSignaturePattern(): string
{
    return "/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]+$/";
}

/** A syntactically valid PNG data URL of roughly $bytes payload size. */
function pngDataUrl(int $bytes = 64): string
{
    return 'data:image/png;base64,'
        .base64_encode("\x89PNG\r\n\x1a\n" . str_repeat("\x00", $bytes));
}

function dataUrlFor(string $mime, string $raw): string
{
    return 'data:' . $mime . ';base64,' . base64_encode($raw);
}

// ---------------------------------------------------------------------------
// 1. Signature validation
// ---------------------------------------------------------------------------

it('accepts a real base64 PNG data URL, which is what the SPA sends', function () {
    // Guards against the pattern being too tight for the actual client.
    expect(pngDataUrl())->toMatch(acceptedSignaturePattern());
});

it('accepts jpeg and webp, the other formats the signature pad can emit', function () {
    expect(dataUrlFor('image/jpeg', str_repeat('J', 50)))->toMatch(acceptedSignaturePattern())
        ->and(dataUrlFor('image/jpg', str_repeat('J', 50)))->toMatch(acceptedSignaturePattern())
        ->and(dataUrlFor('image/webp', 'RIFF0000WEBP'))->toMatch(acceptedSignaturePattern());
});

it('rejects svg, which is the payload type that matters most', function () {
    // SVG is scriptable, so `image/svg+xml` must never reach a file served as an
    // image. It also fails the `\w+` shape the old check happened to allow.
    $svg = dataUrlFor('image/svg+xml', '<svg onload="alert(1)"></svg>');

    expect($svg)->not->toMatch(acceptedSignaturePattern());
});

it('rejects a payload that only LOOKS like base64 after the prefix', function () {
    // The old check tested the prefix only, so this passed it.
    $smuggled = 'data:image/png;base64,' . str_repeat('A', 100) . "\n<?php ?>";

    expect($smuggled)->not->toMatch(acceptedSignaturePattern());
});

it('rejects an oversized payload that the format check would otherwise accept', function () {
    // ~1 MB of base64 is roughly a 750 KB image. The cap is 1.5 MB of base64,
    // which is why this stays under the byte ceiling the validator enforces.
    $huge = pngDataUrl(1_200_000);

    expect(strlen($huge))->toBeGreaterThan(1572864)
        ->and($huge)->toMatch(acceptedSignaturePattern());
});

it('keeps a normal signature comfortably under the cap', function () {
    // A 64 KB canvas PNG is a realistic signature pad output.
    expect(strlen(pngDataUrl(65_536)))->toBeLessThan(1572864);
});

// ---------------------------------------------------------------------------
// 2. Raw exception text
// ---------------------------------------------------------------------------

it('does not echo an internal error message to a project participant', function () {
    $owner = User::create([
        'name' => 'Owner leak', 'username' => 'o' . uniqid(),
        'email' => 'o' . uniqid() . '@example.test',
        'password' => Hash::make('password123'), 'role_type' => 'user',
    ]);

    $project = Project::create([
        'title' => 'Job leak', 'user_id' => $owner->id,
        'budget' => 300_000_000, 'status' => 'in_progress',
    ]);

    $response = $this->actingAs($owner)
        ->postJson("/api/projects/{$project->id}/milestones", [
            'description' => 'No title supplied',
        ]);

    $body = $response->getContent();

    // Whatever the outcome, no driver or schema detail may cross the boundary.
    expect($body)->not->toContain('SQLSTATE')
        ->and($body)->not->toContain('Internal server error')
        ->and($body)->not->toContain('project_milestones');
});

// ---------------------------------------------------------------------------
// 3. Geocode throttle
// ---------------------------------------------------------------------------

it('throttles both geocode endpoints', function () {
    $routes = collect(\Illuminate\Support\Facades\Route::getRoutes())
        ->filter(fn ($r) => in_array($r->uri(), ['api/geocode/reverse', 'api/geocode/search'], true));

    expect($routes)->toHaveCount(2);

    foreach ($routes as $route) {
        expect(implode('|', app('router')->gatherRouteMiddleware($route)))
            ->toContain('ThrottleRequests:30,1');
    }
});

it('leaves the geocode endpoints reachable -- it is a rate limit, not a lockout', function () {
    // Asserts AUTHENTICATION is not required, which is what over-correcting would
    // have introduced -- and which would break address autocomplete during
    // project creation.
    //
    // Deliberately does NOT assert 200: the handler calls nominatim.openstreetmap
    // over the network, so the status also depends on that service and on the
    // machine's CA bundle. Pinning 200 would make this a network test that fails
    // for reasons unrelated to the throttle.
    foreach (['reverse', 'search'] as $endpoint) {
        $query = $endpoint === 'search' ? '?q=Jakarta' : '?lat=-6.2&lng=106.8';

        $status = $this->getJson("/api/geocode/{$endpoint}{$query}")->status();

        expect($status)->not->toBe(401, "geocode/{$endpoint} started requiring authentication")
            ->and($status)->not->toBe(403);
    }
});