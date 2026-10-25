# The 4Ceria Porting Guide

**How to port one endpoint from Laravel to Go, and how to know you are finished.**

Read this before touching a slice. The whole rewrite is 19 slices; this is the
procedure for each of them.

---

## 0. The rules that do not bend

1. **The endpoint's behaviour is fixed.** The golden file recorded from Laravel is the
   specification. If the Go implementation disagrees with it, the **golden file is
   right** and the Go code is wrong — unless you have found a genuine defect in the
   legacy behaviour, in which case it is a separate, ADR'd fix (like the 16 defects in
   the rewrite plan's §3), never a silent difference.
2. **The wire format is byte-identical** for tier-1 endpoints: the same status codes,
   the same JSON key set, the same value types, the same error bodies, **and the same
   side-effect rows**.
3. **Money is never re-derived.** The server computes it; the client renders it
   (ADR-0022).
4. **The ledger has one writer** — `escrow.record_movement()` (ADR-0020).
5. **The authorization rule is `Hire`** (or its Go port). Not an inline comparison. The
   `null == null` class of bypass is the most expensive bug class in this repository's
   history, and it is closed by construction in Go (ADR-0015).
6. **Every slice is independently reversible.** If you cannot roll it back in five
   minutes, it is not finished.

---

## 1. The procedure

### Step 1 — claim the endpoint

The endpoint already EXISTS — it is one of the 296 in `routes/api.php`, and
`php artisan routes:export` writes it into `routing/routes.yaml` with `upstream: laravel`
and its `tier`. There is no claim step to run; the manifest is generated from the route
table, and the matrix is generated from the manifest.

```bash
php artisan routes:export          # routing/routes.yaml
node tools/parity/matrix.mjs       # docs/PARITY.md
```

Until the endpoint
is flipped to `upstream: go`, nothing about production changes.

**Decide the tier** (§3 of `docs/REWRITE-PLAN.md`):

| Tier | Meaning | Applies to |
|---|---|---|
| 1 | byte-identical, including side-effect rows | money, auth, disputes, contracts, admin |
| 2 | shape-identical | CRUD, lifecycle, marketplace |
| 3 | compatible | public directories, chat, notifications |

### Step 2 — read the Laravel implementation

Not just the controller method. In order:

1. `routes/api.php` — the route, its middleware, its throttle.
2. The controller method.
3. The **service** it calls, if any. `ProjectController` methods often reach into
   `ProjectFinancialService`, `TerminPlanService`, `RetentionService`,
   `PlatformFeeService`, `DisputeService`, `PaymentVerificationService`.
4. The **model** and its `$casts` / `$fillable`.
5. The **Resource** if one is returned — `ProjectResource` is 1 608 lines and carries
   the `visibleBids()` gate and 34 `pii()` calls. Reproduce it field-for-field.
6. The **test** that covers it, in `tests/`. That test is the acceptance criterion.

> **The `Hire` rule.** `app/Support/Hire.php` requires all four of: the role is held,
> a profile exists, the project's column is non-null, and the ids match. If a controller
> does an inline comparison instead, the port must use `Hire` — and if the inline
> comparison is *wrong*, that is a defect to report, not to reproduce.

### Step 3 — write the golden file

```bash
php artisan contract:capture --route=get.api.projects.project.bids
```

The `--route` argument is the endpoint's **id** (the Laravel route name, or the
generated slug), not its method and path — `php artisan contract:capture --list` prints
them all.

This runs the **real Laravel controller** against the seeded fixture dataset and
records the request, the response, and the rows the request touched. The file lands in
`spec/contracts/laravel/`.

**Never hand-write a golden file.** It is a recording, and a hand-written one is a
wish.

### Step 4 — write the Go implementation

The layering is enforced by an architecture linter, not by convention:

| Layer | May import | May NOT import |
|---|---|---|
| `internal/domain/*` | the standard library only | everything else — **no `pgx`, no `net/http`, no `context`** |
| `internal/repository/*` | `pgx`, the generated `gen` package, `domain` | `handler`, `service` |
| `internal/service/*` | `domain`, `repository`, `platform` | `handler` |
| `internal/handler/*` | `service`, `domain`, `middleware`, `envelope` | `repository` — **handlers never touch SQL** |
| `internal/platform/*` | third-party drivers | `domain` business rules |

