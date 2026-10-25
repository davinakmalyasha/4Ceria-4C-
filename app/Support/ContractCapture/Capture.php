<?php

namespace App\Support\ContractCapture;

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * The recorder: it makes a request against the legacy application and
 * records what came back.
 *
 * WHY AN IN-PROCESS REQUEST
 * -------------------------
 * The recording has to be a REAL request through the REAL middleware stack:
 * the auth gate, the rate limiter, the termination freeze, the route model
 * binding, the exception handler. A handler called directly would skip all
 * of them, and the golden file would then record a response the application
 * never actually produces.
 *
 * So the request goes through the HTTP kernel, in-process, with a real
 * bearer token — the same mechanism a client uses.
 *
 * WHY THE BEARER TOKEN AND NOT `actingAs`
 * ----------------------------------------
 * The legacy application resolves the caller in two ways in the same
 * controller: `Auth::guard('sanctum')->user()` in some methods and
 * `Auth::user()` in others. A test's `actingAs()` sets a guard, and which
 * one it sets changes what each of those resolves to. A real token sets
 * both, because it is what the middleware sees.
 *
 * And the token has a cost: Sanctum writes `last_used_at` on every
 * authenticated request. That column is excluded from the recorded side
 * effects, or the recording would not be idempotent — the second run
 * would differ from the first.
 */
final class Capture
{
    /**
     * The Host the requests are made with.
     *
     * The paginator's `path`, `first_page_url` and `links[].url` are
     * ABSOLUTE URLs derived from the request, so the Host is part of the
     * recorded body. Pinning it is what makes those bytes stable.
     */
    public const HOST = 'localhost';

    /**
     * The parameter name to fixture entity, for the unambiguous names.
     *
     * A path parameter is usually named after the thing it identifies, so
     * the name is the mapping. The exceptions are in AMBIGUOUS_PARAMETERS
     * and in the per-route overrides.
     *
     * @var array<string, string>
     */
    private const PARAMETER_ENTITIES = [
        'project' => 'project',
        'dispute' => 'dispute',
        'requirement' => 'requirement',
        'house' => 'house',
        'quote' => 'quote',
        'addendum' => 'addendum',
        'material_order' => 'material_order',
        'material_order_review' => 'material_order_review',
        'milestone' => 'milestone',
        'termin' => 'termin',
        'firmMember' => 'firm_member',
        'document' => 'document',
        'message' => 'message',
        'user' => 'stranger',
        // The firm profile endpoint looks for a user whose `role_type` is
        // `arsitek` or `kontraktor` — a firm's owner is a professional, not
        // a client — so the parameter is the architect's USER id.
        'ownerId' => 'arsitek_user',
        'conversation' => 'conversation',
        'material' => 'material',
        'changeOrder' => 'change_order',
        'comment' => 'comment',
        'extension' => 'extension',
        'folder' => 'folder',
        'termination' => 'termination',
        'procurementRequest' => 'procurement_request',
        'bid' => 'bid_arsitek',
        'bidId' => 'bid_arsitek',
        'report' => 'report',
        'snagItem' => 'snag',
        'stickyNote' => 'sticky_note',
        'consultation' => 'consultation',
        'favorite' => 'favorite',
        'notification' => 'notification',
        'dailyLog' => 'daily_log',
        'schedule' => 'schedule',
        'claim' => 'warranty_claim',
        'question' => 'house_question',
        'room' => 'room',
        'supplier' => 'supplier',
    ];

    /**
     * The parameters that are not ids.
     *
     * They are path SEGMENTS, and they carry a role name or a column name
     * rather than a row id, so they are resolved to a literal.
     *
     * @var array<string, string>
     */
    private const LITERAL_PARAMETERS = [
        'type' => 'arsitek',
        'role' => 'kontraktor',
        'field' => 'file_portofolio',
    ];

