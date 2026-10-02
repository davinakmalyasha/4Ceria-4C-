# AGENTS.md

Entry point for AI agents working in this repo. Read this first; deeper docs live in `docs/`.

## What this is

**4Ceria Portal** — construction-coordination + real-estate marketplace. Laravel 13 API (`routes/api.php`, all under `/api`) consumed by a React 19/TypeScript SPA in `resources/js`. Separate deploys: API = Docker image (nginx + php-fpm) on Railway; SPA = Vercel standalone build. MySQL database, Redis (cache/session/queue), Railway Object Storage (Tigris, S3-compatible).

## Commands

> **PHP path changed 2026-09-28.** Laragon moved from `C:\laragon` to `D:\laragon`, and
> the installed build is `php-8.5.10-Win32-vs17-x64`. The `C:\laragon\bin\php\php-8.5.7\`
> path referenced before no longer exists, and the `php` on PATH is 8.3 — **below the
> `php: ^8.4` floor in composer.json**, so bare `php artisan` will fail. Confirm with
> `Get-ChildItem D:\laragon\bin\php -Directory` before trusting any path here.

```bash
# PHP binary trap: PATH `php` is 8.3 and CANNOT run vendor (needs >= 8.4).
# Always use:
D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe artisan ...

# Stable local server (built-in `artisan serve` SEGFAULTS on PHP 8.5/Windows after ~2 DB requests):
D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe artisan octane:start --server=frankenphp --port=9000
npm run dev            # Vite on :5173 (or use built public/build assets)

# One-shot local stack (server + queue + logs + vite) — uses the correct PHP binary:
composer dev

