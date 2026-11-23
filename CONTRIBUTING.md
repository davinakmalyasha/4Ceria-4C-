# Contributing

## Setup

```bash
node tools/db/reset-demo.mjs
cp .env.example .env
go run ./cmd/gateway --addr=:8099
cd web && npm ci && npm run dev
```

The reset script needs PostgreSQL 17+ and `psql`. It creates a C-collation
database, applies every migration and loads `db/postgres/seed.sql`.

## Before you open a pull request

```bash
node scripts/verify.mjs --db
cd web && npx tsc --noEmit && npm run build
```

The gate runs `gofmt`, `go vet`, the Go suites, the action policy, the
TypeScript check and the production build, then rebuilds PostgreSQL from
scratch and runs the SQL escrow suite plus the database-backed Go tests.

## Rules

- **Schema changes are migrations.** Add a numbered file under
  `db/postgres/migrations`; never edit one that has shipped.
- **Routes are the manifest.** Add the route to `routing/routes.yaml` and the
  handler in the same change.
- **Money is integer minor units.** Add a test in `internal/` for any money
  behaviour; never use `float64` for an amount.
- **No credentials in commits.** `.env` is ignored; the seed ends with
  `DELETE FROM personal_access_tokens`.
- **Uploads go through `safeStorageJoin`.** A filename from a client is a
  label, not a path.
- **Keep the PWA cache conservative.** `/api/*` and `/storage/*` are never
  cached by the service worker.

## Commit style

One logical change per commit. The subject says what changed and why; the body
names the test or manual check that proves it. Do not commit without the
owner's instruction.