    /**
     * The routes whose `{id}` means something specific.
     *
     * `{id}` is the most common parameter name in the application and it
     * means a different row in every one of these routes: a house, a
     * profile, a delivery job, a supplier, a portfolio, an addendum, a
     * sandbox item, a bid, a sub-professional, a team member.
     *
     * The key is the route's URI with the `{id}` left in, and the value is
     * the fixture entity it refers to.
     *
     * @var array<string, string>
     */
    private const AMBIGUOUS_ID = [
        'api/admin/houses/{id}/suspend' => ['id' => 'house'],
        'api/admin/professionals/{type}/{id}/status' => ['id' => 'arsitek'],
        'api/logistics/jobs/{id}/accept' => ['id' => 'delivery_job'],
        'api/logistics/jobs/{id}/status' => ['id' => 'delivery_job'],
        'api/marketplace/suppliers/{id}' => ['id' => 'supplier'],
        'api/portfolios/{id}' => ['id' => 'portfolio'],
        'api/projects/{project}/budget/addendums/{id}' => ['id' => 'addendum'],
        'api/projects/{project}/budget/sandbox/{id}' => ['id' => 'sandbox_item'],
        'api/projects/{project}/budget/sandbox/{id}/update' => ['id' => 'sandbox_item'],
        'api/projects/{project}/sub-professionals/{id}' => ['id' => 'sub_professional'],
        'api/team-members/{id}' => ['id' => 'team_member'],
    ];

    /**
     * The routes whose parameters are followed by another segment.
     *
     * The same route with a different verb, so the exact URI differs.
     *
     * @var array<string, array<string, string>>
     */
    private const AMBIGUOUS_ID_PREFIX = [
        'api/projects/{project}/sub-professionals/{id}/' => ['id' => 'sub_professional'],
        'api/projects/{project}/pm-bids/{bid}/' => ['bid' => 'bid_pm'],
        'api/projects/{project}/sub-professionals/shortlist-bid/{role}/{bidId}' => ['bidId' => 'bid_structural'],
        'api/projects/{project}/reject-engineering-bid/{bidId}' => ['bidId' => 'bid_structural'],
    ];

    /**
     * The routes whose parameters are LITERALS rather than ids.
     *
     * The sub-professional shortlist names the role being hired for, and
     * the role decides which bid table the endpoint looks in. The default
     * role is `kontraktor`, which is not a role anybody can be hired for as
     * a SPECIALIST — the specialists are `structural` and `mep`.
     *
     * @var array<string, array<string, string>>
     */
    private const URI_LITERALS = [
        'api/projects/{project}/sub-professionals/shortlist-bid/{role}/{bidId}' => ['role' => 'structural'],
    ];

    /**
     * The payment routes, and the payment type they use.
     *
     * `payments/{type}/{id}` names a KIND of payment and a ROW. The two are
     * different things and they used to be conflated: a parameter NAMED
     * `termin` is a row — `payment-termins/{termin}` — while a parameter
     * named `type` is the kind. Looking the name up in one table made
     * `payment-termins/{termin}` resolve to the string "termin" instead of
     * the termin's id, and the route answered 404 for a row that existed.
     *
     * @var array<string, string>
     */
    private const PAYMENT_ROUTES = [
        'bid_arsitek' => 'bid_arsitek',
        'bid_kontraktor' => 'bid_kontraktor',
        'bid_notaris' => 'bid_notaris',
        'bid_project_manager' => 'bid_pm',
        'bid_structural' => 'bid_structural',
        'bid_mep' => 'bid_mep',
        'termin' => 'termin',
        'addendum' => 'addendum',
    ];

    /**
     * The payment type the capture uses on the payment routes.
     *
     * One type, so that the recording is stable. The route accepts nine.
     */
    private const CAPTURE_PAYMENT_TYPE = 'bid_arsitek';

    public function __construct(private readonly Fixture $fixture) {}

    /**
     * Resolve a URI's path parameters to concrete values.
     *
     * @return array<string, string>|null  Null when a parameter cannot be
     *                                    resolved, which means the route
     *                                    cannot be captured.
     */
    public function resolve(string $uri): ?array
    {
        $resolved = [];

        if (! preg_match_all('/\{([^}]+)\}/', $uri, $matches)) {
            return $resolved;
        }

        // The payment routes name a KIND of payment and a ROW: `payments/
        // {type}/{id}`. The kind is a literal and the row is an id, and the
        // row is chosen by the kind.
        $isPaymentRoute = str_contains($uri, '/payments/{type}/');

        foreach ($matches[1] as $name) {
            // The per-route overrides come first: they are the routes whose
            // parameter names are ambiguous.
            $override = $this->overrideFor($uri, $name);

            if ($override !== null) {
                $resolved[$name] = (string) $this->fixture->id($override);
                continue;
            }

            if ($name === 'type') {
                $resolved[$name] = $isPaymentRoute
                    ? self::CAPTURE_PAYMENT_TYPE
                    : self::LITERAL_PARAMETERS['type'];

                continue;
            }

            // The per-route LITERAL overrides.
            if (isset(self::URI_LITERALS[$uri][$name])) {
                $resolved[$name] = self::URI_LITERALS[$uri][$name];
                continue;
            }

            if (isset(self::LITERAL_PARAMETERS[$name])) {
                $resolved[$name] = self::LITERAL_PARAMETERS[$name];
                continue;
            }

            if ($name === 'id') {
                $entity = $this->ambiguousEntityFor($uri, $isPaymentRoute);

                if ($entity === null) {
                    return null;
                }

                $resolved[$name] = (string) $this->fixture->id($entity);
                continue;
            }

            if ($name === 'token') {
                $resolved[$name] = 'capture-share-token';
                continue;
            }

            if (! isset(self::PARAMETER_ENTITIES[$name])) {
                return null;
            }

            $resolved[$name] = (string) $this->fixture->id(self::PARAMETER_ENTITIES[$name]);
        }

        return $resolved;
    }

