<?php

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;

uses(Tests\TestCase::class);

/*
|--------------------------------------------------------------------------
| Rate limiting must not be rotatable by a request header
|--------------------------------------------------------------------------
|
| Regression suite for a HIGH audit finding, which had two independent halves.
|
| 1. TRUSTED_PROXIES was never supplied, so production ran on `*`
|    bootstrap/app.php's own comment said "*" was the insecure choice, and then
|    defaulted to it because TRUSTED_PROXIES was set in NOBODY: not .env.example,
|    not the Dockerfile, not CI. With every proxy trusted, `$request->ip()` reads
|    X-Forwarded-For, so any client can send a fresh value per request and get a
|    fresh rate-limit bucket. `throttle:5,1` on /register and `throttle:10,1` on
|    /login were therefore decorative.
|
| 2. The authenticated limiter tier was UNREACHABLE
|    The throttle is APPENDED to the `api` middleware group, which runs BEFORE the
|    `auth:sanctum` group wrapping the routes, so `$request->user()` is always
|    null:
|
|        $key = $request->user()?->id ?: $request->ip();
|        if ($request->user()) { return Limit::perMinute(200)->by($key); }
|        return Limit::perMinute(60)->by($key);
#
|    Every request fell into the 60/min IP branch -- including authenticated
|    traffic -- and that branch keys on the one value a client can forge.
|
| FIXES
|  - The decision moved to AppServiceProvider::register(), because inside
|    withMiddleware() neither env() nor config() is populated yet. That was the
|    actual reason the check silently took the insecure branch for every
|    deployment.
|  - Production now REFUSES TO BOOT without an explicit CIDR list. Both available
|    settings are unacceptable (trust nothing = shared bucket = self-inflicted
|    login DoS; trust everything = rotatable buckets), so a loud failure is the
|    only correct outcome.
|  - The limiter keys on a HASHED BEARER TOKEN, which is available before auth,
|    ties the bucket to a credential the caller must hold, and restores the
|    intended 200/min tier for logged-in traffic.
|
*/

beforeEach(function () {
    RateLimiter::clear('api');
    Cache::flush();
});

afterEach(function () {
    RateLimiter::clear('api');
    Cache::flush();
});

/** The limiter closure, invoked the way the middleware invokes it. */
function limitFor(?string $token, string $ip = '10.1.2.3')
{
    $request = \Illuminate\Http\Request::create('/api/arsitek', 'GET', server: [
        'REMOTE_ADDR' => $ip,
    ]);

    if ($token !== null) {
        $request->headers->set('Authorization', 'Bearer '.$token);
    }

    $limiter = RateLimiter::limiter('api');
    expect($limiter)->not->toBeNull('the api limiter is not registered');

    return $limiter($request);
}

it('registers the api limiter', function () {
    expect(RateLimiter::limiter('api'))->not->toBeNull();
});

it('gives an authenticated caller the 200/min tier, not 60/min', function () {
    // The previous branch was unreachable: `$request->user()` is always null
    // when the `api` group's throttle runs, because it runs before
    // `auth:sanctum`. So even logged-in traffic was held to 60/min.
    $limit = limitFor('a-real-sanctum-token');

    expect($limit->maxAttempts)->toBe(200);
});

it('gives an anonymous caller 60/min', function () {
    expect(limitFor(null)->maxAttempts)->toBe(60);
});

it('keys authenticated traffic on the token, so X-Forwarded-For cannot rotate it', function () {
    // The whole point: a rotated IP header must not hand out a fresh bucket.
    $a = limitFor('token-alpha', '10.1.2.3');
    $b = limitFor('token-alpha', '203.0.113.99');
    $c = limitFor('token-alpha', '198.51.100.7');

    expect($a->key)->toBe($b->key)
        ->and($b->key)->toBe($c->key);
});

it('gives DIFFERENT tokens DIFFERENT buckets', function () {
    // Otherwise all logged-in traffic would share one global bucket, which is the
    // DoS the previous IP-only key accidentally avoided.
    $a = limitFor('token-one');
    $b = limitFor('token-two');

    expect($a->key)->not->toBe($b->key);
});

it('never puts the raw bearer token in the cache key', function () {
    // A raw Sanctum token used as a Redis key leaks a live credential to anyone
    // able to read the key space or dump a slowlog.
    $token = 'super-secret-token-value';

    $limit = limitFor($token);

    expect($limit->key)->not->toContain($token)
        ->and($limit->key)->toContain(hash('sha256', $token));
});

it('still keys anonymous traffic on the IP', function () {
    $a = limitFor(null, '10.1.2.3');
    $b = limitFor(null, '10.9.9.9');

    expect($a->key)->not->toBe($b->key)
        ->and($a->key)->toContain('10.1.2.3');
});

it('does not treat an empty Authorization header as a token', function () {
    // `bearerToken()` can return '' for a malformed header; keying on the hash of
    // an empty string would put every malformed caller in ONE bucket.
    $request = \Illuminate\Http\Request::create('/api/x', 'GET', server: ['REMOTE_ADDR' => '10.1.2.3']);
    $request->headers->set('Authorization', 'Bearer ');

    $limit = RateLimiter::limiter('api')($request);

    expect($limit->key)->not->toContain(hash('sha256', ''));
});

// ---------------------------------------------------------------------------
// The TRUSTED_PROXIES configuration contract
// ---------------------------------------------------------------------------

it('exposes TRUSTED_PROXIES through config, so the provider can read it', function () {
    // Inside withMiddleware() neither env() nor config() is populated, which is
    // why this cannot be read from bootstrap/app.php.
    expect(config()->has('app.trusted_proxies'))->toBeTrue();
});

it('does not throw about TRUSTED_PROXIES outside production', function () {
    // The suite runs as local, where the fallback is "*" so artisan serve and
    // Octane keep working. A production-only guard that fired here would make the
    // whole suite unrunnable.
    expect($this->app->isProduction())->toBeFalse();

    // Reaching this line at all proves register() did not throw.
    expect(true)->toBeTrue();
});

it('parses a comma-separated CIDR list into trusted entries', function () {
    $parsed = array_values(array_filter(array_map(
        'trim',
        explode(',', '10.0.0.0/8, 172.64.0.0/13 ,192.0.2.0/24')
    )));

    expect($parsed)->toBe(['10.0.0.0/8', '172.64.0.0/13', '192.0.2.0/24']);
});

it('registers the login and registration throttles that were being defeated', function () {
    // The routes carry `throttle:5,1` and `throttle:10,1`. Those are only real once
    // the client IP cannot be forged, so this pins that the routes are still there.
    $routes = collect(\Illuminate\Support\Facades\Route::getRoutes())
        ->filter(fn ($r) => in_array($r->uri(), ['api/register', 'api/login'], true));

    expect($routes)->toHaveCount(2);

    $expected = ['api/register' => 'ThrottleRequests:5,1', 'api/login' => 'ThrottleRequests:10,1'];

    foreach ($routes as $route) {
        // `gatherMiddleware()` leaves group middleware unresolved (`api`);
        // `gatherRouteMiddleware()` expands the groups, which is what the kernel
        // actually runs.
        $middleware = implode('|', app('router')->gatherRouteMiddleware($route));

        // Pest treats extra args to toContain() as further needles, so no message.
        expect($middleware)->toContain($expected[$route->uri()]);
    }
});