# Lint / build / verify
D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe -l <file>          # syntax
composer dump-autoload                                   # after adding/removing classes
npm run typecheck:check                                  # ratchet — must not RISE (baseline 96)
npm run build                                           # must stay green
D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe artisan schema:verify           # from-scratch migration vs. every model
D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe artisan money:detect-duplicates # ledger integrity
D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe artisan test            # ALL Pest suites (real MySQL, rolled back)
scripts\verify-schema.cmd <scratch_db>    # full migrate:fresh -> verify -> rollback -> re-migrate
```

Requires Laragon running (MySQL on 3306) for anything touching the DB. The live database
is `4ceria` in the datadir `D:\laragon\data\mysql-9.6` (start
`D:\laragon\bin\mysql\mysql-9.6.0-winx64\bin\mysqld.exe --defaults-file=...\my.ini`).
Redis not required locally if you override drivers per-process (see README).

## Critical traps (learned the hard way)

1. **`Model::shouldBeStrict(!isProduction())` runs in `AppServiceProvider:32`.** Locally, any lazy-load or missing attribute throws 500s. Production is silent — bugs can hide there.
2. **`projects.pm_id` stores the PM's USER id**, while bid tables store profile ids (`arsitek_id` etc.). Never "fix" one to match the other.
3. **`syncProjectLegalScope()` looks unrouted but is called statically** from `ProjectController::acceptBid` and `signContract`. Don't delete it.
4. **Policies auto-discover by convention**: `ProjectReportPolicy` has no registration but IS invoked via `$this->authorize()` in `Api/ProjectReportController`. Check convention pairs before declaring a policy dead.
5. **Two storage disks**: `public` (driver switches local/s3 via `PUBLIC_STORAGE_DRIVER`; world-readable bucket) and `railway` (always S3/Tigris private bucket: contracts, KYC, payment receipts, requirement images, dispute evidence). Env vars are `RAILWAY_STORAGE_*`; see `docs/CLEANUP-LOG.md` deploy note.
6. **`scripts/apply-octane-patches.php` mutates vendor/** on every `post-autoload-dump` (Windows FrankenPHP fixes). It echoes warnings instead of failing — check its output when Octane upgrades. It also runs inside the Docker `composer install`.
7. **The SPA catch-all used to swallow unmatched `/api/*` GETs with HTML 200s.** `shouldRenderJsonWhen` in `bootstrap/app.php` only fixed the *exception* path — a path matching no route at all still hit `routes/web.php`'s `/{any}`. The catch-all is now constrained with a negative lookahead and an explicit JSON 404 answers the rest. Keep it that way: the SPA cannot tell "renamed endpoint" from "success" otherwise.
8. **`projects.status` is a MySQL ENUM.** Writing a value that is not in the list is a hard error under strict mode — this is how the entire amicable-exit flow stayed broken for months (see `docs/CLEANUP-LOG.md`, 2026-09-23). Before writing a status, check `SHOW COLUMNS FROM projects LIKE 'status'`.
9. **Never rewrite a MySQL ENUM with `MODIFY COLUMN`.** It is an `ALGORITHM=COPY` table rebuild that aborts the whole migration (error 1265) if any row holds a value you dropped — and the entrypoint runs `migrate --force` on *every* replica start. Use `App\Support\Schema\EnumValues::addValues()`, which only ever APPENDS. Two migrations in this repo once narrowed an ENUM by hand and needed emergency follow-up migrations to undo the damage.
10. **Never `dropIndex()` a composite whose leading column is a foreign key.** InnoDB adopts such an index as the constraint's backing store and the drop fails with `1553 Cannot drop index ... needed in a foreign key constraint` — but only on a from-scratch migration, because a drifted database happens to already carry an incidental index. Use `App\Support\Schema\ForeignKeyIndexGuard::dropIndex()`.
11. **A migration whose `up()` is empty is a landmine, not a no-op.** 37 of them were recorded as applied with a docblock claiming "consolidated into base migrations" — the consolidation never happened, so 26 columns referenced by live models did not exist and `migrate:fresh` could not reproduce the schema at all. If you add a migration that does nothing, delete it. `php artisan schema:verify` is the standing gate.
12. **Every payment path runs through `ProjectFinancialService`.** Never write a `project_budget_transactions` row directly, and never read `projects.budget` to answer "how much is left" — use `ProjectFinancialService::available()`/`summary()`. New payment endpoints must call `DisputeService::assertNoOpenDispute()`. **Check the return value of `recordPayment()`** — discarding it is how a bid ends up `paid` with no ledger row.
13. **The API runs `migrate --force` on every container start** and `schedule:run` on every replica; scheduled tasks carry `onOneServer()` for that reason. The `migrate` call itself is *not* guarded by `onOneServer()` — it is a live multi-replica race.

## Where things are

| Area | Location |
|---|---|
| API controllers | `app/Http/Controllers/Api/*` (+ a few marketplace/logistics ones at `app/Http/Controllers/*`) |
| Route map by domain | `docs/API_MAP.md` |
| Domain model & money flow | `docs/DOMAIN.md` |
| Escrow arithmetic (single source of truth) | `app/Services/ProjectFinancialService.php` |
| Payment plan integrity | `app/Services/TerminPlanService.php` |
| Dispute/arbitration (payment freeze gate) | `app/Services/DisputeService.php` |
| Auth/authz/upload conventions | `docs/CONVENTIONS.md` |
| Infra & deploy topology | `docs/ARCHITECTURE.md` |
| Past audits (security/perf/dead-code) | `docs/audits/` (archived) |
| Cleanup history of this pass | `docs/CLEANUP-LOG.md` |
| Schema/model consistency gate | `php artisan schema:verify` |
| Ledger integrity diagnostics | `php artisan money:detect-duplicates` |

## Working rules for agents

- Never commit without explicit owner instruction; owner reviews the tree.
- Before deleting anything as "dead", re-grep inbound references yourself (two past audit claims were wrong).
- **Full verification gate** after structural changes (CI runs the same list — see `.github/workflows/ci.yml`):
  1. `php -l` sweep over `app database routes tests`
  2. `composer dump-autoload`
  3. `npm run typecheck:check` (ratchet — must not RISE, baseline 96)
  4. `npm run test` (vitest — SPA unit + component tests)
  5. `npm run build` **and** `VITE_STANDALONE=true npm run build` — production ships `dist/`, not `public/build`
  6. `artisan migrate --force` when a migration was added
  7. `artisan schema:verify` (or `scripts\verify-schema.cmd <scratch_db>` for the full round-trip)
  8. `artisan test` (all Pest suites; real MySQL, every test rolled back)
  9. manual Playwright pass (login → dashboard → project page)
  10. `composer verify` runs steps 1-8 locally
- Money changes are not "refinements" — they need a test in `tests/` and a look at `docs/DOMAIN.md`.
- Dev-only quick-login lives in gitignored `resources/js/pages/dev/QuickLoginPanel.tsx`; keep it out of commits.
- Test/scratch scripts: name them `debug_*.php`, `verify_*.php`, `seed_*.php` and put them at the **repository root**. The `.gitignore` patterns are anchored with a leading `/`, so they match the root only. Suites share `tests/Support/DatabaseHarness.php` — do not re-roll the `.env` recovery or the transaction rollback per file.
- Useful dev tooling belongs in `app/Console/Commands/`, not in a scratch file — a Pest suite is a test, an artisan command is a tool.