    /**
     * The entity a parameter refers to on a given route, when the route
     * says so.
     */
    private function overrideFor(string $uri, string $name): ?string
    {
        if (isset(self::AMBIGUOUS_ID[$uri][$name])) {
            return self::AMBIGUOUS_ID[$uri][$name];
        }

        foreach (self::AMBIGUOUS_ID_PREFIX as $prefix => $parameters) {
            if (str_starts_with($uri, $prefix) && isset($parameters[$name])) {
                return $parameters[$name];
            }
        }

        return null;
    }

    /**
     * The entity an `{id}` refers to on a given route.
     */
    private function ambiguousEntityFor(string $uri, bool $isPaymentRoute = false): ?string
    {
        if (isset(self::AMBIGUOUS_ID[$uri])) {
            return reset(self::AMBIGUOUS_ID[$uri]);
        }

        foreach (self::AMBIGUOUS_ID_PREFIX as $prefix => $parameters) {
            if (str_starts_with($uri, $prefix)) {
                return reset($parameters);
            }
        }

        // The payment endpoints: `payments/{type}/{id}` — the id is the row
        // the type names.
        if ($isPaymentRoute) {
            return self::PAYMENT_ROUTES[self::CAPTURE_PAYMENT_TYPE];
        }

        // The verification documents: `documents/{type}/{id}/{field}` — the
        // id is a profile id.
        if (preg_match('#^api/verifications/documents/\{type\}/\{id\}/#', $uri) === 1) {
            return 'arsitek';
        }

        return null;
    }

