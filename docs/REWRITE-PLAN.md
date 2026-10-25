# 4Ceria Rewrite — Master Plan

**Status:** Active · **Owner:** Davin Akmal Yasha
**Decision record:** `docs/adr/` (22 ADRs) · **Stack:** `docs/STACK.md` · **Money model:** `docs/MONEY.md` · **Porting guide:** `docs/PORTING.md` · **Live parity matrix:** `docs/PARITY.md` (generated)

---

## 0. What this document is

The plan to rewrite **4Ceria Portal** from **Laravel 13 + MySQL 9.6 + React 19/Vite SPA**
into **Go 1.27.2 + PostgreSQL 17 + Next.js 16**, with two hard requirements:

1. **100 % feature parity.** All 296 API endpoints, all 285 frontend components, all
   11 end-to-end user journeys, every domain invariant, every notification type, every
   upload class, every scheduled job. Nothing is dropped. Nothing is silently
   "simplified". The parity is *machine-checked*, not asserted.
2. **Byte-identical design.** Every screen renders the same pixels as the current
   application. Not "close" — identical, with a zero-tolerance visual-regression gate
   whose baseline can only be changed through an accepted ADR.

The third requirement, which follows from the first two:

3. **The current application stays alive and green for the entire rewrite.** It is the
   oracle. Its 546-test Pest suite and its React SPA are the judges of the port, not
   casualties of it. The rewrite is a strangler, not a demolition.

---

## 1. The measured baseline

Everything below was measured against `main` at `4b610b7`, not estimated.

| Surface | Measure | How measured |
|---|---|---|
| PHP application | **205 files / 33 547 LOC** | `find app -name '*.php'` |
| Controllers | **65 files / 17 999 LOC** (54 % of `app/`) | `app/Http/Controllers/**` |
| ↳ largest | `ProjectController.php` **4 069 LOC / 39 methods** | |
| ↳ largest method | `ProjectBudgetController::markPaid` **295 lines / 9 branches** | PHP tokenizer |
| Services | 19 files / 4 772 LOC | `app/Services` |
| Models | 81 | `app/Models` |
| API Resources | 6 (the largest, `ProjectResource`, **1 608 LOC**) | `app/Http/Resources` |
| API endpoints | **296** | `php artisan route:list --json` |
| Web routes | 6 (incl. the SPA catch-all and the JSON 404) | `routes/web.php` |
| SPA | **327 files / 77 409 LOC** | `resources/js` |
| ↳ components | 285 files / 65 164 LOC (84 %) | |
| ↳ `components/Projects/Phases/` | 65 files / 22 468 LOC | |
| Migrations | **221 files** | `database/migrations` |
| Database | **98 tables / 1 345 columns / 338 indexes / 161 FKs / 44 ENUMs / 59 JSON** | live `information_schema` |
| Bid tables | 7 tables / 235 columns (27 universal, 22 role-specific) | |
| Pest suite | **46 files / 546 tests / 2 144 assertions** | `tests/` |
| ↳ mocking | **zero** — no Mockery, no `shouldReceive`, no `swap()` | `grep` |
| Vitest suite | 2 files / 20 tests | `resources/js/test` |
| TypeScript | 96 errors (ratchet baseline), 1 721 eslint warnings | `typecheck-baseline.json` — **re-measured** under TypeScript 7 in W1–W2 (ADR-0011) |
| Git history | **401 commits**, 2025-02-26 → 2026-10-02, one author | `git log` |
| ↳ shape | 91 `feat:`, 43 `fix:`, 33 `fix(api):`, 19 `ui:`, 17 `fix(security):` | |
| ↳ peak | 2026-04 (81), 2026-06 (99), 2026-09 (91) | |

**Domain scale:** 7 licensed professional roles (arsitek, kontraktor, notaris, interior,
structural, mep, project_manager) + owner + 6 sub-contractor trades + admin + supplier +
logistics = **17 `role_type` values**. 16 bid status transitions. 11 project lifecycle
phases. 98 tables. 296 endpoints.

This is a system with real depth, and the rewrite must preserve all of it.

---

## 2. The three false-green layers

Before anything is rewritten, three things must be understood, because they determine
how the rewrite is *verified*.

### 2.1 CI has never run the PHP half of the suite

`.github/workflows/ci.yml:106` uses `redis/redis-stack-action@v1`. **That repository does
not exist.** GitHub fails the job at *action resolution* — before checkout, before
install, before a single test. The `schema` job compounds it: it provisions an **empty**
MySQL and runs `php artisan schema:verify` with **no `migrate` step**, and
`VerifySchemaCommand.php:80` guards:

```php
if (! Schema::hasTable('migrations')) {
    $this->error('The `migrations` table does not exist. Run `php artisan migrate` first.');
    return self::FAILURE;
}
```

`gh run list` confirms: **every CI run since 2026-09-28 is red.** The 546 tests, the
2 144 assertions, the migration-reversibility check — none of them have ever executed in
CI. `main` has **no branch protection**, so the red blocked nothing. Only the `spa` job
(typecheck ratchet + vitest + eslint + both builds) and the secret scan have ever been
green.

**Consequence for the rewrite:** the legacy suite cannot serve as an oracle until it
runs. Fixing CI is Week 1, not a nice-to-have.

### 2.2 `composer verify` is a green no-op

`composer.json:62-63`:

```json
"verify": ["@php scripts/verify.ps1"]
```

`@php` runs `php scripts/verify.ps1`. `verify.ps1` is **PowerShell**. PHP has no `<?php`
tag in it, so PHP prints the file's source and exits `0`.

```
$ php scripts/verify.ps1
<#
.SYNOPSIS
    One-shot local verification gate. Mirrors .github/workflows/ci.yml.
...
composer verify EXIT = 0
```

**Zero checks run. The gate reports success.** `AGENTS.md` claims it "runs steps 1-8
locally"; that is false. A reviewer who runs `composer verify`, sees green, and moves on
has been told a lie by the repository.

### 2.3 The docs have drifted from the code

Verified false statements, each checkable in 60 seconds by a reader:

