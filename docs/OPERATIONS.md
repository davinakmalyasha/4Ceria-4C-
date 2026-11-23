# Operations

## Requirements

- Go 1.27.3+
- Node 20+ (see `.nvmrc`)
- PostgreSQL 17+ with `psql` on `PATH`
- Optional: an S3-compatible bucket, Resend key, VAPID keypair, DeepSeek key

## Environment

Copy `.env.example` to `.env` for the gateway and set `API_ORIGIN` for Next.
The important variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL DSN. The gateway exits if it is set but unreachable. |
| `APP_KEY` | Signs storage URLs and contract signatures. Keep it stable. |
| `APP_URL` | Canonical API origin for absolute API URLs. |
| `PUBLIC_ASSET_BASE` | Optional public asset/CDN origin; empty uses `APP_URL`. |
| `FRONTEND_URL` | Public web origin used in password-reset mail links. |
| `TRUSTED_PROXIES` | CIDRs whose `X-Forwarded-For`/`Proto` are trusted. Empty = none. |
| `INTERNAL_ROUTES_TOKEN` | Optional token for `GET /internal/routes`; otherwise loopback-only. |
| `PUBLIC_STORAGE_ROOT` | Public upload root (default `storage/app/public`). |
| `EVIDENCE_DIR` | Private upload root (default `storage/app/private`). |
| `S3_*` | When all four are set, new files go to the bucket and GETs are presigned. |
| `RESEND_API_KEY` | Real mail; unset = log driver. |
| `VAPID_*` | Web push; unset = in-app notifications only. |
| `DEEPSEEK_API_KEY` | Assistant; unset = endpoints answer 503. |
| `API_ORIGIN` (web) | Server-side API origin. The browser never calls it. |
| `SITE_URL` (web) | Public web origin for metadata. |
| `SESSION_COOKIE_SECURE` (web) | Defaults to `NODE_ENV=production`; set `false` only for local HTTP production-mode testing. |

## First run

```bash
node tools/db/reset-demo.mjs
go run ./cmd/gateway --addr=:8099
cd web && npm ci && npm run dev
```

`reset-demo.mjs` is destructive: it drops and recreates the named database
with `LC_COLLATE=C LC_CTYPE=C`, applies every migration and loads the seed.
Use `--database=name` to leave `4ceria_pgcheck` alone.

## Verification

```bash
node scripts/verify.mjs
node scripts/verify.mjs --db
```

`--db` rebuilds a scratch database, loads the seed, runs the SQL escrow suite
and then runs `go test ./...` with `DATABASE_URL` pointing at it. The default
gate is safe on a machine without PostgreSQL; `--db` is not.

## Production shape

API:

- build `./cmd/gateway` (or use the `Dockerfile`);
- set `DATABASE_URL`, `APP_KEY`, `APP_URL`, storage and mail/push/AI keys;
- terminate TLS at the edge and put the proxy CIDRs in `TRUSTED_PROXIES`;
- run migrations before starting the new binary;
- `/healthz` is liveness, `/readyz` is readiness.

Web:

- `npm ci && npm run build` in `web/`;
- serve the standalone output;
- set `API_ORIGIN` at runtime, not build time;
- the browser only needs the Next origin; `/api/*` and `/storage/*` are
  proxied with the httpOnly session.

## Backups

- PostgreSQL is the only stateful datastore: use `pg_dump`/PITR.
- Uploads live on disk or in the bucket; back them up separately.
- `APP_KEY` must be in the secret store: losing it invalidates signed links
  (new links are generated on the next read, but existing contract signatures
  are historical records and must remain verifiable).
- Never commit `.env`, `storage/`, or a database dump containing session
  tokens.

## PWA checks

- Installability: production `next build && next start`, open in Chrome, check
  the install icon and Lighthouse's PWA audit.
- Offline: disable the network, navigate; the `/offline` shell must render.
- Update: deploy a new `sw.js`, reload; the update banner appears and
  "Refresh" activates the waiting worker.
- Push: set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, enable notifications from
  the bell, and verify a test notification opens a same-origin URL.

## Observability

- Every request logs `request_id`, method, path, status and duration.
- `/readyz` reports pool totals and any unenforced gate.
- Scheduled jobs log their winner and counts; locks are PostgreSQL advisory
  locks held on one connection.