**A handler is a thin shell.** It parses, calls a service, and renders. Anything that
knows a business rule belongs in `service`; anything that knows a rule about money
belongs in `domain`.

**The response envelope** — the SPA expects three shapes, and getting them wrong
breaks it in 250 places:

| Shape | Where |
|---|---|
| `{ "data": … }` | 69 sites — the resources and list endpoints |
| `{ "message": "…" }` | most error responses, and the simple mutations |
| `{ "message": "…", "errors": { "field": ["…"] } }` | 422 validation |
| the raw body | the paginator: `{ "data": […], "links": {…}, "meta": {…} }` |
| the 6 `Http\Resources` shapes | field-for-field, including `visibleBids()` and the `pii()` gates |

### Step 5 — write the tests

| Kind | What it does | Where |
|---|---|---|
| **Domain unit test** | Table-driven, no DB, no HTTP. The `Money` and `escrow` packages. | `internal/domain/*/…_test.go` |
| **Integration test** | Real PostgreSQL via a per-package schema. | `internal/repository/…_test.go` |
| **Contract test** | Asserts the golden file. | `test/contract/…_test.go` |
| **Fuzz target** | The decimal parser, the JSON envelope decoder, the share-token generator. | `internal/domain/money/fuzz_test.go` etc. |
| **Concurrency test** | 100 goroutines on one escrow row under `-race`. | `internal/service/escrow/race_test.go` |
| **Conformance test** | The Laravel assertions, re-expressed. | `test/conformance/…_test.go` |

**The conformance test is the important one.** For every Laravel test that covers the
endpoint, there is a Go test that asserts the same thing. The legacy suite's floor only
rises when these exist (ADR-0019).

### Step 6 — verify locally

```bash
gofmt -l . && go vet ./...                        # formatting and vet
GOEXPERIMENT=nojsonv2 go test -race ./...          # the Go suites
node tools/parity/routes.mjs                       # manifest vs Laravel vs Go
node tools/parity/routes-against-gateway.mjs       # …against the LIVE Go router
php artisan contract:capture --check               # the golden files
node tools/parity/matrix.mjs --check               # docs/PARITY.md is not stale
php scripts/verify.php                             # all of the above, in order
```

`scripts/verify.php` is the gate: it runs every check above plus the PHP suite, the
money and JSON differentials, and the PostgreSQL baseline. Run it before opening the
PR; CI runs the same list.

**There is no `Taskfile`.** It was in the plan and was never built, so the commands are
the real ones above rather than a `task` alias that does not exist.

### Step 7 — open the PR

The PR must not change a baseline (ADR-0019, ADR-0021). It must:

- [ ] carry the conformance tests for the endpoint
- [ ] carry the golden file for the endpoint
- [ ] **raise** the legacy assertion floor if the endpoint was previously untested
- [ ] update `docs/PARITY.md` — but only by **regenerating** it, never by hand
- [ ] leave `routing/routes.yaml` with `upstream: laravel` until the shadow comparator
      is clean

### Step 8 — shadow, then cut over

The shadow comparator is **not built yet**: the gateway registers every route from the
manifest and answers `501` until a handler exists. When it is built, it will send a
sampled copy of each read to **both** upstreams and compare the response shapes, and
the promotion bar is **0 mismatches over ≥ 1 000 samples** (or 7 days, whichever is
shorter).

```bash
# flip one line, then let the deploy pick the manifest up
#   upstream: laravel  ->  upstream: go
php artisan routes:export
node tools/parity/matrix.mjs      # the matrix now says "cut over"
```

**Never shadow a write.** A shadowed `mark-paid` would double-write the ledger.

### Step 9 — the 72-hour window

The legacy handler stays deployed. The shadow comparator keeps running. A mismatch rate
above 0.1 % triggers the automatic rollback.

### Step 10 — retire the legacy handler

