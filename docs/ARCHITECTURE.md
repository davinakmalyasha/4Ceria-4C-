# Architecture

## Runtime topology

```
Browser
   │
   ▼
Next.js 16 (web/, standalone build)      ── server components / route handlers
   │  API_ORIGIN
   ▼
Go gateway (cmd/gateway)                 ── routing/routes.yaml, all 312 endpoints
   │
   ├── PostgreSQL 17   all data + auth (users, tokens, roles, ledger)
   ├── MySQL 9.6       one-time legacy seed only (db/mysql + cmd/etl)
   ├── Local disk      public uploads + private contracts / KYC / evidence
   ├── Resend          password-reset mail (log driver when key empty)
   └── Nominatim       geocoding (proxied and re-encoded)
```

The browser never calls the API directly on a cross-origin hop it does not
control: the Next server reads `API_ORIGIN` at request time and forwards the
request. That keeps the session cookie/httpOnly design intact and makes the
API origin a deploy-time value rather than a build-time one.

## Request lifecycle

1. `cmd/gateway` loads `routing/routes.yaml` at startup. A route without a
   handler answers a deliberate 501 stub — the route table is the contract,
   and `TestEveryRouteIsRegistered` fails the build if the two disagree.
2. Middleware order is: recover → security headers → rate limit →
   auth (Sanctum token, read from PostgreSQL) → admin gate → freeze gate.
3. Handlers write PostgreSQL directly, including identity. MySQL is only the
   one-time seed source via `cmd/etl`.
4. Unmatched `/api/*` paths answer a JSON 404. Anything else is not the
   gateway's business.

## Data ownership

| Store | Tables | Why |
|---|---|---|
| PostgreSQL | everything, including `users`, `personal_access_tokens`, roles | Local/portfolio runtime is all-PostgreSQL (ADR-0018 superseded for local). |
| MySQL | frozen legacy seed only | `db/mysql/` + `cmd/etl` seed PostgreSQL once; not needed at runtime. |

`cmd/etl` is the one-time seeder: it reads each MySQL table, writes PostgreSQL with the
same values, and verifies row-count equality. `db/mysql/schema.sql` and
`db/mysql/demo.sql` are the frozen legacy schema and a demo dataset, used once
to seed a local PostgreSQL. Runtime needs only PostgreSQL.

## Storage

| Kind | Location | Access |
|---|---|---|
| Public uploads | `PUBLIC_STORAGE_ROOT` (local) or Tigris | anonymous `/storage/...` |
| Contracts, KYC, receipts, dispute evidence | `EVIDENCE_DIR` (local) or private Tigris | presigned URLs |
| Generated application files | PostgreSQL byte columns / storage root | handler-checked |

Uploads are server-named; the client filename is never used as a path.

## Deploy

**Not deployed.** This is a portfolio project; the shape below is what a
deployment would look like.

- **API** — the `Dockerfile` (Go binary) on a container host. Environment:
  `DATABASE_URL`, `APP_KEY`, `APP_URL`, `PUBLIC_STORAGE_ROOT`,
  `EVIDENCE_DIR`, `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `GEOCODING_ORIGIN` (no `MYSQL_DSN` at runtime).
- **Frontend** — `web/` on Vercel. `API_ORIGIN` is read at runtime; the build
  output is `standalone`.
- **PostgreSQL** — migrations are applied in filename order before the new
  binary is promoted. They are forward-only and idempotent where possible. Auth included.
- **MySQL** — one-time seed only (`db/mysql/schema.sql` + ETL); not a runtime dependency.

## CI

`.github/workflows/ci.yml`:

| Job | What it proves |
|---|---|
| `action-policy` | Every action is pinned to a SHA and every image to a digest. |
| `secrets` | gitleaks over full history; no VAPID private key tracked. |
| `go` | `gofmt`, `go vet`, `go test ./...`. |
| `web` | `tsc --noEmit` and `next build`. |
| `database` | PostgreSQL builds from scratch and matches MySQL; the ETL loads and both engines hold the same row counts. |