| Documented | Reality |
|---|---|
| `FINAL-SWEEP.md`: "`jspdf` and `html2canvas` are still eagerly loaded" | Both are lazy — `vite.config.js:56-58` excludes them, and the committed `dist/` has no modulepreload for either. |
| `FINAL-SWEEP.md`: the `MaterialController` cache key was whitelisted | It hashes `$request->all()` — an unbounded key space on an **unauthenticated** route. |
| `FINAL-SWEEP.md`: all 14 redundant `bids_*` indexes are undroppable | **3 are exact duplicates on non-FK columns** and are droppable. The other 11 are FK backing stores. |
| `FINAL-SWEEP.md`: 539 tests | 546. |
| `README.md`: "the map on the bidding board needs a tile-provider key (`VITE_MAP_TILE_KEY`)" | **That variable does not exist anywhere in the codebase.** The map uses a keyless CartoDB raster URL. |
| `docs/ARCHITECTURE.md`: "Migrations: 240 files" | 221. |
| `docs/ARCHITECTURE.md`: Octane/FrankenPHP in production | It is **nginx + php-fpm**. Octane is local-dev only. |
| `docs/DOMAIN.md`: "a dispute refund writes a negative `refund` row attributed to the **PAYMENT** (not the dispute)" | **Inverted.** `reference_*` is the **dispute**; `reverses_*` is the payment. |
| `docs/DOMAIN.md`: the unique index "allows exactly ONE `payment` and one `refund` per referenced payment" | Since `2026_09_29_000003` a refund's reference is the **dispute**: one refund per dispute, any number against a payment. |
| `docs/CONVENTIONS.md`: contracts/KYC/private → `Storage::disk('railway')` | The code uses `Vault::disk()` (15 sites). Following the doc produces a broken local test. |
| `docs/CONVENTIONS.md`: "prefer `HandlesProjectAuthorization`" | That trait is a thin alias over `App\Support\Hire`, which is the actual rule. |
| `docs/API_MAP.md`: the consultation routes were removed | They are **live** (`routes/api.php:68-70`). |
| `routes/api.php:81`: "the live registration flows are `POST /register` and **`POST /pro-register`**" | `/pro-register` does not exist. |
| `AGENTS.md`: "CI runs the same list" | The PHP half of CI has never run. |
| `AGENTS.md`: "`composer verify` runs steps 1-8 locally" | It is a no-op. |

**Consequence for the rewrite:** the documentation set is a *trust surface*. A rewrite
that produces more confident-looking but equally unverified documentation is worse than
no rewrite. Every claim in the new docs must be **generated or tested**.

---

## 3. The 16 verified live defects

Found by four independent audits plus direct verification. Each is fixed **in the
Laravel app first**, because the oracle must be correct before it judges the port. The
repo's established style applies: *revert the fix and confirm the new test fails.*

| # | Defect | Severity | Location |
|---|---|---|---|
| **B1** | `Project::selectedKontraktor` **does not exist** → `GET /api/admin/projects` returns **500**; `POST /api/admin/projects/{p}/force-terminate` commits `status='cancelled'` **and then** throws (silent state change behind a 500) | Critical | `Project.php` (44 relations, not that one) · `AdminDashboardController.php:72,181` |
| **B2** | `Project::selectedArsitek()` is `belongsTo(User::class,'selected_arsitek_id')` — it joins `users.id` to an **`arsiteks.id`**. Live value 6634 has no `users` row ⇒ **the relation always resolves to null**, and the admin dashboard would show a *different person* as the project's architect | Critical | `Project.php:226-229` vs `ProjectController.php:1682` |
| **B3** | The 7 `accepted_*_bid` Resource blocks read the relation **directly**, bypassing `visibleBids()` → any authenticated user reads a competitor's fee, pitch and **third-party staff names** via `GET /api/projects?feed=true&with_bids=true`. A direct regression of the CRITICAL that `FINAL-SWEEP.md` closed | High | `ProjectResource.php:1090,1103,…` (7 sites) |
| **B4** | **Live ledger double-count.** `project_budget_transactions.reference_model` holds **two spellings** of the same model — `'ProjectAddendum'` and `'App\Models\ProjectAddendum'` for the *same* `(project, reference_id, transaction_type)`. The unique index therefore **cannot dedupe them**, and the same Rp 5 500 000 payment is counted twice. `paidTotalMoney()` sums every disbursement row ⇒ the escrow is understated by Rp 5 500 000 on that project. The `2026_08_25` normalisation migration's `NOT EXISTS` guard refuses to rename the short-named row *precisely when the FQCN twin exists*, so the duplicate survives **by design** | Critical | live rows 5619 & 5918 |
| **B5** | `config/bids.php` declares `project_user_key => 'selected_arsitek_id'` for all six non-PM roles — it claims a **user** id. The live data says **profile** id. The registry is wrong for **6 of 7 roles** | High | `config/bids.php` vs live DB |
| **B6** | 18+ unguarded `$e->getMessage()` reach clients (a `QueryException` message contains the full SQL and bindings). 4 of them also set the HTTP status from `$e->getCode()`, which for a `QueryException` is the **SQLSTATE string** `'HY000'` → an invalid status | High | 18 sites across 12 controllers |
| **B7** | 6 hardcoded `'railway'` disk literals bypass `Vault::disk()` → KYC scans, **payment receipts**, **dispute evidence** and requirement images write to the wrong disk (or silently fail, since the `railway` disk has `'throw' => false`) | High | `ProfileController:262,277` · `ProjectRequirementController:50,101` · `DisputeService:170` · `PaymentVerificationService:121` |
| **B8** | `ProjectResource::isPrivatePath()` matches only `receipts/` → the **immutable SPK contract**, requirement images and vault documents get **public-bucket** URLs. Broken link today; disclosure the moment the buckets merge | High | `ProjectResource.php:1539-1542` |
| **B9** | `MaterialOrder` `refunded` is not terminal → a supplier can flip a refunded order back to `paid` | Medium | `MaterialOrderController.php:121` |
| **B10** | `TRUSTED_PROXIES=*` is **accepted in production** → re-enables the `X-Forwarded-For` rotation that `b460e8d` closed; the `/login` and `/register` throttles become decorative | Medium | `AppServiceProvider.php:100-102` |
| **B11** | `clientSignContract` accepts an unbounded, unvalidated signature payload — asymmetric with the hardened professional path (which has a 1.5 MB cap and an image regex) | Medium | `ProjectController.php:3809` |
| **B12** | `postDeliveryJob` lets the **supplier** name the courier's fee with no tariff cap (the sibling paths cap it) | Medium | `MaterialQuoteController.php:424-428` |
| **B13** | `MaterialController`'s cache key hashes `$request->all()` → an **unbounded Redis key space** on an unauthenticated route | Medium | `MaterialController.php:26` |
| **B14** | `LocationPickerMap.tsx` hardcodes `fetch('/api/geocode/…')` → **broken in the Vercel standalone build** (the API is on another origin) | Medium | `LocationPickerMap.tsx:26,99` |
| **B15** | `useProjectTabsData.ts`'s module-level caches and `api.js`'s `apiCache` are **never cleared on logout** → user B on the same device sees user A's project data for up to 60 s | Medium | `useProjectTabsData.ts:16-18` · `api.js:58` |
| **B16** | `useExploreHouses.ts:165` calls `setWishlist`, which **does not exist** → `ReferenceError` if reached (it is also a live `tsc` error) | Low | `useExploreHouses.ts:165` |