**A separate PR, 72 hours later.** Never in the cutover PR — the rollback procedure
needs the legacy code to exist.

---

## 2. The definition of done for a ported endpoint

An endpoint is **ported** when all of these are true:

| # | Condition | Checked by |
|---|---|---|
| 1 | It is registered in `routing/routes.yaml` and `upstream: go` | `go-parity` |
| 2 | It appears in the Go router's **live** registered set (not just the declared one) | `go-parity` |
| 3 | The Laravel route set, the Go declared set, the Go live set and the route map are **equal** | `go-parity` |
| 4 | Its **normalised middleware set** matches Laravel's, exactly | `go-parity` |
| 5 | The gateway resolves it to the **same handler** the Go mux does, across 2 000 adversarial URIs | `go-parity` |
| 6 | Its **golden file** exists and the Go response matches it — byte-identical for tier 1, shape-identical for tier 2 | `go-parity` + the Go contract test |
| 7 | Its **side-effect rows** match the golden file (tier 1) | the Go contract test |
| 8 | Every Laravel test covering it has a **Go conformance test** | the legacy assertion floor |
| 9 | The **shadow comparator** reported 0 mismatches over ≥ 1 000 samples | `go-parity` (nightly) |
| 10 | The **money invariants** recomputed on both engines agree | `legacy-mysql-parity` |
| 11 | It appears in `docs/PARITY.md` with its tier and its verification status | the generated matrix |
| 12 | The **visual baseline** for every screen it renders is unchanged | `visual-regression` |
| 13 | It is documented in `docs/API_MAP.md` if the map's shape changed | review |

**The endpoint is not done if any of these is "manually verified".**

---

## 3. The definition of done for a slice

A slice is **done** when:

- [ ] every endpoint in it satisfies §2
- [ ] the slice's tables are **owned** by one stack, and the ETL direction has flipped
- [ ] `tools/verify-data --slice=S` reports equal row counts **and** equal row
      checksums
- [ ] the **escrow invariants** recomputed on both engines agree
- [ ] the **rollback rehearsal** has been run on a staging clone
- [ ] the 72-hour shadow window has passed
- [ ] the legacy handlers have been deleted **in a separate PR**
- [ ] `docs/PARITY.md` shows the slice as fully ported

---

## 4. What to do when the Go implementation disagrees with the golden file

In order:

1. **Read the Laravel code again.** The golden file records behaviour; the code
   explains it. A surprising golden file is usually an explained one.
2. **Check the `Hire` rule and the `pii()` gates.** Most surprises are an authorization
   difference, and the answer is almost always "the Go code is missing a gate".
3. **Check the envelope.** Three shapes, and the difference is usually a missing
   `{ "data": … }` wrapper.
4. **Check the cast.** Laravel returns `decimal(24,2)` as a **string**. Go returns a
   string too. A `float64` in the Go response is a bug.
5. **Check the timezone.** `APP_TIMEZONE=UTC`; the MySQL session timezone is
   `SYSTEM` = `Asia/Jakarta`. A timestamp off by 7 hours is a timezone, not a bug.
6. **If the golden file is genuinely wrong** — a legacy defect — it becomes a **defect
   report** with a failing test, fixed in the Laravel app **first**, and the golden
   file is re-recorded. The fix is never smuggled into the port.

---

## 5. The commands

There is no `Taskfile`; these are the real commands. Where a tool is named and does
not exist yet, the row says so rather than pointing at a `task` alias — a command
table that documents commands nobody has is worse than no table.

