<?php
/**
 * In-process API smoke test for the refinement pass.
 * Boots the Laravel kernel directly and dispatches synthetic requests,
 * avoiding the unstable PHP 8.5 Windows dev-server.
 *
 * Usage: C:\laragon\bin\php\php-8.5.7\php.exe refinement-tests\smoke-api.php
 */

// Local overrides BEFORE dotenv loads (real env vars are never overridden)
putenv('SESSION_DRIVER=file');
putenv('CACHE_STORE=file');
putenv('QUEUE_CONNECTION=sync');

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$pass = 0;
$fail = 0;

function check(string $name, bool $ok, string $extra = ''): void {
    global $pass, $fail;
    if ($ok) { $pass++; echo "PASS  {$name}" . ($extra ? " ({$extra})" : '') . "\n"; }
    else     { $fail++; echo "FAIL  {$name}" . ($extra ? " ({$extra})" : '') . "\n"; }
}

function dispatch($kernel, string $method, string $uri) {
    $req = Illuminate\Http\Request::create($uri, $method);
    $req->headers->set('Accept', 'application/json');
    try {
        return $kernel->handle($req);
    } catch (\Throwable $e) {
        echo "  [exception] {$uri}: " . substr($e->getMessage(), 0, 160) . "\n";
        return new Illuminate\Http\JsonResponse(['message' => 'exception'], 500);
    }
}

function codeOf($res): int {
    return method_exists($res, 'getStatusCode') ? $res->getStatusCode() : 500;
}

// 1. Public houses endpoint honors new filters (should be valid JSON array)
$res = dispatch($kernel, 'GET', '/api/houses?bedrooms=2&min_area=50&per_page=4');
$payload = json_decode($res->getContent(), true);
check('GET /api/houses returns 200', codeOf($res) === 200, 'status=' . codeOf($res));
check('GET /api/houses payload has data', isset($payload['data']));

// 2. Removed debug endpoint must not exist in the router
// (unmatched /api/* GETs fall through to the web.php SPA catch-all, so we
// assert against the route collection itself rather than the HTTP status)
$router = $app->make('router');
$stillRouted = false;
foreach ($router->getRoutes() as $route) {
    if (str_contains($route->uri(), 'jit-status') || str_contains($route->uri(), 'request-engineering-revision')) {
        $stillRouted = true;
    }
}
check('debug routes absent from router', !$stillRouted);

// 3. Public professional listing hides email on nested user
$res = dispatch($kernel, 'GET', '/api/arsitek');
$body = json_decode($res->getContent(), true);
$firstUser = is_array($body['data'] ?? null) ? ($body['data'][0]['user'] ?? null) : null;
check('GET /api/arsitek returns 200', codeOf($res) === 200, 'status=' . codeOf($res));
if (is_array($firstUser)) {
    check('public arsitek user hides email', !array_key_exists('email', $firstUser), 'keys=' . implode(',', array_slice(array_keys($firstUser), 0, 6)));
} else {
    check('public arsitek user hides email', false, 'no nested user in first row (empty table?)');
}

// 3b. C1 regression: KYC-grade file_portofolio path must never appear on
// anonymous directory payloads (npwp is stored under this same column).
$firstProfile = is_array($body['data'] ?? null) ? ($body['data'][0] ?? null) : null;
if (is_array($firstProfile)) {
    check(
        'public arsitek hides file_portofolio (KYC path)',
        !array_key_exists('file_portofolio', $firstProfile) && !array_key_exists('npwp', $firstProfile)
    );
} else {
    echo "SKIP  file_portofolio check (empty arsitek table)\n";
}

// 2b. Schedule update while UNAUTHENTICATED must be rejected with 401
$anySchedule = App\Models\ProjectSchedule::first();
if ($anySchedule) {
    $req = Illuminate\Http\Request::create("/api/projects/{$anySchedule->project_id}/schedules/{$anySchedule->id}", 'PUT');
    $req->headers->set('Accept', 'application/json');
    $res = $kernel->handle($req);
    check('schedule update unauthenticated -> 401', codeOf($res) === 401, 'status=' . codeOf($res));
} else {
    echo "SKIP  unauth schedule check (no schedules in DB)\n";
}

// 4. Authenticated unread summary + vault + schedule authorization
$user = App\Models\User::where('email', 'admin@4c.id')->first() ?: App\Models\User::first();
if ($user) {
    Illuminate\Support\Facades\Auth::login($user);

    $res = dispatch($kernel, 'GET', '/api/me/unread-summary');
    $body = json_decode($res->getContent(), true);
    check('GET /api/me/unread-summary 200', codeOf($res) === 200, 'status=' . codeOf($res));
    check(
        'unread summary shape',
        isset($body['unread_messages'], $body['unread_notifications']),
        'keys=' . implode(',', array_keys(is_array($body) ? $body : []))
    );

    // Vault index must be blocked for a non-participant
    $foreignProject = App\Models\Project::where('user_id', '!=', $user->id)->first();
    if ($foreignProject) {
        $res = dispatch($kernel, 'GET', "/api/projects/{$foreignProject->id}/documents");
        check(
            'vault index blocked for non-participant',
            codeOf($res) === 403,
            "project={$foreignProject->id} status=" . codeOf($res)
        );
    } else {
        echo "SKIP  vault index check (no foreign project in DB)\n";
    }

    // Schedule update as authenticated NON-participant must be 403
    if ($anySchedule) {
        $proj = App\Models\Project::find($anySchedule->project_id);
        $owned = $proj && ((int)$proj->pm_id === (int)$user->id || (int)$proj->user_id === (int)$user->id);
        if (!$owned) {
            $res = dispatch($kernel, 'PUT', "/api/projects/{$anySchedule->project_id}/schedules/{$anySchedule->id}");
            check('schedule update blocked for authenticated outsider -> 403', codeOf($res) === 403, 'status=' . codeOf($res));
        } else {
            echo "NOTE  schedule belongs to test user; outsider case covered by vault check\n";
        }
    }

    try { Illuminate\Support\Facades\Auth::logout(); } catch (\Throwable) {}
} else {
    echo "SKIP  authenticated checks (no users in DB)\n";
}

echo "\nRESULT: {$pass} passed, {$fail} failed\n";
exit($fail > 0 ? 1 : 0);