    /**
     * Make a request and record the answer.
     *
     * @param  array<string, mixed>  $body
     * @param  array<string, mixed>  $query
     * @return array{status: int, headers: array<string, string>, body: string, rows: array<string, list<array<string, mixed>>>}
     */
    public function send(
        string $method,
        string $uri,
        array $query = [],
        array $body = [],
        ?string $identity = null,
    ): array {
        // The cache is flushed before every request: four controllers serve
        // a 600-second cached listing, and a cached page is a page that
        // reflects the database at CACHE time. Without the flush, the
        // second endpoint to ask for the same listing would record the
        // first one's answer.
        Cache::flush();

        $server = [
            'HTTP_HOST' => self::HOST,
            'HTTP_ACCEPT' => 'application/json',
            'REQUEST_METHOD' => strtoupper($method),
        ];

        // The token is the CAPTURE's instrument, and the application can
        // consume it: `POST /api/logout` deletes the caller's token, and
        // suspending a user revokes every token they hold. A capture that
        // ran 296 endpoints in a row would have every request after the
        // first logout answered 401 — a recording of the capture's own
        // breakage rather than of the application.
        //
        // So the token is checked before each request and re-minted when the
        // application has taken it. The endpoint that consumed it still
        // records what it did, and the token's revocation is visible in the
        // endpoint's own golden file.
        if ($identity !== null) {
            $token = $this->fixture->ensureToken($identity);
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        }

        $content = null;

        if ($body !== []) {
            $content = json_encode($body);
            $server['CONTENT_TYPE'] = 'application/json';
            $server['CONTENT_LENGTH'] = (string) strlen((string) $content);
        }

        // THE GUARD CACHES THE RESOLVED USER.
        //
        // `Illuminate\Auth\RequestGuard` — which is what Sanctum uses —
        // resolves the caller ONCE and keeps it:
        //
        //     if (! is_null($this->user)) {
        //         return $this->user;
        //     }
        //     return $this->user = call_user_func($this->callback, ...);
        //
        // And the guard is a singleton in the AuthManager, so it lives for
        // the life of the PROCESS. A capture makes many requests in one
        // process, and the second authenticated request would see the FIRST
        // one's caller.
        //
        // The symptom was quiet and total: 170 of the 296 endpoints answered
        // 403, because the first authenticated request in the run was an
        // admin one and every project-scoped request after it was checked
        // against the administrator's id instead of the owner's.
        //
        // `forgetGuards()` drops the resolved guard instances, so the next
        // request re-resolves from its own token.
        \Illuminate\Support\Facades\Auth::forgetGuards();

        // The DEFAULT GUARD is reset too.
        //
        // `Authenticate::authenticate()` calls `shouldUse('sanctum')` when
        // the sanctum guard authenticates — and that choice is sticky for
        // the life of the process. So the login endpoint, which calls
        // `Auth::attempt()` on the DEFAULT guard, found the sanctum
        // `RequestGuard` — which has no `attempt` method — and answered 500
        // with "Method Illuminate\Auth\RequestGuard::attempt does not
        // exist".
        //
        // Resetting the default to the session guard before the request
        // reproduces what a real request sees: the `auth:sanctum` middleware
        // sets it back to `sanctum` during the request, for the endpoints
        // that have it.
        \Illuminate\Support\Facades\Auth::shouldUse('web');

        $request = Request::create(
            'http://'.self::HOST.$uri,
            strtoupper($method),
            $query,
            [],
            [],
            $server,
            $content,
        );

        // The side effects: the rows the request changed.
        $before = $this->snapshot();

        $kernel = app(Kernel::class);
        $response = $kernel->handle($request);

        $after = $this->snapshot();

        // The rows the request CREATED — found by the table's counter, which
        // is not in the reserved range for a table the fixture does not
        // write to.
        $created = $this->created($before['counters']);

        $rows = array_merge($after['rows'], $created);

        // The ids the DATABASE assigned — the rows the endpoint inserted.
        //
        // A created row's id comes from the auto-increment counter, and the
        // counter is not rolled back by a transaction, so the id differs
        // between two captures of the same endpoint. It cannot be part of
        // the byte-identical contract either — MySQL's counter and
        // PostgreSQL's sequence will not agree — so it is replaced with a
        // placeholder, and this is the list of the values to replace.
        //
        // The list is built from the RAW rows: the recorded rows have
        // already had their ids replaced, so reading them back would find
        // the placeholder instead of the number.
        $assignedIds = $this->assignedIds($before['rows'], $rows);

        $recorded = [
            'status' => $response->getStatusCode(),
            'headers' => $this->headers($response->headers->all()),
            'body' => (string) $response->getContent(),
            'rows' => $this->diff($before['rows'], $rows, $assignedIds),
            'assigned_ids' => $assignedIds,
        ];

        // The kernel keeps state between requests — the resolved route, the
        // authenticated user, the container's bindings. Without this, the
        // SECOND request would see the FIRST one's route.
        $kernel->terminate($request, $response);

        return $recorded;
    }


    /**
     * The tables the side effects are read from.
     *
     * EVERY table in the database, rather than a hand-written list.
     *
     * The list was hand-written at first, and it was wrong: a table the
     * capture did not watch was a table whose created rows were invisible,
     * and an invisible created row means an id that changes between two
     * captures of the same endpoint — the recording stops being a recording.
     *
     * Six endpoints were affected, and a seventh would have been the next
     * one somebody added. The list is read from the schema instead, so it
     * cannot be wrong in that way: a table that does not exist is skipped,
     * and a table that appears is watched.
     *
     * @var list<string>|null
     */
    private static ?array $watchedTables = null;

    /**
     * @return list<string>
     */
    private function watchedTables(): array
    {
        if (self::$watchedTables !== null) {
            return self::$watchedTables;
        }

        $tables = [];

        try {
            $rows = DB::select(
                'SELECT TABLE_NAME AS name FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = \'BASE TABLE\''
            );
        } catch (\Throwable) {
            $rows = [];
        }

        foreach ($rows as $row) {
            $name = (string) (array_values((array) $row)[0]);

            // The bookkeeping tables. They are written by the framework, not
            // by an endpoint.
            if (in_array($name, ['migrations', 'cache', 'cache_locks', 'sessions', 'jobs', 'job_batches', 'failed_jobs'], true)) {
                continue;
            }

            $tables[] = $name;
        }

        sort($tables);

        return self::$watchedTables = $tables;
    }