| Command | What it does |
|---|---|
| `php scripts/verify.php` | **The gate.** Every check below, plus the PHP suite. |
| `composer dev` | The legacy stack: server, queue, logs, vite. |
| `GOEXPERIMENT=nojsonv2 go test ./...` | The Go suites. |
| `node tools/parity/routes.mjs` | Route set, middleware and throttle parity. |
| `node tools/parity/routes-against-gateway.mjs` | The same, against the running gateway. |
| `php artisan contract:capture --all` | Record every golden file. |
| `php artisan contract:capture --route=<id>` | Record one. |
| `node tools/parity/matrix.mjs` | Regenerate `docs/PARITY.md` — **commit the result**. |
| `node tools/money/compare.mjs` | The PHP↔Go Money differential. |
| `node tools/json/compare.mjs` | The PHP↔Go JSON encoder differential. |
| `node tools/db/verify-postgres-baseline.mjs` | The PostgreSQL baseline from scratch, plus the escrow behaviour. |
| `node tools/visual/compare-builds.mjs` | The rendering baseline. |
| `node tools/visual/compare-builds.mjs --css=…` | The rendering gate (2622 classes). |
| `node tools/visual/compare-upstreams.mjs --screen=…` | The port against the legacy app, side by side. |
| **Not built yet** | the shadow comparator, the ETL, the screen baselines, `web/`. |

> **Restart BOTH servers after either build.**
>
> `npm run build` replaces `.next/` underneath a running `next start`, and the
> legacy `npm run build` replaces `public/build` while Octane keeps the Vite
> manifest in memory for the life of its workers. In both cases the next request
> is served HTML that points at an asset hash which no longer exists: the page is
> BLANK, and the visual gate reports a total mismatch that looks exactly like a
> catastrophic regression.
>
> `scripts/verify.php` builds both applications. Run it, restart, then capture.

> **`php scripts/verify.php` is the gate.** It is the direct replacement for
> `composer verify`, which was a green no-op (`@php scripts/verify.ps1` ran PHP over a
> PowerShell file, which printed the source and exited 0 — AGENTS.md records this). The
> new runner is a PHP script that shells out to the real tools, so it runs the same way
> on every platform, and `composer verify` now points at it.

---

## 5b. What the port is made of

`web/` is a separate Next.js application. Its shape is the port's argument:

| The legacy SPA | The port |
|---|---|
| 17 client routes, one `Dashboard` with 38 `useState` tabs | routes, one per screen: `/dashboard/houses`, `/dashboard/overview`, … |
| bearer token in `localStorage`, attached per call site | an **httpOnly cookie**, read on the server; the token never reaches the browser |
| 416 axios call sites, each deciding its own base URL | `web/lib/api.ts`, one place that knows the origin and the caller |
| 15 hand-rolled hooks, 3 module-level caches that leaked across users | `fetch` in the server component that renders the data, with the per-request cache |
| 30 `window` events to switch tabs | the router |
| `import.meta.glob` dev panel, guarded by `import.meta.env.DEV` | a dev-only route that is not in the production build |

**The stylesheets are not retyped.** `web/styles/app.css` and `index.css` are
GENERATED from `resources/css/` by `web/scripts/sync-styles.mjs`, with exactly one
transformation — the `@source` path directives are retargeted at `web/app` — because
Turbopack refuses to load files outside its root. `npm run sync:styles:check` fails the
build when they drift. The design cannot fork.

**The proof is a screenshot.** Four screens are ported and each was captured from the
legacy application and from the port, in the same browser, seconds apart:

| Screen | Worst channel difference |
|---|---|
| `/` (landing) | **0**/255 |
| `/login` | **0**/255 |
| `/register` | 1/255 (antialiasing) |
| `/forgot-password` | **0**/255 |
| `/help` | **0**/255 |
| `/pro/register` | **0**/255 |
| `/dashboard` (all 38 tabs, four roles) | 47 exact, 4 within budget |
| `/admin` | **0**/255 |
| `/admin/disputes` | **0**/255 |
| `/admin/houses` | **0**/255 |
| `/admin/projects` | 1/255 |
| `/admin/verification` | **0**/255 |
| `/admin/verification/logs` | **0**/255 |

**Every screen in the baseline renders identically.** 47 of the 51 are
byte-for-byte identical (zero pixels beyond an 8/255 antialiasing tolerance); the other
four differ by 200–320 pixels, all inside the budget, on screens with a map or a photo.

