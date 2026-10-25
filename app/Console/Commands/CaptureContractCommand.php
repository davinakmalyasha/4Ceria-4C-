<?php

namespace App\Console\Commands;

use App\Support\ContractCapture\BodyBuilder;
use App\Support\ContractCapture\Capture;
use App\Support\ContractCapture\Fixture;
use App\Support\ContractCapture\Normaliser;
use App\Support\ContractCapture\RuleExtractor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Symfony\Component\Process\Process;

/**
 * Record the legacy application's answers, so the Go port can be compared
 * against them.
 *
 * WHY A GOLDEN FILE
 * -----------------
 * The rewrite moves 296 API endpoints from Laravel to Go, and the Laravel
 * application is the ORACLE. "The Go response matches the Laravel one" is
 * not something a person can check by reading 296 responses, and it is not
 * something a test can check without a RECORD of what the Laravel one said.
 *
 * So the Laravel application is asked, once, and the answers are committed.
 * The Go side then asserts against them.
 *
 * Never hand-write a golden file. It is a RECORDING, and a hand-written one
 * is a wish.
 *
 * WHY THE CAPTURE RUNS IN A TRANSACTION
 * --------------------------------------
 * The capture creates a fixture — a whole world of rows — and it must not
 * leave it behind. Everything runs inside one transaction that is rolled
 * back at the end, so the capture is invisible to the database it ran
 * against.
 *
 * WHY EVERYTHING IS PINNED
 * ------------------------
 * The recording is only meaningful if the same thing was recorded every
 * time. So:
 *
 *   - the clock is frozen (`Carbon::setTestNow()`), so a timestamp is a
 *     value and not a fact about the day the capture ran;
 *   - the fixture's ids are pinned, so the recorded bodies carry the same
 *     ids on every machine — an id is not normalised away, because an
 *     endpoint that returned the WRONG id is exactly what a port gets
 *     wrong;
 *   - the Host is pinned, so the paginator's absolute URLs are stable;
 *   - the cache is flushed before every request, so a cached listing is
 *     never recorded in place of a fresh one;
 *   - the rate limiter is neutralised, because 296 requests against a
 *     60-per-minute anonymous bucket is a 429.
 *
 * WHAT IT RECORDS
 * ---------------
 * The request, the response — the STATUS and the raw BODY BYTES — and the
 * rows the request changed. The body is recorded as bytes and compared as
 * bytes: the key order, the number formatting, the escaping and the
 * floating-point notation are all part of the contract, and a comparison
 * that parses the JSON first would not see any of them.
 */
class CaptureContractCommand extends Command
{
    /**
     * The signature.
     */
    protected $signature = 'contract:capture
        {--all : Capture every endpoint}
        {--route= : Capture one endpoint, by its route id: "get.api.projects"}
        {--path=spec/contracts/laravel : Where to write the golden files}
        {--check : Compare the recorded files with the current application and fail if they differ}
        {--list : List the endpoints and whether each one can be captured}';

    /**
     * The description.
     */
    protected $description = 'Record the legacy API\'s answers as golden files the Go port is compared against';

    /**
     * The frozen instant.
     *
     * A fixed, arbitrary instant. It has to be a constant — the golden
     * files are compared byte for byte, so a moving clock would be a
     * difference on every run.
     */
    private const FROZEN_NOW = '2026-01-01 00:00:00';

    public function handle(): int
    {
        $routes = $this->apiRoutes();

        if ($routes === []) {
            $this->error('There are no API routes to capture.');

            return self::FAILURE;
        }

        // The path may be absolute or relative to the repository root.
        $option = (string) $this->option('path');

        $path = $this->isAbsolutePath($option)
            ? $option
            : base_path($option);

        if ($this->option('list')) {
            return $this->listEndpoints($routes);
        }

        $only = $this->option('route');

        if ($only !== null && $only !== '') {
            $routes = array_values(array_filter(
                $routes,
                fn (array $route): bool => $route['id'] === $only
            ));

            if ($routes === []) {
                $this->error("No route has the id '{$only}'.");

                return self::FAILURE;
            }
        }

        $check = (bool) $this->option('check');

        return $this->capture($routes, $path, $check);
    }