**Plus a schema-level set — and this one was WRONG when it was written.** The plan
said "30 no-op migration stubs still on disk **and still recorded as applied**, while the
recovery migration's docblock claims *'the stubs themselves have been deleted'* — **that
claim is false**". It was measured on 2026-10-20: `debug_noop_migrations.php` counts
**0** migrations with an empty `up()`, and the `migrations` table and the disk agree
exactly — 221 recorded, 221 on disk, no orphans in either direction. The stubs WERE
deleted, the recovery migration's docblock was telling the truth, and `AGENTS.md` trap 11
was stale. The 221-migration **round-trip** was the real gap, and it was a big one: seven
`down()` methods had never been executed, and `migrate:reset` failed on the first of them
(MySQL error 1553). That is fixed, and the round-trip is now a CI gate.

---

## 4. Target architecture

```
                        ┌──────────────────────────────────────────────┐
  Browser / PWA   ───▶  │  cmd/gateway  (Go) — the only edge process   │
                        │  • routing/routes.yaml → upstream per route  │
                        │  • hot-reload on SIGHUP (no restart)          │
                        │  • shadow comparator (GET only)                │
                        └────┬────────────────────────┬────────────────┘
                             │ upstream=laravel       │ upstream=go
                             ▼                        ▼
                    ┌─────────────────┐      ┌──────────────────────┐
                    │ Laravel 13      │      │ Go 1.27.2 API        │
                    │ (legacy, shrinks)│      │ (chi + pgx + sqlc)   │
                    └────────┬────────┘      └──────────┬───────────┘
                             │                          │
                    ┌────────▼────────┐      ┌──────────▼───────────┐
                    │ MySQL 9.6       │      │ PostgreSQL 17        │
                    │ owner: mysql    │◀────▶│ owner: pg            │
                    └─────────────────┘  ETL └──────────────────────┘
                             (ownership-driven, per-table, reversible)
```

Plus a fourth deployment: **`web/` — the Next.js 16 app**, which talks to the gateway
over a same-origin BFF proxy. The browser never sees a token and never talks to the
API directly.

### 4.1 `routing/routes.yaml` — one source of truth

All 296 routes are declared **once**. Three consumers read it: the Go router, the
gateway, and `tools/parity`. Flipping traffic is a one-line commit plus `SIGHUP`.

```yaml
version: 3
defaults: { upstream: laravel, tier: 2 }
routes:
  - { method: POST, path: /api/projects/{project}/budget/mark-paid,
      upstream: go, tier: 1, handler: finance.MarkPaid,
      middleware: [auth, freeze_pending_termination, rate:api] }
```

**Rules that make the map authoritative:**
- A route is in the map or it does not exist. `tools/parity` fails on any Laravel route
  absent from the map **and** any map route absent from Laravel. There is **no allowlist
  and no "known gap" escape hatch** — all 296 are ported.
- `upstream` is the *only* switch that moves traffic. It is data, not code.
- `tier` is the parity strength (see §5.2), declared per endpoint.

### 4.2 The database during the transition — ownership, not dual-write

```
routing.table_ownership
  table_name | owner | direction
  users      | mysql | mysql -> pg
  projects   | pg    | pg -> mysql
  bids       | pg    | pg -> mysql
```

- **Invariant 1 — single writer per table, always.** The ETL's direction is *derived from*
  the owner row, so it can never overwrite the owner's writes. No distributed
  transaction exists anywhere.
- **Invariant 2 — enforced in the database.** When a table flips to `owner=pg`, a MySQL
  trigger rejects writes from the legacy app:
  ```sql
  CREATE TRIGGER trg_pg_owned_projects BEFORE UPDATE ON projects
  FOR EACH ROW BEGIN
    IF CURRENT_USER() = 'laravel_app' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
        '4Ceria: table projects is owned by postgres; laravel_app may not write it';
    END IF;
  END;
  ```
  The Go service's Postgres role has no DML on MySQL-owned tables; the grants are
  asserted in CI.
- **Invariant 3 — the ETL is bidirectional**, so after a flip MySQL remains a complete
  rollback mirror. Rollback becomes a copy plus a map edit, not a data-recovery incident.
- **Invariant 4 — `users` and `personal_access_tokens` stay in MySQL** for the whole
  transition (ADR-0018).

**Slice boundary rule:** *a slice may not contain an endpoint that writes another
stack's tables.* Consequence: **the project domain is one indivisible cluster** — a
`mark-paid` writes a bid row, a termin row, a ledger row **and** `projects.budget`. It
moves as one piece or not at all.

### 4.3 The shadow comparator

The gateway sends a **sampled copy** of every read routed to `go` **also** to `laravel`
(the legacy handler is still deployed at cutover) and compares status and **response
shape** (key set, per-key type, nullability; timestamps excluded). Values are compared
for deterministic GETs.

**Writes are never shadowed** — a shadowed `mark-paid` would double-write the ledger.
Write parity is proven by the golden files, the replay corpus and the legacy oracle.

**Promotion rule:** a route flips to `upstream: go` only after **0 shape mismatches over
≥ 1 000 sampled requests** for that route *and* a green golden file. Shadowing continues
for **72 hours** post-cutover with the legacy container still deployed; a mismatch rate
above 0.1 % triggers automatic rollback. The legacy code is deleted in a **later,
separate PR** — never in the cutover PR.

---

## 5. The parity contract

### 5.1 P-1 … P-6 — what "identical" means

| | Rule |
|---|---|
| **P-1 SETTLED STATE** | The compared artefact is the DOM after all entry animations complete, all webfonts loaded (`document.fonts.ready`), all in-viewport images decoded, at **1440×900**, pinned scroll offset, pinned `TZ`, pinned browser locale. Transient frames (the `React.lazy` spinner, `animate-spin`) are **excluded** — they are non-deterministic by construction. |
| **P-2 PIXELS** | For each route × role-state, the port's settled screenshot is **pixel-identical**: `maxDiffPixels: 0`, `maxDiffPixelRatio: 0`, `threshold: 0` (the antialiasing tolerance is disabled). **One changed pixel fails the build.** |
| **P-3 STRUCTURE** | The DOM tree is **node-for-node identical** in tag, attribute set, class list and order, except for an explicitly whitelisted delta list. |
| **P-4 DATA** | The port renders the **same values** as the baseline for the same seeded dataset — *including the currently-wrong escrow figure* (§6.3). |
| **P-5 BEHAVIOUR** | The port produces the same **network request sequence** (method, URL, body, order) and the same **side effects** (storage writes, cookie writes, navigation, toasts). This is the *"looks right but behaves differently"* gate. |
| **P-6 EXCLUSIONS** | Transient loading states and animation *timing* are excluded from P-2 but **not** from P-5. |

