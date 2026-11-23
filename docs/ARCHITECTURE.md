# Architecture

## Topology

```
Browser / installed PWA
        │  same-origin HTML, RSC, /api/*, /storage/*
        ▼
Next.js 16 (web/)                    ┌─────────────────────────────┐
  server components + server actions │  Go gateway (cmd/gateway)   │
  /api/[...path]   ─── HTTP ────────▶ │  manifest router + handlers │
  /storage/[...path] ─ HTTP ────────▶ │  auth, money, storage, SSE  │
  /auth/expire, /offline             └──────────────┬──────────────┘
                                                     │ pgx
                                              ┌──────▼──────┐
                                              │ PostgreSQL  │
                                              │ all data    │
                                              └─────────────┘
```

The browser never receives the API bearer token. The Next server action that
logs a user in stores the token in an httpOnly `4ceria_session` cookie; server
components and the two proxy route handlers attach it to API calls.

## Request lifecycle

1. A page render calls `sessionToken()` (`web/lib/session.ts`) and
   `apiFetch()` (`web/lib/api.ts`). Both are server-only.
2. `apiFetch` sends `Authorization: Bearer <token>` to `API_ORIGIN`, with
   `cache: 'no-store'` unless a public directory opts into 60-second caching.
3. The Go router resolves `routing/routes.yaml`, applies the route's chain
   (`auth`, `admin`, `freeze_termination`, route throttle, coarse API throttle)
   and calls the handler.
4. `internal/httpapi` handlers use pgx; money moves through
   `internal/domain/escrow`, never ad-hoc SQL arithmetic in a handler.
5. Responses are encoded by `internal/jsonphp` so numeric and object shapes
   are stable. Errors use the same `{"message": ...}` shape throughout.

A 401 from the API during a server render redirects to `/auth/expire`, which
clears the cookie and then sends the visitor to `/login`. This prevents the
stale-cookie redirect loop.

## Identity

- `users`, `personal_access_tokens`, `roles` and `model_has_roles` are
  PostgreSQL tables.
- Tokens keep Sanctum's `id|plain` form; only the SHA-256 hash is stored, and
  expiry is checked on every request.
- `last_used_at` is touched best-effort after a successful lookup.
- Password reset tokens are hashed, expire after 60 minutes, are deleted on use
  and are never written to logs.
- Login, register and forgot-password responses are timing-equalised so an
  unknown address cannot be distinguished from a wrong password.

## Authorization

- `auth` requires a resolved caller.
- `admin` requires `role_type = 'admin'` or an admin Spatie role.
- `freeze_termination` blocks mutations while a project has an open mutual
  termination.
- Project reads are limited to the owner, assigned PM, admin, the hired
  professional roles, non-terminal bidders and active sub-professionals.
- Every money mutation also checks for an open dispute inside the transaction.

## Storage

Uploads are stored under `PUBLIC_STORAGE_ROOT` (public prefixes) or
`EVIDENCE_DIR` (everything else). A stored path is always resolved through
`safeStorageJoin`, which rejects absolute paths and `..` segments. Client
filenames never become paths; the extension is reduced to 1–8 alphanumeric
characters.

`GET /storage/{path}`:

- public prefixes: cacheable for one hour;
- private paths: require a valid caller or a 15-minute HMAC signature
  (`?expires=&sig=`, keyed by `APP_KEY`);
- S3 configuration replaces local serving with presigned GETs.

The Next app proxies `/storage/*` so the browser stays same-origin and the API
host can remain server-side.

## Background work

`httpapi.StartScheduler` runs in the gateway process and is disabled with
`DISABLE_SCHEDULER=1` in tests. Jobs are elected with PostgreSQL advisory locks
held on one acquired connection:

- retention release;
- auto-complete material orders after three delivered days;
- snag escalation;
- prune expired tokens, old notifications and limiter rows;
- mail outbox drain (5-minute ticker, attempt/backoff accounting);
- web push sweep (30-second ticker, only notifications whose creating
  transaction has committed).

## PWA

- `web/public/manifest.webmanifest` declares installability, shortcuts and
  screenshots.
- `web/components/pwa/PwaProvider.tsx` registers `public/sw.js` in production,
  captures `beforeinstallprompt`, detects updates and exposes offline state.
- The service worker precaches the offline page and immutable assets. It never
  caches `/api/*`, authenticated HTML or `/storage/*`; a navigation failure
  shows `/offline`.
- Push notifications are delivered by the sweeper and open a same-origin URL
  only.

## Deployment

The API is a static Go binary (`Dockerfile`, `--addr=:8080`). The web app is a
Next standalone build. Required runtime configuration is documented in
`.env.example` and `docs/OPERATIONS.md`.

The repository is a portfolio reference, not a live service.
