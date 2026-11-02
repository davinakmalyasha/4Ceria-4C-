name: Pull request

## What this changes

<!-- One or two sentences. What behaviour is different after this PR? -->

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Schema change (migration added or modified)
- [ ] Money path (escrow / termin / refund / dispute / payout)
- [ ] Documentation only

## Verification

The gate from [`CONTRIBUTING.md`](../CONTRIBUTING.md). Tick what you ran:

- [ ] `gofmt -l ./cmd ./internal` prints nothing
- [ ] `go vet ./...`
- [ ] `GOEXPERIMENT=nojsonv2 go test ./...`
- [ ] `cd web && npx tsc --noEmit`
- [ ] `cd web && npm run build`
- [ ] `node tools/db/verify-postgres-baseline.mjs` (schema changed)
- [ ] `go run ./cmd/etl -all -verify` (schema or data changed)
- [ ] `bash scripts/ci/action-policy.sh` (workflow changed)
- [ ] Manual pass: login → dashboard → project page

## If this touches money

- [ ] A test in `internal/` fails before the change and passes after
- [ ] `docs/MONEY.md` reviewed, and updated if the model changed
- [ ] Every payment path goes through `internal/domain/escrow` — no direct
      `project_budget_transactions` writes
- [ ] Return values from ledger writes are checked
- [ ] New payment endpoints check for an open dispute first

## If this adds a migration

- [ ] The migration is forward-only and numbered in `db/postgres/migrations/`
- [ ] PostgreSQL enums match `spec/enums.yaml` in value and order
- [ ] A MySQL enum change APPENDS the value; it never rewrites the list
- [ ] `db/mysql/schema.sql` is regenerated when the identity schema changes
- [ ] `db/postgres/tests/escrow_behaviour.sql` still passes

## Notes

<!-- Anything a reviewer would otherwise have to reverse-engineer. -->
