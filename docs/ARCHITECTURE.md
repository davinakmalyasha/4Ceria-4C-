# Architecture

## Runtime topology

```
Browser / PWA
   │  (Vercel: static SPA, VITE_API_URL points at API origin)
   ▼
React SPA (React 19 + TS, react-router v7, axios)
   │  Bearer token (Sanctum) in Authorization header
   ▼
Laravel 13 API — Docker image (php:8.4-fpm-alpine + nginx + supervisord) on Railway
   │
   ├── MySQL (primary datastore; strict mode ON)
   ├── Redis (cache, sessions, queue — REQUIRED in prod; tags used for cache invalidation)
   ├── Railway Object Storage = Tigris (S3-compatible):
   │     • disk `public`  → world-readable assets (driver local|s3 via PUBLIC_STORAGE_DRIVER)
   │     • disk `railway` → private bucket (contracts/, KYC, requirements images) via presigned URLs
   └── Resend (transactional email)
```

Local dev runs the same API under **Laravel Octane + FrankenPHP** on port 9000 (built-in PHP server segfaults on Windows). The SPA either consumes built assets through Laravel (`public/build` + `resources/views/app.blade.php`) or builds standalone to `dist/` when `VITE_STANDALONE=true` (Vercel path).

## Request lifecycle (API)

1. `bootstrap/app.php` mounts only `web.php`, `api.php`, `console.php` (+ health `/up`). There is no `Http/Kernel.php`; middleware is aliased/appended here.
2. Global api group: `ThrottleRequests:api` (authed 200/min, guests 60/min — `AppServiceProvider::boot`) + custom middlewares:
   - `SecurityHeaders` — appended to web and api stacks
   - `admin` (`AdminMiddleware`) — role gate for `/api/admin/*`
   - `freeze_pending_termination` — blocks writes during pending project termination
3. Exceptions render JSON for any `api/*` request (`shouldRenderJsonWhen`).
4. Auth = Sanctum **bearer tokens** (no cookies/sessions for the SPA). Token model override throttles `last_used_at` writes to once per 5 min.
5. SPA catch-all in `web.php` serves `SpaController@app` (the only reachable Blade view).

## Storage layout

| Disk | Driver | Contents | Access |
|---|---|---|---|
| `local` | local | framework private files | never public |
| `public` | env-driven (`PUBLIC_STORAGE_DRIVER=local\|s3`) | uploads: avatars, portfolios*, certificates*, receipts, proofs, chat images, delivery docs, milestone files, bid attachments, vault documents | anonymous via `/storage/{path}` fallback route (presigns `portfolios/*`, `certificates/*`) |
| `railway` | s3 (Tigris) | `contracts/project_{id}/…` SPK snapshots & signatures, verification documents | presigned URLs only (5 min–24 h TTLs) |

*Known security debt (documented in `docs/audits/security.md`): several sensitive classes still land on the *public* disk and `/storage/{path}` has no ownership check.

## Deploy pipeline

- **API**: repo root `Dockerfile` → `docker/entrypoint.sh` runs `migrate --force` then supervisord (php-fpm + nginx). No config/route caching, no OPcache, no queue worker/scheduler yet — see `docs/audits/runtime-deploy.md`.
- **SPA**: `vercel.json` rewrites; build command uses `VITE_STANDALONE=true vite build` → `dist/`.
- **Migrations**: 223 files; notable generated-table migrations include `restore_legacy_tables` pair that recreates pre-Laravel tables (`house`, `rooms`, notifications, activity logs, etc.).

## Frontend structure

- Entry: `resources/js/app.tsx` (router), `bootstrap.js` (axios defaults, retry/cache interceptors).
- Pages under `resources/js/pages/**`, heavy feature components under `components/{Dashboard,Projects,Marketplace,Chat,…}`.
- `DashboardTabs.tsx` lazy-loads 16 tab modules behind one Suspense boundary; keep new heavy routes lazy.
- PWA via `vite-plugin-pwa`: precaches app shell + all hashed assets (~4.7 MB today); runtime caching limited to Google Fonts. Never cache `/api/*`.
- Dev-only quick-login panel loads via `import.meta.glob('./dev/QuickLoginPanel.tsx')` from a gitignored folder.