| Area | Screens | Result |
|---|---|---|
| Guest routes | 6 | 6/6 identical |
| Dashboard (owner) | 13 | 13/13 identical |
| Dashboard (architect) | 6 | 6/6 identical |
| Dashboard (contractor) | 7 | 6 exact, 1 within budget (317 px) |
| Dashboard (specialist) | 5 | 4 exact, 1 within budget (211 px) |
| Admin | 6 | 6/6 identical |
| Public tabs, signed out | 8 | 8/8 identical | The Help Centre's 2 000 lines of prose and its
seventeen interactive widgets are SYNCED from `resources/js/constants/docs/` and
`resources/js/components/docs/widgets/`, so a correction to a guide reaches both
applications or neither.

The dashboard is the first screen where the port does more than render: the page is a
SERVER component that fetches `/me`, `/projects?all=true`, `/projects?feed=true` and
`/hire-history` in parallel before sending markup, and the chrome — header, profile menu,
notifications bell, verification banner, floating chat button, the five overview cards —
is the SAME component code the legacy app runs, on the new runtime.

Its `axios` calls keep working because `app/api/[...path]/route.ts` is a BFF: it forwards
`/api/*` to the API with the token taken from the httpOnly cookie. That is why no synced
component had to learn where the token went.

The admin area is ported the same way, and it is the clearest demonstration of the
strategy: the six pages are the LEGACY components, unchanged, running on the new runtime.
Three things make that safe rather than accidental:

- `lib/react-router-shim.tsx` maps `<Link to>`, `useNavigate` and `useLocation` onto
  Next's router (`usePathname` on the server, so the first paint is right).
- `lib/axios-bootstrap.ts` sets the same defaults `bootstrap.js` sets, as a MODULE side
  effect — a provider `useEffect` runs after the page's first request has already fired.
- The BFF supplies the identity.

### How the tabs are ported, and what that means