### 5.2 Tiers

| Tier | Meaning | Applies to |
|---|---|---|
| **1** | **Byte-identical** — status, JSON key set, value types, error bodies, **and the same side-effect rows** | money, auth, disputes, contracts, admin |
| **2** | **Shape-identical** | CRUD, lifecycle, marketplace |
| **3** | **Compatible** — same semantics, field names may differ | public directories, chat, notifications |

### 5.3 Six mechanisms, each catching a different class

| # | Mechanism | Catches | Gate |
|---|---|---|---|
| 1 | **Route-set equality** — Laravel `route:list --json` vs the Go router's *declared* set vs its *live* registered set vs `routing/routes.yaml`. A YAML entry the binary never registers is a **FAIL**, not a warning. | renamed / forgotten / phantom endpoints (AGENTS.md trap 7) | `go-parity` |
| 2 | **Middleware + authz parity** — normalised middleware set per route (`auth:sanctum`→`auth`, `throttle:5,1`→`rate:5/m`, `admin`→`admin`, `freeze_pending_termination`→`freeze_termination`). Any drift = FAIL. | authorization drift — the #1 recurring bug class in this repo's history | `go-parity` |
| 3 | **URI classification, three-way** — 2 000 URIs (every route with sentinels **plus adversarial near-misses** like `/bids/2` vs `/bids/2/negotiate` vs `/bidsxx`) resolved through the **real Laravel router** (`Route::getRoutes()->match()`), the Go mux and the gateway. All three must agree. | greedy-regex / wrong-handler 404s | `go-parity` |
| 4 | **Golden-file contracts** — `php artisan contract:capture --all` records request + response + **side-effect rows** against a seeded fixture. The Go side asserts against them. **Never hand-written.** | every field-level drift | `go-parity` + Go tests |
| 5 | **Visual regression** — §7 | every pixel | `visual-regression` |
| 6 | **Assertion-count floor** — the legacy job fails if tests < 546 or assertions < 2 144. Each ported endpoint's Laravel assertions are **added** to the Go suite and the floor is **raised** in the same PR. | "we fixed it by deleting the test" | `legacy-php` |

### 5.4 The parity tiers are per endpoint, and published

`docs/PARITY.md` is **generated** from the tooling, committed, and CI-enforced. A
hand-edit is a CI failure. It is the live answer to "is the rewrite done?" and the
primary artifact of the portfolio case study.

---

## 6. The money model

Full specification: **`docs/MONEY.md`**. The five decisions that matter:

1. **Integer minor units.** `App\Support\Money` (575 LOC) ports to ~400 lines of Go.
   The DB keeps `numeric(24,2)`.
2. **Two PHP rounding bugs are fixed in the port.** `intdiv($minor*$bp + 5000, 10000)`
   truncates *toward zero*, so the offset can only push **up**: `-Rp 1.00` at 5 % gives
   `-Rp 0.04`, not `-0.05`. And `TerminPlanService` accumulates percentages in **float**.
   Go uses `mulDivRoundHalfAwayFromZero` on 128-bit and `int64` basis points.
3. **The double-charge guard becomes atomic.** `INSERT … ON CONFLICT (project_id,
   reference_type, reference_id, transaction_type) WHERE reference_id IS NOT NULL DO
   NOTHING RETURNING id`, decided **inside** the `FOR UPDATE` lock on the project row.
   Zero rows returned ⇒ duplicate ⇒ idempotent success, **no ceiling move, no platform
   fee**.
4. **The reference vocabulary becomes a registry**, not a string. A `smallint` FK
   (`ledger_reference_types`) replaces the polymorphic `varchar` whose two spellings
   caused defect **B4**. The migration proves the mapping is **total** before it
   proceeds.
5. **The invariant moves into the database.** `escrow.record_movement(...)` is a
   `SECURITY DEFINER` function; `REVOKE INSERT, UPDATE, DELETE ON
   project_budget_transactions FROM app_rw`. "Never write a ledger row directly" becomes
   a database privilege, not a code convention (ADR-0020).

### 6.1 The three escrow type-lists (unchanged, now one declaration)

```go
var DisbursementTypes         = []TxType{TxPayment, TxRefund, TxPlatformFee, TxRetentionRelease}
var CeilingNeutralTypes       = []TxType{TxPayment, TxRefund, TxPlatformFee, TxRetentionRelease}
var ProfessionalEarningsTypes = []TxType{TxPayment, TxRefund, TxRetentionRelease} // excludes platform_fee
var StructuralTypes           = []TxType{TxDeposit, TxAdjustmentDown}
```

The `type != 'payment'` test is what double-subtracted `platform_fee` and
`retention_release`. The membership test is the fix.

### 6.2 The unified `bids` table

7 tables → 1. 235 columns → 55. `bidder_user_id` is the authoritative identity (globally
unique); `bidder_profile_id` is preserved verbatim for the audit trail. The role-specific
columns stay **real nullable columns** — four are money and two are read by the bid card.

The byte-compat shim keeps the SPA's seven separate bid arrays (`bids_arsitek`, …) from
**one** query, so the frontend does not change at all.

### 6.3 The client/server escrow conflict, resolved