    /**
     * A snapshot of the watched tables.
     *
     * TWO THINGS ARE READ, AND ONLY TWO
     *
     * 1. THE RESERVED RANGE — the fixture's rows, and the rows the endpoint
     *    creates when the table's ids come from the fixture's bands.
     *
     * 2. THE TABLE'S COUNTER — the highest id the table held before the
     *    request. A row the endpoint creates takes the next id from that
     *    counter, and the counter is NOT in the reserved range for a table
     *    the fixture does not write to: the ledger's own rows are numbered
     *    from the live database's sequence, not from the fixture's.
     *
     * Reading the whole tables cost 296 routes × 48 tables × every live row
     * of them, which is minutes of pointless I/O; a range scan on the
     * primary key is milliseconds.
     *
     * @return array{rows: array<string, array<string, mixed>>, counters: array<string, int>}
     */
    private function snapshot(): array
    {
        $rows = [];
        $counters = [];

        foreach ($this->watchedTables() as $table) {
            try {
                $highest = DB::table($table)->max('id');

                if ($highest !== null) {
                    $counters[$table] = (int) $highest;
                }

                foreach (DB::table($table)->where('id', '>=', Fixture::ID_BASE)->get() as $row) {
                    $rows[$table.'#'.$row->id] = (array) $row;
                }
            } catch (\Throwable) {
                // A table that does not exist in this database is not an
                // error: the capture records what IS there.
                continue;
            }
        }

        return ['rows' => $rows, 'counters' => $counters];
    }

    /**
     * The rows the request INSERTED.
     *
     * A created row takes the next id from the table's counter, so it is
     * found by asking for the rows above the counter the table held before
     * the request.
     *
     * @param  array<string, int>  $counters
     * @return array<string, array<string, mixed>>
     */
    private function created(array $counters): array
    {
        $rows = [];

        foreach ($this->watchedTables() as $table) {
            if (! isset($counters[$table])) {
                continue;
            }

            try {
                $created = DB::table($table)->where('id', '>', $counters[$table])->get();
            } catch (\Throwable) {
                continue;
            }

            foreach ($created as $row) {
                $rows[$table.'#'.$row->id] = (array) $row;
            }
        }

        return $rows;
    }

    /**
     * The ids of the rows the endpoint INSERTED.
     *
     * @param  array<string, array<string, mixed>>  $before
     * @param  array<string, array<string, mixed>>  $after
     * @return list<int>
     */
    private function assignedIds(array $before, array $after): array
    {
        $ids = [];

        foreach ($after as $key => $row) {
            if (isset($before[$key])) {
                continue;
            }

            $id = $row['id'] ?? null;

            if (is_int($id) || (is_string($id) && ctype_digit($id))) {
                $ids[] = (int) $id;
            }
        }

        return $ids;
    }

    /**
     * The ids the fixture created, by value.
     *
     * An id that is NOT one of them was assigned by the DATABASE, and the
     * two engines will not agree on it — so it is replaced with a
     * placeholder rather than recorded.
     *
     * @return list<int>
     */
    private function knownIds(): array
    {
        return array_values($this->fixture->ids());
    }

    /**
     * The rows that changed between two snapshots.
     *
     * @param  array<string, array<string, mixed>>  $before
     * @param  array<string, array<string, mixed>>  $after
     * @return array<string, list<array<string, mixed>>>
     */
    private function diff(array $before, array $after, array $assignedIds = []): array
    {
        $changes = [];

        foreach ($after as $key => $row) {
            $table = explode('#', $key)[0];

            if (! isset($before[$key])) {
                $changes[$table][] = ['op' => 'insert', 'row' => Normaliser::row($row, $this->knownIds(), $assignedIds)];
                continue;
            }

            if ($before[$key] !== $row) {
                $changed = [];

                foreach ($row as $column => $value) {
                    if (($before[$key][$column] ?? null) !== $value) {
                        $changed[$column] = $value;
                    }
                }

                $changes[$table][] = [
                    'op' => 'update',
                    'row' => Normaliser::row($row, $this->knownIds(), $assignedIds),
                    'changed' => Normaliser::row($changed, $this->knownIds(), $assignedIds),
                ];
            }
        }

        foreach ($before as $key => $row) {
            if (! isset($after[$key])) {
                $table = explode('#', $key)[0];
                $changes[$table][] = ['op' => 'delete', 'row' => Normaliser::row($row, $this->knownIds(), $assignedIds)];
            }
        }

        ksort($changes);

        return $changes;
    }

    /**
     * The response headers worth recording.
     *
     * @param  array<string, list<string>>  $headers
     * @return array<string, string>
     */
    private function headers(array $headers): array
    {
        $keep = ['content-type'];

        $out = [];

        foreach ($keep as $name) {
            if (isset($headers[$name][0])) {
                $out[$name] = $headers[$name][0];
            }
        }

        return $out;
    }
}
