<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use Symfony\Component\Process\Process;

/**
 * Exports the API route table to `routing/routes.yaml`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The rewrite has to move 297 API endpoints from Laravel to Go without losing
 * one, and "without losing one" is not something a person can check by
 * reading. It has to be a FILE that three programs read:
 *
 *   - the Go router, which registers its handlers against it;
 *   - the parity gate (`tools/parity/routes.mjs`), which compares it against
 *     BOTH the Laravel route table and the Go route table;
 *   - the golden-file capture, which enumerates the endpoints to capture.
 *
 * The manifest is GENERATED, never edited. A hand-edited manifest would
 * immediately disagree with the code, and the gate would fail for a reason
 * that has nothing to do with the port.
 *
 * The YAML is written by a small emitter rather than a library because
 * `symfony/yaml` is not a dependency, and the structure is fixed and small
 * enough that an emitter is less code than the alternative is risk.
 *
 * USAGE
 *   php artisan routes:export
 *   php artisan routes:export --path=routing/routes.yaml
 */
class ExportRouteManifestCommand extends Command
{
    protected $signature = 'routes:export
        {--path=routing/routes.yaml : Where to write the manifest}
        {--check : Compare the manifest with the current route table and fail if they differ}';

    protected $description = 'Export the API route table to the shared manifest';

    /**
     * The areas whose rewrite may change field names (REWRITE-PLAN §5.2).
     *
     * @var list<string>
     */
    private const TIER_3_AREAS = [
        'arsitek', 'kontraktor', 'notaris', 'interior', 'project-manager',
        'structural-engineers', 'mep-engineers', 'suppliers',
        'marketplace', 'houses', 'rooms', 'questions', 'portfolios',
        'contractor-subspecialties',
        'conversations', 'notifications', 'notification-preferences',
        'consultations', 'push',
    ];

    /**
     * The areas that move money or grant access: byte-identical or not at all.
     *
     * @var list<string>
     */
    private const TIER_1_AREAS = [
        'bids', 'my-bids', 'hire-history',
        'material-orders', 'material-quotes', 'delivery-jobs',
        'logistics', 'merchant', 'verifications',
        'login', 'register', 'logout', 'forgot-password', 'reset-password',
    ];

    /**
     * Path segments, anywhere in the URI, that make an endpoint tier 1.
     *
     * These are the money and contract paths under `/projects/{project}/…`,
     * which is where 169 of the 296 endpoints live.
     *
     * @var list<string>
     */
    private const TIER_1_KEYWORDS = [
        'budget', 'payments', 'payment', 'termins', 'termin',
        'disputes', 'dispute', 'addendums', 'addendum',
        'change-orders', 'change-order', 'change_order',
        'refund', 'retention', 'escrow', 'proof',
        'contract', 'sign', 'termination', 'terminate', 'handover',
    ];

    public function handle(): int
    {
        $path = base_path($this->option('path'));

        $routes = $this->apiRoutes();

        $manifest = [
            'meta' => $this->meta($routes),
            'routes' => array_map(fn (Route $route) => $this->entry($route), $routes),
        ];

        $yaml = $this->toYaml($manifest);

        if ($this->option('check')) {
            if (! is_file($path)) {
                $this->error("The manifest does not exist: {$path}");

                return self::FAILURE;
            }

            $current = (string) file_get_contents($path);

            // The TIMESTAMP is normalised away before the comparison.
            //
            // `generated_at` changes on every run, so comparing the bytes
            // would report "out of date" every single time and the check
            // would be a gate that could never pass. What matters is whether
            // the ROUTES changed.
            $normalise = static fn (string $text): string => (string) preg_replace(
                "/^(\s*'generated_at':).*$/m",
                '$1 <timestamp>',
                $text,
            );

            if ($normalise($current) !== $normalise($yaml)) {
                $this->error('The manifest is out of date. Run: php artisan routes:export');

                return self::FAILURE;
            }

            $this->info('The manifest is up to date.');

            return self::SUCCESS;
        }

        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }

        file_put_contents($path, $yaml);

        $this->info(sprintf(
            'Wrote %d API routes to %s',
            count($routes),
            $this->relative($path),
        ));

