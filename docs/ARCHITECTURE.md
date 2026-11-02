# Architecture

## Runtime topology

```
Browser
   │
   ▼
Next.js 16 (web/, standalone build)      ── server components / route handlers
   │  API_ORIGIN
   ▼
Go gateway (cmd/gateway)                 ── routing/routes.yaml, all 296 endpoints
   │
   ├── PostgreSQL 17   application data, ledger, mirror of identity
   ├── MySQL 9.6       identity: users, personal_access_tokens, role tables (ADR-0018)
   ├── Tigris (S3)     public uploads + private contracts / KYC / evidence
   ├── Resend          password-reset mail
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
   auth (Sanctum token, read from MySQL) → admin gate → freeze gate.
3. Handlers write PostgreSQL directly. Identity handlers write MySQL and then
   re-sync the touched row into PostgreSQL before serialising, so a response
   never shows the old mirror.
4. Unmatched `/api/*` paths answer a JSON 404. Anything else is not the
   gateway's business.

## Data ownership

| Store | Tables | Why |
|---|---|---|
| MySQL | `users`, `personal_access_tokens`, Spatie role tables | A session minted by either stack must work on both during the transition (ADR-0018). |
| PostgreSQL | everything else | The rewrite's schema: native enums, one `bids` table with a role discriminator, integer money. |
| Both | the identity rows, mirrored | The ETL copies MySQL → PostgreSQL; identity writes re-sync the touched row. |

`cmd/etl` is the bridge: it reads each MySQL table, writes PostgreSQL with the
same values, and verifies row-count equality. `db/mysql/schema.sql` and
`db/mysql/demo.sql` are the frozen legacy schema and a demo dataset, used to
build a local MySQL and by CI.

## Storage

| Kind | Location | Access |
|---|---|---|
| Public uploads | `PUBLIC_STORAGE_ROOT` (local) or Tigris | anonymous `/storage/...` |
| Contracts, KYC, receipts, dispute evidence | `EVIDENCE_DIR` (local) or private Tigris | presigned URLs |
| Generated application files | PostgreSQL byte columns / storage root | handler-checked |

Uploads are server-named; the client filename is never used as a path.

## Deploy

- **API** — `go build ./cmd/gateway` → Railway. Environment: `DATABASE_URL`,
  `MYSQL_DSN`, `APP_KEY`, `APP_URL`, `PUBLIC_STORAGE_ROOT`, `EVIDENCE_DIR`,
  `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `GEOCODING_ORIGIN`.
- **Frontend** — `web/` on Vercel. `API_ORIGIN` is read at runtime; the build
  output is `standalone`.
- **PostgreSQL** — migrations are applied in filename order before the new
  binary is promoted. They are forward-only and idempotent where possible.
- **MySQL** — identity only. The schema is frozen; a new environment restores
  `db/mysql/schema.sql`.

## CI

`.github/workflows/ci.yml`:

| Job | What it proves |
|---|---|
| `action-policy` | Every action is pinned to a SHA and every image to a digest. |
| `secrets` | gitleaks over full history; no VAPID private key tracked. |
| `go` | `gofmt`, `go vet`, `go test ./...`. |
| `web` | `tsc --noEmit` and `next build`. |
| `database` | PostgreSQL builds from scratch and matches MySQL; the ETL loads and both engines hold the same row counts. |
