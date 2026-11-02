# Contributing

## Before you change anything

Read [`AGENTS.md`](AGENTS.md). It is short, and it lists the traps that have
each cost real debugging time: the Go 1.27 JSON v2 difference that breaks the
byte contract, the `pm_id` column that stores a profile id, the MySQL enum that
must only ever be appended to, the UTC pinning the ETL depends on.

Two rules that are not negotiable:

- **Never commit without the owner's explicit instruction.** The owner reviews
  the tree.
- **Before deleting something as "dead", re-grep the inbound references
  yourself.**

## Environment

- **Go 1.27+**
- **Node 20+**
- **PostgreSQL 17+**
- **MySQL 9.6** — identity only (ADR-0018)

```bash
cp .env.example .env

# PostgreSQL
createdb 4ceria_pgcheck
for f in db/postgres/migrations/*.sql; do psql -d 4ceria_pgcheck -f "$f"; done

# MySQL (identity + demo rows)
mysql -uroot -e 'CREATE DATABASE 4ceria'
mysql -uroot 4ceria < db/mysql/schema.sql
mysql -uroot 4ceria < db/mysql/demo.sql

# API + frontend
go run ./cmd/gateway --addr=:8099
cd web && npm ci && API_ORIGIN=http://127.0.0.1:8099 npm run dev
```

## The verification gate

Run the full list after any structural change. CI runs the same one.

```bash
gofmt -l ./cmd ./internal                       # must print nothing
go vet ./...
GOEXPERIMENT=nojsonv2 go test ./...
cd web && npx tsc --noEmit
cd web && npm run build
node tools/db/verify-postgres-baseline.mjs      # from-scratch PostgreSQL vs. MySQL
go run ./cmd/etl -all -truncate                 # then:
go run ./cmd/etl -all -verify
bash scripts/ci/action-policy.sh
```

`node scripts/verify.mjs` runs the first five; `--db` adds the database and
ETL steps.

## Changing money code

Money changes are not "refinements". They need:

1. a test in `internal/` that fails without the change;
2. a read of [`docs/MONEY.md`](docs/MONEY.md), and an update to it if the model
   changed;
3. the dispute gate (`assertNoOpenDispute`) on any new payment path;
4. a transaction with `FOR UPDATE` on the project row for multi-row writes.

## Adding an endpoint

1. Add the route to `routing/routes.yaml` (method, path, id, middleware tier).
2. Add the handler and register it in `cmd/gateway/main.go`.
3. `TestEveryRouteIsRegistered` must stay green.
4. Serialise through `internal/jsonphp`; the body is a wire contract.

## Changing the schema

- PostgreSQL: a new numbered file in `db/postgres/migrations/`, forward-only.
  Rebuild from scratch and run the baseline gate before committing.
- MySQL: append-only. A new enum value is appended; never rewrite the list.
  Update `db/mysql/schema.sql`, `spec/enums.yaml` and the PostgreSQL enum in
  the same change.

## Scratch scripts

Name them `debug_*.mjs`, `verify_*.mjs`, `seed_*.mjs`, `scratch_*.mjs` at the
repository root. The `.gitignore` patterns are anchored there, so a file with
that name anywhere else is tracked normally.