`docs/CONVENTIONS.md:25` forbids client-side escrow arithmetic, and
`ProjectBudgetManager.tsx:175-190` does exactly that (it double-counts deposits, which
the server's ceiling already includes). **But P-4 says the number must not change.**

> **The server computes and returns BOTH figures.** The parity phase renders the
> `legacy` block — bit-identical to the current client formula. The `canonical` block is
> the server's truth and is rendered only in the post-parity money fix, which is a
> separate signed-off change with a delta report (ADR-0022).

The shim is fenced: it lives in its own `legacyEscrowPayload()` method with a
`@deprecated` docblock, a CI check asserts it is consumed only by
`web/src/lib/money/legacyEscrow.ts`, and a Pest test asserts `legacy !== canonical` on a
deposit fixture — so the shim can never silently become the truth.

---

## 7. The visual-parity protocol

### 7.1 The baseline decision (ADR-0004) — and when it is captured

**The baseline is the Laravel-served build** — Tailwind + `index.css` + Google Fonts.

The standalone Vercel build currently ships **no Tailwind and no fonts**:
`dist/index.html` links only `index-DnKoKolg.css` (15 155 B, **0** `--tw-` variables);
the 206 039 B Tailwind output `app-BBqVl-Xr.css` is referenced only by `sw.js` and
`manifest.json`, by no HTML. Root cause: `vite.config.js:90` adds
`resources/css/app.css` as a **separate `rollupOptions.input` entry**, and Vite emits a
CSS-only entry without injecting a `<link>`. The Laravel mode works because
`@vite(['resources/css/app.css','resources/js/app.tsx'])` emits an explicit `<link>` per
entry.

> ⚠ **`vite.config.js:82-89` claims this was fixed. It was not.** The comment
> diagnoses the symptom correctly — *"the frontend Vercel serves shipped with NO
> Tailwind at all"* — and then prescribes adding `app.css` to the input list, which is
> what it already does. **Vite never injects a `<link>` for a CSS-only entry.** The
> committed `dist/` is the proof. The real fix is to import the CSS from the JS entry
> so it enters the HTML entry's module graph (§7.2).

So the Vercel deployment today renders a **different UI** from the Laravel-served build.
The port reproduces the **intended** design, and the CSS-entry bug is fixed as part of
the Tailwind 4 upgrade (ADR-0010) — one change, two problems closed.

**The baseline is captured against the *upgraded* application.** The ordering is:

```
W1–W2   the legacy app is upgraded to Tailwind 4.3.3 and TypeScript 7.0.2
        (ADR-0010, ADR-0011) — each its own PR, each with its own delta report
W3      the visual baseline is captured against the upgraded app
W3+     the Next.js port reproduces Tailwind 4 / TypeScript 7 exactly
```

The upgrade lands in the legacy app **first** because the baseline must describe one
consistent design. If the legacy app were Tailwind 3 and the port Tailwind 4, there
would be no single baseline to compare against — the gate would either fail on every
screen, or be quietly re-baselined until it meant nothing. Upgrading first also keeps
the port's job **"reproduce"** rather than **"reproduce *and* upgrade"**, so a pixel
difference always has exactly one possible cause.

### 7.2 The cascade is load-bearing

`resources/css/index.css:1`:
```css
* { font-family: "Plus Jakarta Sans", sans-serif; margin:0; padding:0; box-sizing:border-box; scroll-behavior:smooth; }
```

Under **Tailwind 3.4** — which emits **no `@layer` at-rules** (verified:
`grep -c "@layer"` on the built CSS → 0) — the cascade resolves by **specificity, then
source order**:

| Selector | Specificity | Effect |
|---|---|---|
| `html { font-family: ui-sans-serif, … }` (preflight) | (0,0,1) | beats `*` — but only on `<html>` |
| `* { font-family: "Plus Jakarta Sans" }` (index.css) | (0,0,0) | applies **directly** to every element ⇒ **beats inheritance** |
| `.font-sans` (utility) | (0,1,0) | beats `*` ⇒ **`Figtree, ui-sans-serif, system-ui, …`** |

`tailwind.config.js` sets `fontFamily.sans: ['Figtree', …]` but **Figtree is never
loaded**. So the app renders in **two font stacks**, and the "Figtree" stack resolves to a
*platform* font (18 `font-sans` usages, including `Dashboard.tsx:236`, `LandingPage`,
`Login`, `Register`, `Docs`, `ContractSignModal`).

**Under Tailwind 4** the cascade becomes a **real** `@layer theme, base, components,
utilities` — so the ordering requirement is now expressible directly rather than
relying on source order:

```css
/* resources/css/app.css */
@import "tailwindcss";
@plugin "@tailwindcss/forms";

/* The project's own purge bug: classes defined in .ts files (STATUS_CONFIG,
   preset colours) were purged from production CSS — chips rendered unstyled.
   The globs must be EXPLICIT, not left to auto-detection. */
@source "../../resources/js/**/*.{ts,tsx}";
@source "../../resources/views/**/*.blade.php";

@theme {
  --font-sans: Figtree, ui-sans-serif, system-ui, sans-serif;
}

/* The custom reset must land AFTER Tailwind's base layer — the `*` selector
   must keep applying directly to every element, and the navbar's
   `.custom-navbar-container { z-index: 1000 }` must keep beating the
   `z-100` utility on Navbar.tsx:53. */
@layer base {
  /* resources/css/index.css, inlined or imported */
}
```

**Three hard requirements fall out, and they survive the upgrade:**

- **`index.css` must be emitted after Tailwind's base layer.** Its
  `.custom-navbar-container { z-index: 1000 }` **beats** the `z-100` utility on
  `Navbar.tsx:53`. Reversing the order changes the navbar's stacking — visibly.
- **The CSS must be in the HTML entry's module graph.** `resources/js/app.tsx:6` already
  imports `../css/index.css`; the Tailwind entry must be imported the same way, so
  Vite emits **one** CSS asset and **one** `<link>`:
  ```ts
  import '../css/app.css';    // Tailwind — MUST come first
  import '../css/index.css';  // the custom reset — MUST come after
  ```
  This is the fix for the Vercel no-Tailwind defect (§7.1).
- **The harness must pin the platform fonts**, or the baseline is machine-dependent.

### 7.3 The harness

| Element | Choice | Why |
|---|---|---|
| Browser | **Pinned Chromium** (`web/playwright/package-lock.json`) | Chromium's rendering is the largest source of false-positive diffs |
| Viewport | 1440×900, `scale: 'css'`, `deviceScaleFactor: 1` | |
| Clock | **Frozen** — every seeded timestamp = `2026-01-15T09:00:00+07:00` | |
| TZ / locale | `TZ=Asia/Jakarta`, `LANG=C.UTF-8` | |
| Fonts | **Pinned** in the harness image: Plus Jakarta Sans + a pinned Figtree substitute | §7.2 |
| Images | **Checked-in solid-colour PNGs**, never random | |
| Money | Fixed values in the frozen seed | |
| Animations | `animations: 'disabled'`, `caret: 'hide'`, `threshold: 0` | `animate-spin` never settles |
| Storage | MinIO (S3-compatible) for the private vault | deterministic object URLs |

### 7.4 Coverage

**17 routes + 39 dashboard tabs + 11 project-workspace tabs + 8 phases + 60 overlay
surfaces** (37 `*Modal*.tsx` + 23 other `fixed inset-0` shells) **+ 11 journeys × role
states.** Every one gets a baseline. A new screen without a baseline is a **FAIL**.

### 7.5 The ADR gate (ADR-0021)

```
if ! git diff --quiet -- web/visual/baseline; then
  echo "::error::A visual baseline changed in this PR."
  # Requires: (1) a new docs/adr/ADR-NNNN-*.md with "Status: Accepted"
  #           (2) an ADR section titled "Visual baseline" naming the screens
  #           (3) the PR body containing the token "visual-baseline: regenerated"
  #           (4) CODEOWNERS approval on web/visual/baseline/**
  exit 1
fi
```

**A baseline may only change through an accepted ADR.** That is the mechanism that makes
"NO CHANGE AT ALL" enforceable rather than aspirational.

---

## 8. Slices

Nineteen slices covering **all 296 endpoints**. Each is independently verifiable and
independently reversible.

| # | Slice | Endpoints | Tables | Target |
|---|---|---|---|---|
| S0 | Health, auth, profile, KYC, notifications, push | ~25 | 8 | W05 |
| S1 | Public directories, house listings, geocode | ~18 | 6 | W06 |
| S2 | Projects, bids, negotiation, invitations | ~46 | 12 | W08 |
| S3 | Contracts, signing, legal scope | ~12 | 6 | W09 |
| S4 | Phases, milestones, handover, BAST, snags, warranty | ~40 | 12 | W10 |
| **S5** | **Money** — budget, termin, proof, retention, fee, addendum, change order | **~34** | 11 | **W12** |
| **S6** | **Disputes, arbitration, termination** | **~14** | 5 | **W13** |
| S7 | Requirements, procurement, documents, comments, activity, schedules | ~38 | 12 | W14 |
| S8 | Chat, favourites, uploads, portfolio, reviews | ~14 | 6 | W15 |
| S9 | Reports, sticky notes, daily logs, team/firm members | ~57 | 18 | W16 |
| S10 | Marketplace: materials, quotes, orders, suppliers, reviews | ~24 | 8 | W16 |
| S11 | Logistics, delivery jobs, courier | ~7 | 4 | W17 |
| S12 | Admin back-office, CSV export, force-terminate | ~17 | 9 | W17 |
| S13 | Chat relay + web push (deep) | — | — | W18 |
| S14–S19 | Domain splits of S7–S12 as they stabilise | — | — | W18–W20 |

### 8.1 Per-slice cutover runbook

| T | Action | Verification |
|---|---|---|
| **T-72h** | Snapshot both engines; record per-table row counts and row checksums for the slice | Snapshot files non-empty; checksum report archived |
| **T-24h** | Rehearse the runbook on a staging clone of production | `tools/verify-data --slice=S` green on staging |
| **T-30m** | Freeze writes: pause the legacy queue workers touching the slice. Reads continue | No active writers on the slice's tables |
| **T-20m** | Final delta copy, ordered by PK, resumable | Row counts equal; checksums equal |
| **T-5m** | Flip `upstream` in `routing/routes.yaml`; gateway hot-reloads. **Ownership rows still say `owner=mysql`** | `GET /internal/routes` shows the slice on `go` |
| **T+0** | **Smoke:** every tier-1/tier-2 endpoint in the slice | Exit 0 — **failure ⇒ auto-rollback** |
| **T+5m** | Flip table ownership; the ETL **reverses direction**. MySQL is now a live rollback mirror | A known row round-trips pg → mysql |
| **T+15m** | Data verification: row counts, row checksums, **and the escrow invariants recomputed on both engines** | `tools/verify-data --slice=S` exit 0 |
| **T+1h** | Decision point | Signed off |
| **T+72h** | Delete the legacy handlers in a **separate PR**; keep the `never-ported`/removed marker | `tools/parity` green |

### 8.2 Rollback — RPO 0, RTO in minutes

```
1. tools/rollback --slice=S
     a. pause the Go workers for the slice
     b. ONE-SHOT full copy pg -> mysql for the slice's tables (authoritative)
     c. UPDATE routing.table_ownership SET owner='mysql' WHERE table_name IN (...)
     d. flip routing.routes: upstream go -> laravel
     e. gateway SIGHUP
     f. tools/smoke --slice=S --upstream=laravel
2. Verify: row counts and checksums equal; the legacy suite green; the shadow comparator healthy.
```

**RPO = 0** because step (b) is a full authoritative copy *before* the ownership flip —
the Go stack's writes are never discarded, only re-materialised into MySQL.

**Rollback triggers:** 5xx > 0.5 % over 10 min · p99 > 2× the legacy baseline ·
**any escrow invariant violation** · any checksum mismatch · shadow mismatch > 0.1 % ·
any legacy-oracle failure · any authz differential. `AUTO_ROLLBACK=true` makes all but
the last two automatic; the last two always are.

---

## 9. CI — 22 required checks

Every `uses:` is first-party or **pinned to a 40-hex SHA**. A new `action-policy` job
**probes the GitHub API for every referenced action+ref and fails if the ref does not
exist** — the exact check that would have caught `redis/redis-stack-action@v1`.

| # | Job | Proves |
|---|---|---|
| 0 | `action-policy` | No floating refs; every action exists |
| 1 | `secrets` | gitleaks (pinned image, **not** a third-party action) + VAPID grep |
| 2 | `go-lint` | gofmt, `go vet`, staticcheck, golangci-lint |
| 3 | `go-test` | `go test -race` vs PostgreSQL 17; coverage ratchet |
| 4 | `go-fuzz` | money parser, JSON envelope, share token, ETL type mapping |
| 5 | `go-migrate` | `up → down → up`; `down` must be complete |
| 6 | `go-schema` | `cmd/schemadiff`: Go struct tags ↔ `information_schema`; every FK has an index |
| 7 | **`go-parity`** | route set + middleware + URI classification + golden files + replay shapes + cross-engine money; regenerates `docs/PARITY.md` |
| 8 | `money-diff` | PHP `Money` vs Go `money` differential corpus (2 000 cases) |
| 9 | `next-lint` | eslint + the typecheck ratchet (seeded at the legacy app's post-upgrade number, may only fall) |
| 10 | `next-test` | vitest |
| 11 | `next-build` | `next build` standalone + artifact assertions |
| 12 | **`visual-regression`** | pixel-identical to the committed baseline; zero tolerance; ADR-gated |
| 13 | `e2e` | 12 journeys × 3 shards vs the Go upstream |
| 14 | **`legacy-php`** | the 546-test oracle + the **546/2 144 assertion floor** |
| 15 | `legacy-spa` | the legacy SPA's vitest/typecheck/build, until retired |
| 16 | `legacy-mysql-parity` (nightly) | ETL fidelity + escrow invariants in both engines + a 1 000-row fuzz round-trip |
| 17 | `security` | govulncheck, `npm audit`, `composer audit`, osv-scanner across all three lockfiles |
| 18 | `codeql` | go + javascript-typescript |
| 19 | `sbom` | Syft (pinned image) → SPDX + CycloneDX; dependency review |
| 20 | `contract-freshness` | every `spec/` artefact regenerated; any diff = FAIL |
| 21 | `money-reconcile` | the escrow invariants, recomputed |

### 9.1 Rules encoded from the current CI's failures

- **Never split "provision" and "verify" across jobs.** The current `schema` job
  provisioned an empty MySQL and ran `schema:verify` with no `migrate` step — the check
  could never have been meaningful.
- **The cache driver is never shared between parallel workers.** `CACHE_STORE: array` in
  the legacy job (the current CI used `redis`, and four test files call `Cache::flush()`,
  which is a *global* wipe). Go: one PostgreSQL schema per package, `go test -p 1
  -parallel 1`.
- **The CI database image is the same major as production** — `mysql:9.6` (CI used 8.0)
  and `postgres:17`.
- **Never gate on a pipeline's exit status.** Capture the output, then decide on the
  captured string. The current `php -l` sweep failed *open*.
- **The race build and the non-race build get different cache keys** — they are different
  artifacts.
- **Playwright browsers are not cached** — a stale browser is a rendering difference.

---

## 10. Workstreams

| Track | Owner | W1 | W2–W3 | W4–W8 | W9–W14 | W15–W20 | W21–W24 | W25–W26 |
|---|---|---|---|---|---|---|---|---|
| **Go backend** | owner | fix CI + the 16 defects | money / escrow / identity / authz | S0–S2 | S3–S6 | S7–S13 | final cutover | — |
| **PostgreSQL** | subagent | baseline plan | 98-table schema + `spec/enums.yaml` + the collation decision | the ledger registry + the unified `bids` + backfills | the ETL + `cmd/schemadiff` + `cmd/etl` | fuzz + checksums | `users` + tokens → PG | — |
| **Next.js** | subagent | the visual harness | the shell + 39 real routes + BFF/cookie auth | the data layer + generated enums | the money layer + `lib/money` | all 285 components + a11y | retire the Vite build | — |
| **CI/tooling** | subagent | `routes.yaml` + `tools/parity` | `contract:capture` + the golden files | the `go-parity` job | the `visual-regression` job | `money-diff` + fuzz | the full matrix | — |
| **Legacy upgrade** | subagent | **Tailwind 4.3.3 + TypeScript 7.0.2 in the legacy app** (ADR-0010, ADR-0011) + the CSS-entry fix | the **visual baseline capture** against the upgraded app | the 96-error cleanup (ratchet falls) | — | — | — | — |
| **Docs** | owner | `REWRITE-PLAN.md` + the ADRs | `MONEY.md`, `PORTING.md` | — | — | — | `PARITY.md` | `CASE_STUDY.md`, the diagrams, the README, the demo data |

> **The legacy-upgrade track runs first, and it is a prerequisite for the baseline.** The
> Tailwind 4 and TypeScript 7 upgrades land in the legacy application in Week 1, each as
> its own PR with its own delta report. The visual baseline is captured against the
> **upgraded** app in Week 2–3, so the port has one coherent design to reproduce
> (§7.1). The CSS-entry fix (§7.1) ships with the Tailwind upgrade, which closes the
> live "the Vercel build ships no Tailwind" defect.

---

## 11. Risk register

| # | Risk | L×I | Mitigation | Early warning |
|---|---|---|---|---|
| R1 | **The rewrite ships worse than the original** | M×H | The **546/2 144 assertion floor** + the visual baseline + the golden files make "worse" *detectable*, not just feared | The floor being lowered; a baseline changed without an ADR |
| R2 | The **collation landmine** — MySQL is case-insensitive, PostgreSQL is case-sensitive. Miss it and login, every Sanctum token lookup, `projects.share_token` and the firm invite codes break **silently** | H×H | `citext` / ICU nondeterministic collation decided **per column family**, with a golden test per unique string index (ADR-0008) | The first auth test against PostgreSQL |
| R3 | The **ledger registry backfill** is not total → orphaned rows → the double-charge guard silently stops working | M×H | The `RAISE EXCEPTION` totality guard; one transaction; the reconciliation query must return 0 rows | The guard firing — that is the *good* path |
| R4 | The **visual baseline is machine-dependent** (the Figtree/system-font split) → false diffs → the team learns to ignore the gate | H×M | Pin the fonts in the harness image; pin Chromium; pin TZ | Diff noise on the first capture |
| R4b | The **Tailwind 4 upgrade** is a large, visible change and lands in the legacy app | M×M | Its own PR, its own delta report, before the baseline is captured; the CSS-entry fix ships with it (ADR-0010) | The delta report's diff is larger than expected |
| R5 | The **project domain is one indivisible cluster** — the money slice cannot be cut over early | H×M | Port the money *library* in W2 even though the money *endpoints* land in W12; the library is testable without the endpoints | — |
| R6 | `users` staying in MySQL gives the Go service a hard MySQL dependency for the whole transition | H×M | Bounded to five tables, read-only, removed at M11 | — |
| R7 | The **Next.js port changes pixels** in a way nobody notices (a font loads earlier, an image is re-optimised, the CSS order flips) | M×H | P-2 zero tolerance + P-3 DOM comparison + the §12 checklist; the CSS order is documented as load-bearing | The first visual diff |
| R8 | The **contract drifts** between the Go API and the SPA, which are rewritten in parallel | M×H | The generated `enums.ts`; the golden files; the replay corpus; the frontend codes against the **Go** contract, never the Laravel one | A `types/generated` diff in CI |
| R9 | **Scope.** Full scope is ~830–1 040 net hours against ~340 available | H×H | 19 slices, each independently shippable; the track split; a weekly demo | Week 8: fewer than three slices closed |
| R10 | The **legacy stack rots** while the new one is built, and the oracle stops being an oracle | M×H | The legacy suite is a required check with a *rising* floor; the legacy app is a live compose profile; the 16 defects are fixed in W1 | Any red legacy run |

---

## 12. The DOM / visual preservation checklist

Per component class, the things that must be identical for the pixels to match:

- **Class names**, including the **24 invalid Tailwind tokens**. Under Tailwind 3 they
  compile to nothing (`tailwind.config.js` has no `extend.colors`); under Tailwind 4 they
  are **fixed**, with the colour choices in the upgrade's delta report. Either way the
  port reproduces whatever the upgraded app produces.
- **DOM nesting order** and the node count.
- The **nine different grey families** in use side by side (`gray`, `zinc`, `slate`,
  `neutral`, `stone`).
- The `#FF2D20` brand hex (repeated 30+ times — not a token).
- The **18 inline `style={{…}}` sites**.
- **framer-motion** initial/animate variants, `whileHover`, `MotionConfig`.
- The **font stack** (§7.2) and the load order of the stylesheets.
- The **border, ring and placeholder defaults** — the three Tailwind 4 changes with the
  largest visual footprint, fixed once in the legacy app and reproduced by the port.
- Image sources, `object-fit`, and the **132 `<img>` tags** (19 without `alt`).
- The **30 locale-less `toLocaleString()` output strings** (locale-dependent on purpose
  during parity).
- The **scroll-container behaviour** — `overflow-hidden` on `Dashboard.tsx:243` clips the
  23 inline (non-`createPortal`) overlay shells.
- The **60 overlay surfaces** in total, and which 14 of them use `createPortal`.

---

## 13. The first two weeks, day by day

| Day | Track | Work | Verified at end of day |
|---|---|---|---|
| **D1** | Docs | `docs/REWRITE-PLAN.md` + ADRs 0001–0004 | The ADRs are readable by a stranger |
| **D2** | Docs | ADRs 0005–0011 (the stack, the enums, the collation, Next.js, Tailwind 4, TypeScript 7) | The version policy is settled |
| **D3** | CI | `redis-stack-action` → a native `services: redis:7-alpine`; `migrate --force` before `schema:verify`; `timeout-minutes` everywhere; `permissions:` blocks; the `action-policy` job | `gh run list` shows the `api` job no longer failing at action resolution |
| **D4** | CI | `composer verify` → a real runner; **branch protection on `main`**; MySQL 9.6; `CACHE_STORE: array`; JUnit upload | `gh api …/branches/main/protection` returns the rule set |
| **D5** | Defects | B1, B2, B3, B6 | Each fix reverts to a failing test |
| **D6** | Defects | B7, B8, B9, B10, B11, B12 | Same |
| **D7** | Defects | **B4** (the live ledger double-count) + **B5** (`config/bids.php`) + B13, B14, B15, B16 | `money:detect-duplicates` clean; a new test pins the dedupe |
| **D8** | Schema | The `pm_id` resolution migration (ADR-0015): `projects.pm_id` from the PM's USER id to its PROFILE id, with a total pre-flight; the one rule (`Hire::isAssignedPm()`) replacing ~80 copies of it in PHP and ~30 in the SPA. The 30 no-op stubs turned out to be deleted already — the **221-migration round-trip** was the real gap, and it is now a CI gate | `migrate:reset` + `migrate` clean; `schema:verify --relations` consistent; every `selected_*` column holds a PROFILE id |
| **D9** | Tooling | `routing/routes.yaml` (all 296) + `tools/parity` (route set, middleware, URI classification) | `go-parity` runs green against a stub Go binary |
| **D10** | Tooling | `php artisan contract:capture --all` → `spec/contracts/laravel/`; the frozen visual seed + the pinned harness | 296 golden files; the harness runs end to end |
| **D11** | Legacy upgrade | **Tailwind 4.3.3**: `npx @tailwindcss/upgrade`; the CSS-first config; the explicit `@source` globs; the CSS-entry fix (import `app.css` from `app.tsx`); the review of the codemod's output | The **standalone build now links the Tailwind stylesheet**; the two build modes agree; a **delta report** enumerates every screen that changed |
| **D12** | Legacy upgrade | **TypeScript 7.0.2**: the dependency bump; `stableTypeOrdering: true`; the ratchet parser verified against the native binary; the baseline re-measured and committed | `npm run typecheck:check` green; the baseline records the new number; the ratchet script has a test |
| **D13** | Baseline | **The visual baseline capture** against the upgraded app: every route, tab, overlay and role state | A baseline PNG for every screen; the gate green against itself |
| **D14** | Baseline | The baseline is **committed and frozen**; the `visual-regression` CI job is wired; the ADR gate is in place | The CI job fails if a baseline changes without an ADR |

**The walking skeleton on D14:** a Go binary that boots, registers the 296 routes from
`routes.yaml`, answers `/healthz`, and reports its route set; a PostgreSQL baseline with
the 98 tables migrated; `spec/contracts/laravel/` with 296 golden files; the legacy
application on **Tailwind 4 and TypeScript 7** with the Vercel CSS defect closed; a
visual baseline covering every screen, **frozen**; and the legacy Laravel suite **green
in CI for the first time**. That is the moment the rewrite becomes real and checkable.

---

## 14. Definition of done

The rewrite is done when:

- [ ] `go-parity` reports **route set, middleware, URI classification and golden files**
      all green for all 296 endpoints.
- [ ] `visual-regression` reports **0 differing pixels** across every screen, and no
      baseline has changed without an accepted ADR.
- [ ] `legacy-php` reports **≥ 546 tests and ≥ 2 144 assertions** — the floor, raised
      as endpoints were ported.
- [ ] `money-diff` reports **0 divergences** across the 2 000-case differential corpus.
- [ ] `legacy-mysql-parity` reports **0** checksum divergences and **0** escrow-invariant
      divergences across engines.
- [ ] `docs/PARITY.md` shows **296 / 296 endpoints ported**, each with its tier and its
      verification status, and is CI-generated.
- [ ] `spec/contracts/laravel/` and the Go contract suite are byte-identical for every
      tier-1 endpoint.
- [ ] The `web/` build ships and the Vite build is retired.
- [ ] `docs/CASE_STUDY.md`, the ADRs, the diagrams and the README are published, and
      every claim in them is either generated or covered by a test.

---

## 15. The one decision I took for you

The visual baseline has two candidates, and the difference is whether the port
reproduces the **intended** design or the **currently-broken deployment**.

- The **Laravel-served build** has Tailwind, `index.css` and the webfonts. It is the
  design the docs and screenshots describe.
- The **standalone Vercel build** currently ships **no Tailwind and no fonts** — every
  `flex`, `rounded-3xl` and `bg-white` is inert.

**I chose the Laravel-served build as the baseline (ADR-0004).** The port reproduces the
intended design, and the Vercel CSS bug is fixed as part of the port and published as a
delta in `docs/PARITY.md`. Reproducing a page with no CSS would not be a design; it
would be a bug faithfully copied.

---

## 16. Related documents

| Document | What it answers |
|---|---|
| `docs/STACK.md` | Every pinned version, and the rule for choosing latest vs pinned |
| `docs/MONEY.md` | The escrow model, the three type-lists, the ledger, the invariants |
| `docs/PORTING.md` | How to port one endpoint, and the definition of done for a slice |
| `docs/PARITY.md` | The live, generated parity matrix |
| `docs/adr/` | 22 decisions, each with context, decision, consequences and status |
| `docs/DOMAIN.md` | The domain model (with two known errors, listed in §2.3) |
| `docs/CONVENTIONS.md` | The coding conventions (with two known errors, listed in §2.3) |
| `docs/CLEANUP-LOG.md` | The append-only remediation history |
| `AGENTS.md` | The 13 production traps — the most valuable artifact in the repository |
