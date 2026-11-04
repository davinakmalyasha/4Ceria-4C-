# AGENTS.md

Entry point for AI agents working in this repo. Read this first; deeper docs
live in `docs/`.

## What this is

**4Ceria Portal** — a construction-coordination and real-estate marketplace.

- **API**: Go 1.27 (`cmd/gateway`), serving every route from PostgreSQL.
- **Frontend**: Next.js 16 App Router in `web/` (standalone build).
- **Identity**: MySQL (ADR-0018) — `users`, `personal_access_tokens` and the
  role tables stay MySQL-owned; the Go service reads and writes them directly
  and re-syncs touched rows into PostgreSQL.
- **Mirror**: `cmd/etl` copies MySQL into PostgreSQL and verifies row counts.
- **Money**: exact integer minor units; the ledger lives in PostgreSQL.

The Laravel application and the Vite SPA are gone. Their last commit is
`72bdfb2` on `origin/rewrite/week-1-2`; the frozen MySQL schema and demo rows
are in `db/mysql/`.

## Commands

```bash
# API
go run ./cmd/gateway --addr=:8099
go build ./cmd/gateway
GOEXPERIMENT=nojsonv2 go test ./...          # the wire contract assumes Go 1.27 JSON v1

# Frontend
cd web && npm ci && npm run dev              # Next on :3000
cd web && npx tsc --noEmit
cd web && npm run build                      # standalone output

# Databases
psql -d 4ceria_pgcheck -f db/postgres/migrations/0001_extensions_and_schemas.sql   # etc.
go run ./cmd/etl -all -truncate              # MySQL -> PostgreSQL
go run ./cmd/etl -all -verify                # row-count equality

# Full gate
node scripts/verify.mjs                      # gofmt, vet, go test, frontend
node scripts/verify.mjs --db                 # plus the PostgreSQL baseline + ETL
node tools/db/verify-postgres-baseline.mjs   # from-scratch schema vs. live MySQL
```

## Critical traps

1. **`GOEXPERIMENT=nojsonv2`.** Go 1.27 ships `encoding/json/v2`, whose output
   may differ. The API's contract is byte-for-byte PHP-compatible JSON; run
   tests and builds with the experiment disabled.
2. **Money is integer minor units.** Never use floats for money. The escrow
   arithmetic lives in `internal/domain/money` and `internal/domain/escrow` —
   do not re-derive it in a handler.
3. **Every payment path checks for an open dispute** before writing money
   state. The escrow service's `FreezeGate` is the gate; wiring it without a
   dispute check leaves payments unfrozen.
4. **`projects.pm_id` stores a PROFILE id** (`project_managers.id`), like the
   other `selected_*` columns. Never compare it with a user id.
5. **MySQL ENUMs are append-only.** A new value is appended with an
   append-only `ALTER` (never a `MODIFY COLUMN` that rewrites the list — that
   is a table rebuild and aborts on any row holding a dropped value).
   PostgreSQL `bid_status` must match the MySQL union in order;
   `db/postgres/migrations/0017` appends `recommended`.
6. **MySQL `users.Deskripsi` is capital-D**, quoted in PostgreSQL migration
   0014. The wire contract emits that exact key.
7. **Timestamps are UTC.** PostgreSQL sessions are pinned to UTC; the ETL reads
   MySQL walls as UTC. A wall clock read in the server's local zone shifts
   every instant.
8. **The route manifest is the contract.** `routing/routes.yaml` is read at
   startup; `TestEveryRouteIsRegistered` fails if a manifest route has no
   handler. Add the route to the manifest and the handler together.
9. **Identity lives in PostgreSQL by default.** Login, register, tokens and
   roles are PostgreSQL-native (`authpg.go`, Sanctum semantics preserved).
   Set `MYSQL_DSN` only to re-seed via ETL or run the historical parity
   check; the gateway no longer needs it at runtime.
10. **Unmatched `/api/*` paths answer JSON 404**, never the Next.js HTML. The
    router's catch-all enforces that.
11. **Absolute seed URLs pass through asset builders untouched.** Laravel's
    `asset()` returns an absolute URL as-is; prefixing it with `/storage/`
    produces a URL next/image answers 400 to (seen live on hire-history
    avatars). New photo/cover/avatar code follows `firmAssetURL` /
    `isExternalURL`: external in, external out. Working-tree CRLF is a
    Windows checkout artefact — the blobs are LF, so `gofmt -w` a flagged
    file and the committed diff stays minimal.

## Working rules for agents

- Never commit without explicit owner instruction; the owner reviews the tree.
- Before deleting anything as "dead", re-grep inbound references yourself.
- Full verification gate after structural changes:
  1. `gofmt -l ./cmd ./internal` (empty)
  2. `go vet ./...`
  3. `GOEXPERIMENT=nojsonv2 go test ./...`
  4. `cd web && npx tsc --noEmit`
  5. `cd web && npm run build`
  6. `node tools/db/verify-postgres-baseline.mjs` (from-scratch PostgreSQL)
  7. `go run ./cmd/etl -all -truncate` then `-all -verify`
  8. `bash scripts/ci/action-policy.sh`
  9. manual Playwright pass (login → dashboard → project page)
- Money changes are not "refinements" — they need a test in `internal/` and a
  look at `docs/MONEY.md`.
- Test/scratch scripts: name them `debug_*.mjs`, `verify_*.mjs`, `seed_*.mjs`
  at the repository root (the `.gitignore` patterns are anchored there).

## Where things are

| Area | Location |
|---|---|
| API handlers | `internal/httpapi/*` |
| Route manifest | `routing/routes.yaml` |
| Domain model & money flow | `docs/DOMAIN.md`, `docs/MONEY.md` |
| Escrow arithmetic | `internal/domain/money`, `internal/domain/escrow` |
| Auth / authorization / uploads | `docs/CONVENTIONS.md` |
| Infra & deploy | `docs/ARCHITECTURE.md` |
| PostgreSQL schema | `db/postgres/migrations`, `docs/POSTGRES-SCHEMA.md` |
| Frozen MySQL schema | `db/mysql/schema.sql`, `db/mysql/demo.sql` |
| Decisions | `docs/adr/` |
