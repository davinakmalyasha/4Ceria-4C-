# AGENTS.md

Entry point for AI agents working in this repo. Read this first; deeper docs live in `docs/`.

## What this is

**4Ceria Portal** — construction-coordination + real-estate marketplace. Laravel 13 API (`routes/api.php`, all under `/api`) consumed by a React 19/TypeScript SPA in `resources/js`. Separate deploys: API = Docker image (nginx + php-fpm) on Railway; SPA = Vercel standalone build. MySQL database, Redis (cache/session/queue), Railway Object Storage (Tigris, S3-compatible).

## Commands

```bash
# PHP binary trap: Laragon's default CLI is 8.2 but vendor needs >= 8.4.
# Always use:
C:\laragon\bin\php\php-8.5.7\php.exe artisan ...

# Stable local server (built-in `artisan serve` SEGFAULTS on PHP 8.5/Windows after ~2 DB requests):
C:\laragon\bin\php\php-8.5.7\php.exe artisan octane:start --server=frankenphp --port=9000
npm run dev            # Vite on :5173 (or use built public/build assets)

# One-shot local stack (server + queue + logs + vite) — uses the correct PHP binary:
composer dev

# Lint / build / verify
C:\laragon\bin\php\php-8.5.7\php.exe -l <file>          # syntax
composer dump-autoload                                   # after adding/removing classes
npm run build                                            # must stay green
C:\laragon\bin\php\php-8.5.7\php.exe refinement-tests/smoke-api.php   # in-process smoke tests (needs MySQL up)
```

Requires Laragon running (MySQL on 3306) for anything touching the DB. Redis not required locally if you override drivers per-process (see README).

## Critical traps (learned the hard way)

1. **`Model::shouldBeStrict(!isProduction())` runs in `AppServiceProvider:29`.** Locally, any lazy-load or missing attribute throws 500s. Production is silent — bugs can hide there.
2. **`projects.pm_id` stores the PM's USER id**, while bid tables store profile ids (`arsitek_id` etc.). Never "fix" one to match the other.
3. **`syncProjectLegalScope()` looks unrouted but is called statically** from `ProjectController::acceptBid` and `signContract`. Don't delete it.
4. **Policies auto-discover by convention**: `ProjectReportPolicy` has no registration but IS invoked via `$this->authorize()` in `Api/ProjectReportController`. Check convention pairs before declaring a policy dead.
5. **Two storage disks**: `public` (driver switches local/s3 via `PUBLIC_STORAGE_DRIVER`; world-readable bucket) and `railway` (always S3/Tigris private bucket: contracts, KYC, requirement images). Env vars are `RAILWAY_STORAGE_*` — renamed from `SUPABASE_STORAGE_*` in this pass; see `docs/CLEANUP-LOG.md` deploy note.
6. **`scripts/apply-octane-patches.php` mutates vendor/** on every `post-autoload-dump` (Windows FrankenPHP fixes). It echoes warnings instead of failing — check its output when Octane upgrades.
7. The SPA catch-all route previously swallowed unmatched `/api/*` GETs with HTML 200s; JSON exception rendering for `api/*` now handled in `bootstrap/app.php` (`shouldRenderJsonWhen`).

## Where things are

| Area | Location |
|---|---|
| API controllers | `app/Http/Controllers/Api/*` (+ a few marketplace/logistics ones at `app/Http/Controllers/*`) |
| Route map by domain | `docs/API_MAP.md` |
| Domain model & money flow | `docs/DOMAIN.md` |
| Auth/authz/upload conventions | `docs/CONVENTIONS.md` |
| Infra & deploy topology | `docs/ARCHITECTURE.md` |
| Past audits (security/perf/dead-code) | `docs/audits/` |
| Cleanup history of this pass | `docs/CLEANUP-LOG.md` |
| Archived legacy code | `_legacy/controllers/` (never autoload) |

## Working rules for agents

- Never commit without explicit owner instruction; owner reviews the tree.
- Before deleting anything as "dead", re-grep inbound references yourself (two past audit claims were wrong).
- Verification gate after structural changes: `php -l` sweep → `composer dump-autoload` → `npm run build` → `smoke-api.php` → manual Playwright pass (login → dashboard → project page).
- Dev-only quick-login lives in gitignored `resources/js/pages/dev/QuickLoginPanel.tsx`; keep it out of commits.
- Test/scratch scripts belong in `refinement-tests/`.