        return self::SUCCESS;
    }

    /**
     * Every API route, in a stable order.
     *
     * @return list<Route>
     */
    private function apiRoutes(): array
    {
        $routes = [];

        foreach (RouteFacade::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/')) {
                continue;
            }

            // The SPA CATCH-ALL is not an API endpoint.
            //
            // `routes/web.php` declares `Route::any('/api/{any}', ...)` so that
            // an unmatched `/api/*` path answers with a JSON 404 instead of the
            // SPA's HTML. It is in the `web` middleware group, it is a
            // closure rather than a controller, and there is nothing to port
            // for it: the Go gateway answers an unmatched API path the same
            // way, and that is a property of the router, not an endpoint.
            //
            // Every real API route is in the `api` middleware group.
            if (in_array('web', (array) $route->gatherMiddleware(), true)) {
                continue;
            }

            $routes[] = $route;
        }

        // The order must be STABLE, or the manifest churns on every export
        // and the diff becomes noise. The URI and the method are the
        // natural order for a route table, and neither changes when a
        // controller is refactored.
        usort($routes, function (Route $a, Route $b) {
            $byUri = strcmp($a->uri(), $b->uri());

            if ($byUri !== 0) {
                return $byUri;
            }

            return strcmp(implode(',', $this->methods($a)), implode(',', $this->methods($b)));
        });

        return $routes;
    }

    /**
     * @return array<string, mixed>
     */
    private function meta(array $routes): array
    {
        $public = 0;
        $admin = 0;

        foreach ($routes as $route) {
            $middleware = $this->middleware($route);

            if (! $this->requiresAuth($middleware)) {
                $public++;
            }

            if ($this->requiresAdmin($middleware)) {
                $admin++;
            }
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'laravel_commit' => $this->gitCommit(),
            'api_route_count' => count($routes),
            'public_route_count' => $public,
            'admin_route_count' => $admin,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function entry(Route $route): array
    {
        $middleware = $this->middleware($route);

        $uri = $route->uri();
        $auth = $this->requiresAdmin($middleware)
            ? 'admin'
            : ($this->requiresAuth($middleware) ? 'authenticated' : 'public');

        return [
            'id' => $this->identifier($route),
            'methods' => $this->methods($route),
            'uri' => $uri,
            'auth' => $auth,
            'throttle' => $this->throttle($middleware),

            // THE PARITY CONTRACT OF THIS ENDPOINT (REWRITE-PLAN §5.2).
            //
            // `tier` is how STRONGLY the Go response must match: 1 is
            // byte-identical including the side-effect rows, 2 is
            // shape-identical, 3 is compatible. `upstream` is which stack
            // serves it in production, and every endpoint starts on Laravel.
            //
            // Both are generated rather than hand-written because the matrix
            // (`docs/PARITY.md`) is generated from them, and a hand-written
            // tier is a promise nobody can check.
            'tier' => $this->tier($uri, $auth),
            'upstream' => 'laravel',
            'laravel' => [
                'action' => $route->getActionName(),
                'middleware' => $middleware,
            ],
        ];
    }

    /**
     * The parity tier of an endpoint.
     *
     * The classification is by AREA, not by opinion: the plan assigns a tier
     * to each domain, and this function restates that assignment as code so
     * that adding an endpoint cannot silently leave it at the default.
     *
     *   TIER 3 — public directories, chat, notifications. The rewrite may
     *            change field names here; the matching is semantic.
     *   TIER 1 — money, auth, disputes, contracts, admin. These move rupiah
     *            or grant access, and "the same values" is not good enough:
     *            the status, every key, every type AND the side-effect rows
     *            must be identical.
     *   TIER 2 — everything else: CRUD, lifecycle, marketplace.
     *
     * TIER 3 IS TESTED FIRST. `contractor-subspecialties` contains the word
     * "contract", and classifying it as tier 1 because of a substring would
     * make the matrix claim a strength nobody verified.
     */
    private function tier(string $uri, string $auth): int
    {
        $segments = array_values(array_filter(explode('/', $uri), static fn (string $s): bool => $s !== ''));

        // The first segment after `api`.
        $area = $segments[1] ?? '';

        if (in_array($area, self::TIER_3_AREAS, true)) {
            return 3;
        }

        if ($auth === 'admin') {
            return 1;
        }

        if (in_array($area, self::TIER_1_AREAS, true)) {
            return 1;
        }

        foreach ($segments as $segment) {
            if (in_array($segment, self::TIER_1_KEYWORDS, true)) {
                return 1;
            }
        }

        return 2;
    }

    /**
     * A stable identifier for the endpoint.
     *
     * The Laravel route NAME when there is one — it is already a stable,
     * human-chosen identifier — and a derived slug otherwise.
     */
    private function identifier(Route $route): string
    {
        $name = $route->getName();

        if (is_string($name) && $name !== '') {
            return $name;
        }

        // `api/admin/disputes/{dispute}` -> `api.admin.disputes.dispute`
        //
        // The PARAMETER NAME is kept, not a placeholder: two routes on the
        // same path with different parameter names are different endpoints
        // (`/orders/{order}` and `/orders/{id}`), and a placeholder would
        // collapse them into one identifier.
        $slug = preg_replace_callback(
            '#\{([^}]+)\}#',
            static fn (array $matches): string => $matches[1],
            $route->uri(),
        );

        $slug = str_replace('/', '.', (string) $slug);

        return strtolower(implode(',', $this->methods($route))).'.'.$slug;
    }

    /**
     * The HTTP methods, split apart.
     *
     * `GET|HEAD` is one route with two verbs, and the manifest has to say so
     * explicitly — the Go router registers a handler per method, and a route
     * set comparison that counted `GET|HEAD` as one would let a missing HEAD
     * through.
     *
     * @return list<string>
     */
    private function methods(Route $route): array
    {
        // ALL the methods, not just the first.
        //
        // A Laravel route can declare several: `Route::match(['put', 'patch'],
        // ...)` is how four of the update endpoints are written, and taking
        // only `methods()[0]` dropped the PATCH half of each — which the
        // parity gate found immediately, because a method that exists in
        // Laravel and not in the manifest is a 404 in production.
        $methods = [];

        foreach ($route->methods() as $set) {
            foreach (explode('|', (string) $set) as $method) {
                $methods[] = $method;
            }
        }

        $methods = array_values(array_unique(array_filter($methods)));

        // `HEAD` is implied by `GET` and is served by the same handler.
        if (in_array('GET', $methods, true) && in_array('HEAD', $methods, true)) {
            $methods = array_values(array_diff($methods, ['HEAD']));
        }

        return array_values($methods);
    }

    /**
     * @return list<string>
     */
    private function middleware(Route $route): array
    {
        $middleware = [];

        foreach ((array) $route->gatherMiddleware() as $item) {
            $middleware[] = is_string($item) ? $item : get_debug_type($item);
        }

        return $middleware;
    }

    /**
     * @param  list<string>  $middleware
     */
    private function requiresAuth(array $middleware): bool
    {
        foreach ($middleware as $item) {
            // The middleware are ALIASED here, not class names: `auth:sanctum`,
            // not `Illuminate\Auth\Middleware\Authenticate:sanctum`. Both
            // spellings are accepted, because a route that registers the class
            // directly would otherwise be misclassified as public.
            if (str_starts_with($item, 'auth:') || str_contains($item, 'Authenticate')) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<string>  $middleware
     */
    private function requiresAdmin(array $middleware): bool
    {
        foreach ($middleware as $item) {
            if ($item === 'admin' || str_contains($item, 'AdminMiddleware')) {
                return true;
            }
        }

        return false;
    }

    /**
     * The route's rate limit, as Laravel declared it.
     *
     * B22. This used to match ONLY the class form:
     *
     *     Illuminate\Routing\Middleware\ThrottleRequests:5,1
     *
     * But `gatherMiddleware()` returns a route's OWN middleware in the form
     * it was written in, so a route declared as
     *
     *     Route::post('/login', ...)->middleware('throttle:10,1');
     *
     * reports `throttle:10,1` — the ALIAS — and never the class form. The
     * class form only appears for middleware that the `api` GROUP declares,
     * and `gatherMiddleware()` collapses a group to its group name.
     *
     * So the check never matched anything, the `throttle` field was null for
     * all 296 routes, and the nine routes that DO carry a limit were recorded
     * as having none:
     *
     *     GET  api/admin/projects/export          throttle:10,1
     *     POST api/conversations                   throttle:10,1
     *     POST api/conversations/{id}/messages     throttle:30,1
     *     POST api/forgot-password                 throttle:5,1
     *     GET  api/geocode/reverse                 throttle:30,1
     *     GET  api/geocode/search                  throttle:30,1
     *     POST api/login                           throttle:10,1
     *     POST api/register                        throttle:5,1
     *     POST api/reset-password                  throttle:5,1
     *
     * The Go router builds its rate limiter from this field, so a null here
     * means an endpoint with NO rate limit in the new stack that has one in
     * the old — and the endpoints that lost it are, without exception, the
     * ones an attacker would want to hammer: the login and the password
     * reset.
     *
     * The value recorded is the LIMIT SPEC — `10,1` — meaning ten attempts
     * per one minute. The Go side normalises it to `rate:10/m`.
     *
     * @param  list<string>  $middleware
     */
    private function throttle(array $middleware): ?string
    {
        foreach ($middleware as $item) {
            // The alias form: `->middleware('throttle:10,1')`.
            if (str_starts_with($item, 'throttle:')) {
                return substr($item, strlen('throttle:'));
            }

            // The class form. The parameter is a limiter NAME (`api`) rather
            // than a limit, in which case there is no number to record.
            if (str_starts_with($item, 'Illuminate\\Routing\\Middleware\\ThrottleRequests:')) {
                $specifier = substr($item, strpos($item, ':') + 1);

                if (preg_match('/^\d+,\d+$/', $specifier) === 1) {
                    return $specifier;
                }
            }
        }

        return null;
    }

    private function gitCommit(): string
    {
        try {
            $process = new Process(['git', 'rev-parse', '--short', 'HEAD'], base_path());
            $process->run();

            return $process->isSuccessful() ? trim($process->getOutput()) : 'unknown';
        } catch (\Throwable) {
            return 'unknown';
        }
    }

    private function relative(string $path): string
    {
        $root = base_path().DIRECTORY_SEPARATOR;

        return str_starts_with($path, $root) ? substr($path, strlen($root)) : $path;
    }

    /**
     * A minimal YAML emitter.
     *
     * The structure is fixed — a map of maps and lists of maps of scalars — so
     * the emitter is short and total. Strings are ALWAYS quoted, which removes
     * the entire class of "is this value a boolean?" questions (`on`, `no`,
     * `yes` are YAML booleans).
     *
     * @param  array<string, mixed>  $data
     */
    private function toYaml(array $data): string
    {
        $lines = [
            '# 4Ceria route manifest — the single source of truth for the API surface.',
            '#',
            '# GENERATED by `php artisan routes:export`. DO NOT EDIT BY HAND.',
            '#',
            '# Three programs read this file: the Go router, the parity gate',
            '# (`tools/parity/routes.mjs`), and the golden-file capture. The gate',
            '# compares it against BOTH the Laravel route table and the Go route',
            '# table, so a manifest that disagrees with either fails the build.',
            '#',
            '# Regenerate: php artisan routes:export',
            '# Verify:     node tools/parity/routes.mjs',
            '',
        ];

        $lines = array_merge($lines, $this->emitMap($data, 0));

        return implode("\n", $lines)."\n";
    }

    /**
     * @param  array<string, mixed>  $map
     * @return list<string>
     */
    private function emitMap(array $map, int $depth): array
    {
        $lines = [];
        $indent = str_repeat('  ', $depth);

        foreach ($map as $key => $value) {
            if (is_array($value) && $value !== [] && array_is_list($value)) {
                $lines[] = "{$indent}{$this->scalar((string) $key)}:";

                foreach ($value as $item) {
                    if (is_array($item)) {
                        // A list of maps: the first key goes on the dash line,
                        // and the REST of the keys are aligned with it — two
                        // columns further right than the dash.
                        //
                        // The dash is `indent + 2` and the key follows it, so
                        // the keys are at `indent + 4`. Emitting them one
                        // column further left produces YAML that looks right
                        // and does not parse.
                        $itemLines = $this->emitMap($item, $depth + 2);

                        if ($itemLines === []) {
                            $lines[] = "{$indent}  - {}";
                            continue;
                        }

                        $first = ltrim($itemLines[0]);
                        $lines[] = "{$indent}  - {$first}";
                        $lines = array_merge($lines, array_slice($itemLines, 1));
                    } else {
                        $lines[] = "{$indent}  - ".$this->scalar($item);
                    }
                }

                continue;
            }

            if (is_array($value)) {
                if ($value === []) {
                    $lines[] = "{$indent}{$this->scalar((string) $key)}: {}";
                    continue;
                }

                $lines[] = "{$indent}{$this->scalar((string) $key)}:";
                $lines = array_merge($lines, $this->emitMap($value, $depth + 1));

                continue;
            }

            $lines[] = "{$indent}{$this->scalar((string) $key)}: ".$this->scalar($value);
        }

        return $lines;
    }

    private function scalar(mixed $value): string
    {
        if ($value === null) {
            return 'null';
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        // Always quoted: `on`, `no`, `yes`, `null` and a leading `*` are all
        // YAML syntax, and a route URI is none of those but a rule that
        // depends on the value is a rule that will be forgotten.
        return "'".str_replace("'", "''", (string) $value)."'";
    }
}