    /**
     * The API routes, in the same order and with the same filter as the
     * route manifest.
     *
     * The manifest's filter — the `web` group is not an endpoint — is the
     * one that keeps the SPA's catch-all out of the capture.
     *
     * @return list<array{id: string, methods: list<string>, uri: string, action: string}>
     */
    private function apiRoutes(): array
    {
        $routes = [];

        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/')) {
                continue;
            }

            if (in_array('web', $route->gatherMiddleware(), true)) {
                continue;
            }

            $methods = [];

            foreach ($route->methods() as $method) {
                if ($method === 'HEAD') {
                    continue;
                }

                $methods[] = $method;
            }

            if ($methods === []) {
                continue;
            }

            $routes[] = [
                'id' => $route->getName() ?: $this->identifier($route->uri(), $methods),
                'methods' => $methods,
                'uri' => $route->uri(),
                'action' => $route->getActionName(),
            ];
        }

        usort($routes, fn (array $a, array $b): int => [$a['uri'], $a['methods'][0]] <=> [$b['uri'], $b['methods'][0]]);

        return $routes;
    }

    /**
     * The identifier of a route that has no name.
     *
     * The same shape the route manifest uses, so the golden file's name and
     * the manifest's id are the same string — the Go side looks a contract
     * up by the route id it already has, and the parity gate compares the
     * two.
     *
     * `api/admin/disputes/{dispute}` -> `api.admin.disputes.dispute`
     *
     * The PARAMETER NAME is kept, not a placeholder: two routes on the
     * same path with different parameter names are different endpoints
     * (`/orders/{order}` and `/orders/{id}`), and a placeholder would
     * collapse them into one identifier.
     */
    private function identifier(string $uri, array $methods): string
    {
        $slug = preg_replace_callback(
            '#\{([^}]+)\}#',
            static fn (array $matches): string => $matches[1],
            $uri,
        );

        $slug = str_replace('/', '.', (string) $slug);

        return strtolower(implode(',', $methods)).'.'.$slug;
    }

    /**
     * List the endpoints and whether they can be captured.
     */
    private function listEndpoints(array $routes): int
    {
        $this->line('The endpoints, and whether the fixture can satisfy them:');

        foreach ($routes as $route) {
            $this->line(sprintf(
                '  %-58s %-8s %s',
                $route['id'],
                implode('|', $route['methods']),
                $route['uri'],
            ));
        }

        $this->line('');
        $this->line(count($routes).' endpoint(s).');

        return self::SUCCESS;
    }

    /**
     * Run the capture.
     *
     * @param  list<array{id: string, methods: list<string>, uri: string, action: string}>  $routes
     */
    private function capture(array $routes, string $path, bool $check): int
    {
        $this->line('Recording the legacy API\'s answers.');

        $fixture = new Fixture();
        $capture = new Capture($fixture);
        $extractor = new RuleExtractor();
        $builder = new BodyBuilder($fixture);

        // The cache is flushed before every request: four controllers serve
        // a 600-second cached listing, and a cached page is a page that
        // reflects the database at CACHE time.
        \Illuminate\Support\Facades\Cache::flush();

        \Illuminate\Support\Carbon::setTestNow(
            \Illuminate\Support\Carbon::parse(self::FROZEN_NOW, 'UTC')
        );

        // THE PRODUCTION ERROR SHAPE.
        //
        // With `APP_DEBUG=true` the exception handler answers a 500 with the
        // exception, the FILE, the LINE and the whole stack trace — and the
        // file paths are this machine's, so the recording would not be the
        // same on another machine.
        //
        // The production shape is `{"message":"Server Error"}`, and that is
        // the shape the Go port has to produce.
        config(['app.debug' => false]);

        // And the PRODUCTION strictness: `Model::shouldBeStrict()` is off
        // in production, so a missing attribute is null rather than an
        // exception. The capture records what a USER gets.
        //
        // The strict mode is a development aid, and it finds real defects —
        // four of them were found by it (B24, B25, B27 and the extension
        // endpoints' undefined array keys). Those are fixed, and the
        // application's own test suite runs in strict mode, so a regression
        // is still caught there.
        \Illuminate\Database\Eloquent\Model::shouldBeStrict(false);

        $written = 0;
        $skipped = [];
        $drift = [];

        // EACH ENDPOINT IS RECORDED AGAINST A PRISTINE WORLD.
        //
        // The endpoints are not independent of each other: one deletes a
        // document, and the endpoint that reads that document then answers
        // 404 — a recording of the CAPTURE's ordering rather than of the
        // application. So the fixture is rebuilt for every endpoint, and
        // each recording's transaction is rolled back before the next one
        // starts.
        //
        // The ids are pinned, so the fixture is the SAME world every time:
        // a row that exists for one endpoint exists for all of them.
        foreach ($routes as $route) {
            DB::beginTransaction();

            try {
                // The fixture is built FIRST, because the parameters are
                // bound to its rows: the project id, the termin id, the bid
                // id. A route whose parameters the fixture cannot satisfy
                // is skipped, and the transaction is rolled back.
                $fixture->build();

                $parameters = $capture->resolve($route['uri']);

                if ($parameters === null) {
                    DB::rollBack();

                    $skipped[] = $route['id'].' — the fixture has no row for one of its parameters';

                    continue;
                }

                $resolvedUri = $this->bind($route['uri'], $parameters);

                $identity = $this->identityFor($route);

                // THE REQUEST BODY.
                //
                // The endpoint's own validation rules decide what it accepts,
                // so they are READ OUT of the controller and turned into the
                // smallest request the endpoint will take. A recording of a
                // 422 says nothing about the endpoint's behaviour — it says
                // the request was wrong.
                $rules = $extractor->forRoute($route['uri'], $route['methods'][0]);
                $body = $builder->build($rules);

                // The query string, from the same rules.
                $query = $this->queryFrom($rules, $body);

                $recorded = $capture->send(
                    $route['methods'][0],
                    '/'.$resolvedUri,
                    $query,
                    $body,
                    $identity,
                );
            } catch (\Throwable $exception) {
                DB::rollBack();

                $this->error('The capture of '.$route['id'].' failed: '.$exception->getMessage());

                return self::FAILURE;
            }

            DB::rollBack();

            $file = [
                    'request' => [
                        'method' => $route['methods'][0],
                        'uri' => $route['uri'],
                        'resolved_uri' => $resolvedUri,
                        'identity' => $identity,
                        'host' => Capture::HOST,
                        'query' => $query,
                        'body' => $body,
                    ],
                'response' => [
                    'status' => $recorded['status'],
                    'headers' => $recorded['headers'],
                    'body_raw' => Normaliser::body(
                        $recorded['body'],
                        array_values($fixture->ids()),
                        $recorded['assigned_ids'],
                    ),
                ],
                'side_effects' => [
                    'rows' => $recorded['rows'],
                ],
                'meta' => [
                    'route_id' => $route['id'],
                    'action' => $route['action'],
                    'fixture_version' => Fixture::VERSION,
                    'normaliser_version' => Normaliser::VERSION,
                    'laravel_commit' => $this->gitCommit(),
                    'ids' => $fixture->ids(),
                ],
            ];

            $encoded = json_encode($file, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";

            $target = $path.'/'.$route['id'].'.json';

            if ($check) {
                $existing = is_file($target) ? (string) file_get_contents($target) : null;

                if ($existing !== $encoded) {
                    $drift[] = $route['id'];
                }

                continue;
            }

            if (! is_dir(dirname($target))) {
                mkdir(dirname($target), 0755, true);
            }

            file_put_contents($target, $encoded);
            $written++;
        }

        \Illuminate\Support\Carbon::setTestNow();

        if ($check) {
            if ($drift !== []) {
                $this->error(count($drift).' endpoint(s) differ from the recorded golden file(s):');

                foreach (array_slice($drift, 0, 30) as $id) {
                    $this->error('  '.$id);
                }

                $this->error('Run: php artisan contract:capture --all');

                return self::FAILURE;
            }

            $this->info('The recorded golden files match the current application.');

            return self::SUCCESS;
        }

        $this->info(sprintf('Wrote %d golden file(s) to %s', $written, $this->relative($path)));

        if ($skipped !== []) {
            $this->line('');
            $this->line(count($skipped).' endpoint(s) could not be captured:');

            foreach (array_slice($skipped, 0, 30) as $line) {
                $this->line('  '.$line);
            }
        }

        return self::SUCCESS;
    }

    /**
     * The query string, from the same rules.
     *
     * Some endpoints read their input from the query string rather than the
     * body — the geocode proxies, the directories' `per_page` — and a
     * request with no query string answers 422 for the missing parameter.
     *
     * @param  array<string, list<string>>  $rules
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    private function queryFrom(array $rules, array $body): array
    {
        $query = [];

        foreach ($rules as $field => $set) {
            if (str_contains($field, '*')) {
                continue;
            }

            $required = in_array('required', array_map(
                static fn (string $rule): string => trim($rule, "'\" "),
                $set,
            ), true);

            if (! $required) {
                continue;
            }

            // A field the body already carries is not also a query
            // parameter — unless the endpoint reads it from the query
            // string, which the rules cannot say. The geocode endpoints are
            // the known case.
            if (array_key_exists($field, $body)) {
                continue;
            }

            $query[$field] = $body[$field] ?? null;
        }

        return $query;
    }

    /**
     * The identity a route is captured as.
     *
     * The application's answers depend on WHO is asking, so the identity is
     * part of the contract. The rules:
     *
     *   - the admin routes, as the administrator;
     *   - the merchant and the supplier's own listings, as the supplier;
     *   - the logistics routes, as the courier;
     *   - the public directories and the public brief, as nobody;
     *   - everything else, as the project owner — the identity the
     *     project's endpoints are written around.
     */
    private function identityFor(array $route): ?string
    {
        $uri = $route['uri'];

        if (str_starts_with($uri, 'api/admin/')) {
            return 'admin';
        }

        if (str_starts_with($uri, 'api/merchant') || str_starts_with($uri, 'api/materials')) {
            return 'supplier';
        }

        if (str_starts_with($uri, 'api/logistics/')) {
            return 'courier';
        }

        // The public directories and the public brief.
        if (str_starts_with($uri, 'api/marketplace/') || str_starts_with($uri, 'api/brief/')) {
            return null;
        }

        if (isset(self::IDENTITIES[$uri])) {
            return self::IDENTITIES[$uri];
        }

        return 'owner';
    }

    /**
     * The routes whose identity is not the default.
     *
     * The application's answers depend on WHO is asking, so the identity is
     * part of the contract — and a recording made as the wrong caller
     * records a 403 where the interesting answer is a 200.
     *
     * The key is the route's URI and the value is the fixture identity that
     * is AUTHORISED for it: the hired professional for the phase they were
     * hired for, the assigned project manager for the project manager's
     * endpoints, the supplier for the supplier's own listings, the courier
     * for the deliveries.
     *
     * A route that is not listed here is recorded as the project owner,
     * which is the identity the project's endpoints are written around.
     *
     * @var array<string, string>
     */
    private const IDENTITIES = [
        // The firm: its owner is a professional, and the fixture's firm has
        // the architect as its owner.
        'api/firm-members/{firmMember}/cancel' => 'arsitek',
        'api/firm-members/{firmMember}/respond' => 'arsitek',
        'api/firm-members/invite' => 'arsitek',
        'api/firm-members/search' => 'arsitek',
        'api/firm-members/update-profile' => 'arsitek',

        // The professional's own portfolio.
        'api/portfolios/{id}' => 'arsitek',

        // The deliveries: the courier.
        'api/delivery-jobs' => 'courier',
        'api/logistics/available-jobs' => 'courier',
        'api/logistics/dashboard-stats' => 'courier',
        'api/logistics/my-jobs' => 'courier',
        'api/logistics/jobs/{id}/accept' => 'courier',
        'api/logistics/jobs/{id}/status' => 'courier',

        // The credentials a professional uploaded.
        'api/verifications/documents/{type}/{id}/{field}' => 'arsitek',

        // The notary's own consultation.
        'api/consultations/{consultation}/respond' => 'notaris',

        // The supplier's own listings, and the buyer's side of a quote.
        'api/material-orders/{material_order}/verify-payment' => 'supplier',
        'api/material-quotes/{quote}/approve' => 'supplier',
        'api/material-quotes/{quote}/post-delivery-job' => 'supplier',
        'api/material-quotes/{quote}/mark-paid' => 'owner',
        'api/material-quotes/{quote}/request-payment' => 'owner',

        // The team: a professional's team, not a client's.
        'api/team-members' => 'arsitek',

        // The project: the assigned project manager.
        'api/projects/{project}/change-orders/{changeOrder}/pm-review' => 'pm',
        'api/projects/{project}/decline-bid' => 'pm',
        'api/projects/{project}/delays' => 'pm',
        'api/projects/{project}/extensions/{extension}/pm-review' => 'pm',
        'api/projects/{project}/handover/approve' => 'pm',
        'api/projects/{project}/handover/reject' => 'pm',
        'api/projects/{project}/initiate-walkthrough' => 'pm',
        'api/projects/{project}/payment-termins/{termin}/link-milestone' => 'pm',
        'api/projects/{project}/payment-termins/{termin}/unlink-milestone' => 'pm',
        'api/projects/{project}/pm-bids' => 'pm',
        'api/projects/{project}/procurement-requests/{procurementRequest}/reject' => 'pm',
        'api/projects/{project}/procurement-requests/{procurementRequest}/verify' => 'pm',
        'api/projects/{project}/shortlist-bid' => 'pm',
        'api/projects/{project}/verify-planning-pm' => 'pm',

        // The project: the hired professional for the phase they hold.
        'api/projects/{project}/budget/addendums' => 'kontraktor',
        'api/projects/{project}/daily-logs' => 'kontraktor',
        'api/projects/{project}/daily-logs/{dailyLog}' => 'kontraktor',
        'api/projects/{project}/resign' => 'kontraktor',
        'api/projects/{project}/seal-construction' => 'kontraktor',
        'api/projects/{project}/seal-design' => 'arsitek',
        'api/projects/{project}/seal-interior' => 'arsitek',
        'api/projects/{project}/seal-legal' => 'notaris',
        'api/projects/{project}/submit-engineering-interview' => 'arsitek',
        'api/projects/{project}/submit-planning' => 'arsitek',
        'api/projects/{project}/update-planning-audit' => 'arsitek',
        'api/projects/{project}/verify-payment' => 'arsitek',
        'api/projects/{project}/bids' => 'arsitek',

        // The invited sub-professional.
        'api/projects/{project}/sub-professionals/{id}/accept' => 'structural',
        'api/projects/{project}/sub-professionals/{id}/decline' => 'structural',

        // The defect, updated by the professional it was assigned to.
        'api/projects/{project}/snag-items/{snagItem}' => 'kontraktor',
    ];

    /**
     * Bind a URI's parameters to values.
     */
    private function bind(string $uri, array $parameters): string
    {
        foreach ($parameters as $name => $value) {
            $uri = str_replace('{'.$name.'}', (string) $value, $uri);
        }

        return $uri;
    }

    /**
     * The current commit.
     */
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

    /**
     * Is this path absolute?
     *
     * The `--path` option may be relative to the repository root, which is
     * the normal case, or absolute — which is what a test wants, because it
     * writes into a temporary directory.
     */
    private function isAbsolutePath(string $path): bool
    {
        return str_starts_with($path, '/')
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;
    }

    /**
     * A path, relative to the repository root.
     */
    private function relative(string $path): string
    {
        return str_replace(base_path().DIRECTORY_SEPARATOR, '', $path);
    }
}