The 38 tabs pull in roughly 300 components. Rewriting them by hand would be 300 chances
to change a screen nobody asked to change, so they are **synced**: the same components,
the same hooks, the same markup, on the new runtime. `web/scripts/sync-content.mjs`
copies them with exactly four transforms — `'use client'`, `@ts-nocheck` (the legacy tree
is checked by the legacy ratchet, not by the port's strict `tsc`), `import.meta.env.DEV`
→ `process.env.NODE_ENV`, and the `AuthContext` import pointed at the port's provider.

What is the port's OWN code, and therefore the actual engineering:

| Piece | What it does |
|---|---|
| `app/dashboard/page.tsx` | Resolves the cookie, then awaits `/me`, the projects, the feed and the collection the ACTIVE tab needs — server-side, in parallel. The legacy hook lazy-loads that collection from an effect, so the tab paints its empty state first. |
| `app/dashboard/DashboardShell.tsx` | Owns the tab (in the URL), the selections and the providers. The tab body is loaded `ssr: false`, because the tree reaches `maplibre-gl`, which touches `document` at import time. |
| `app/api/[...path]/route.ts` | The BFF: forwards `/api/*` with the cookie's token. |
| `lib/react-router-shim.tsx` | `<Link to>`, `useNavigate`, `useLocation` on Next's router. |
| `lib/axios-bootstrap.ts` | The same defaults `bootstrap.js` sets, as a module side effect. |

A tab is rewritten when it needs to be — its data moves into the page, its body into a
server component — and the synced copy shrinks. Until then, the screen is the real one. `tools/visual/compare-upstreams.mjs` runs that
comparison for any screen:

```bash
php artisan octane:start --port=9000
cd web && npm run build && npx next start --port 3000
node tools/visual/compare-upstreams.mjs --screen=guest.route.root
node tools/visual/compare-upstreams.mjs --screen=guest.route.login
node tools/visual/compare-upstreams.mjs --screen=guest.route.register
node tools/visual/compare-upstreams.mjs --screen=guest.route.forgot-password
node tools/visual/compare-upstreams.mjs --screen=guest.route.help
node tools/visual/compare-upstreams.mjs --screen=guest.route.pro-register
```

---

## 5c. The endpoints served by Go

`GET /api/admin/stats`, `GET /api/notifications` and `GET /api/user/active-projects` are
the routes the gateway serves instead of stubbing, and they are the template for the
rest:

| Step | What it took |
|---|---|
| Authentication | `internal/httpapi/auth.go` reads Sanctum's `{id}|{plain}` token, hashes the plain part with SHA-256 and looks it up in `personal_access_tokens` — the same table Laravel writes, so a token minted by either application works in both. |
| Data | A `pgxpool` query per aggregate, against the ETL'd PostgreSQL database. |
| Encoding | `jsonphp.Object`, because PHP preserves array insertion order and a Go map would sort the keys — the values would all be right and the body would still differ. |

Every one of them is checked by the GATE, not by memory:

```bash
node tools/parity/shadow-all.mjs --laravel=http://127.0.0.1:9001
```

It starts the gateway against the ETL'd PostgreSQL database, mints the fixture tokens,
copies them across, and compares every PORTED route against Laravel byte for byte. The
list of ported routes is in the script and grows one entry at a time; `scripts/verify.php`
runs it whenever both databases and the legacy app are up.

What they taught, all of it now written into the code:

1. **`NormalisedMiddleware` returns a SET, and a middleware chain is a SEQUENCE.**
   Building the chain from the set's iteration order put `admin` before `auth` and the
   endpoint answered 403 to the administrator it was meant for. The chain order is now
   declared once, in `Router.chain`.
2. **`POSTGRES REJECTS AN ENUM LITERAL MYSQL IGNORES.`** The legacy filter is
   `whereNotIn('status', ['completed','cancelled','terminated'])`, and `terminated` is
   not a member of `projects.status`. MySQL coerces and ignores it; PostgreSQL raises
   `invalid input value for enum project_status` and the endpoint stops answering. The
   ported query names ONLY the values the enum has.
3. **`jsonb` SORTS KEYS; `json` does not.** A notification's `data` column is
   echoed back inside the response, and PHP decodes and re-encodes it — preserving order.
   `jsonb` normalises the value into a binary form that reorders keys, so the column is
   `json`. It also stores `{"a": 1}` with a space while PHP writes `{"a":1}`, so the
   handler compacts the text (`jsonphp.CompactJSON`) instead of embedding it raw.
4. **Carbon's `toJSON()` is not RFC 3339.** Eloquent writes
   `2006-01-02T15:04:05.000000Z` — six fractional digits, always — where Go's
   `time.RFC3339Nano` trims trailing zeros.
5. **MySQL stores a DATETIME with no zone, and the application calls it UTC.** The ETL
   copies under `SET TIME ZONE 'UTC'`; without it every timestamp in the port would be
   shifted by the server's offset, and every row with a date would differ.
6. **`orWhere($column, null)` is `orWhereNull($column)` — and that was a DATA LEAK.**
   The active-projects filter chained one `orWhere` per role with `?->id`, so every role
   the caller did NOT hold added `column IS NULL`. An administrator with no professional
   profiles matched every project whose `selected_*` columns were empty: verified live,
   an admin token returned two demo projects the account neither owned nor worked on,
   **with their titles**. `fromActiveProjects` now adds a clause only for a profile the
   user actually has, and `tests/ActiveProjectsLeakTest.php` pins both halves — the
   outsider sees nothing, and the owner still sees their own project.
7. **`planning` and `contract_pending` are not `projects.status` values.** Ten filters in
   `ProjectController` listed them. MySQL ignores an unknown literal inside `IN (…)`;
   PostgreSQL raises. They are gone from the PROJECT filters (they remain on the BID
   filters, where `contract_pending` is genuinely a member).
8. **A voided ledger row is not a movement.** The ETL refused the live duplicate
   (Rp 5 500 000, voided in place with its amount zeroed) because the target's CHECK
   constraints required a positive amount and a reference. The constraints now exempt
   `voided_at IS NOT NULL`, because the alternative — dropping the row — deletes the
   audit trail that explains the money.

## 5d. The next endpoint: the paginator

`GET /api/admin/disputes` is the next handler, and it introduces the one shape the
previous three did not have: **Laravel's `LengthAwarePaginator`**. Thirteen keys, in this
order, and the order is the contract:

```
current_page, data, first_page_url, from, last_page, last_page_url,
links, next_page_url, path, per_page, prev_page_url, to, total
```

`links` is `[previous] + window + [next]`, where each entry is
`{url, label, page, active}` and the arrows' labels contain the HTML entities
`&laquo;` / `&raquo;` **unescaped** (Laravel does not entity-encode them inside JSON). An
empty page has `from` and `to` = `null` and `total` = 0 — which is what the live database
will give you, so seed a dispute before you trust the comparison.

The window is Laravel's `UrlWindow` with `onEachSide = 3`:

| last page | window |
|---|---|
| `< 14` | every page |
| `current <= 7` | `1..7`, `…`, `last-1, last` |
| `current >= last-6` | `1, 2`, `…`, `last-6..last` |
| otherwise | `1, 2`, `…`, `current-2..current+2`, `…`, `last-1, last` |

An ellipsis entry is `{url: null, label: "…", page: null, active: false}`.

**The URLs are the CALLER's.** `path` and every `*_page_url` come from the request, not
from configuration — which is why `shadow-lib.mjs` normalises each stack's own origin
before comparing. Keep that; it is not a workaround, it is the contract (a proxy makes
both stacks see one host in production).

The row itself is `ProjectDispute` plus three eager loads with column subsets:

```
project:id,title,status,budget      opener:id,name,pic      resolver:id,name
```

and `disputed_amount` is cast to **float** by the model, so it encodes as
`5000000`, not `"5000000.00"`. `resolved_at` is a datetime cast.

The status order is MySQL-specific: `orderByRaw("FIELD(status,'open','resolved','dismissed','withdrawn')")`.
PostgreSQL has no `FIELD` — use `array_position(ARRAY[...]::text[], status)`.

When the handler matches, add one line to `PORTED` in `tools/parity/shadow-all.mjs` and the
gate will hold it from then on.

## 6. The traps

`AGENTS.md` lists 13 production traps. Each is a rule in the new codebase, not a
warning:

| Trap | Where it lives now |
|---|---|
| #1 `shouldBeStrict` in dev only | Go: a nil `*string` on a `NOT NULL` column is a scan error, always |
| #2 `pm_id` is a user id, others are profile ids | **Resolved** — every `selected_*` is a profile id (ADR-0015); `identity.UserID` and `identity.ProfileID` are distinct types |
| #3 `syncProjectLegalScope()` is called statically | Becomes an explicit service call, in the transaction |
| #4 Policies auto-discover by convention | Go: the authz check is a **function**, and the function is in the route registration — visible in the route dump |
| #5 Two storage disks | `platform/storage` — `Public()` and `Vault()`, with `VAULT_DISK` honoured |
| #6 `apply-octane-patches.php` mutates `vendor/` | **Gone** — there is no Octane and no vendor patching |
| #7 The SPA catch-all swallowed `/api/*` | The Next.js router has no catch-all for `/api`; the BFF is explicit |
| #8 ENUM writes must be in the list | Native PostgreSQL enums (ADR-0007) |
| #9 Never `MODIFY COLUMN` an ENUM | `ALTER TYPE … ADD VALUE` — catalog-only, no rebuild |
| #10 Never drop a composite index whose leading column is an FK | **PostgreSQL does not adopt indexes for FKs** — so the rule inverts: every FK **must** have an index, and `cmd/schemadiff` asserts it (ADR-0006) |
| #11 An empty `up()` is a landmine | Every migration does something; `go-migrate` CI job runs `up → down → up` |
| #12 Money goes through `ProjectFinancialService` | `escrow.record_movement()` — a **database privilege** (ADR-0020) |
| #13 `migrate --force` on every replica start | A PostgreSQL **advisory lock** in the migration runner (ADR-0017) |

---

## 7. Related documents

| Document | What it adds |
|---|---|
| `docs/REWRITE-PLAN.md` | The master plan, the slices, the runbooks |
| `docs/MONEY.md` | The escrow model, the 50 invariants |
| `docs/STACK.md` | The pinned versions and the version policy |
| `docs/PARITY.md` | The live, generated parity matrix |
| `docs/adr/` | The 22 decisions behind all of this |
| `docs/PORTING.md` | This document |
