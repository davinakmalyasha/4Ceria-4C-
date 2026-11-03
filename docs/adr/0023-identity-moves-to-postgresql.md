# ADR-0023: identity moves to PostgreSQL for the local runtime

- **Status:** Accepted
- **Date:** 2026-11-03
- **Supersedes:** ADR-0018 for the local/portfolio runtime

## Context

ADR-0018 kept `users`, `personal_access_tokens` and the Spatie tables
MySQL-owned for the whole transition, with the final cutover deferred to a
rehearsed window. The gateway authenticated against MySQL and re-synced
touched rows into PostgreSQL.

For the local/portfolio runtime that window has passed: the machine runs
PostgreSQL 18.6 with the full schema (`db/postgres/migrations`, now at 0026)
and a PG-native demo seed (`db/postgres/seed.sql`), and MySQL exists only as
the frozen one-time source (`db/mysql/` + `cmd/etl`).

## Decision

Authentication, registration, password reset and admin role changes run
against PostgreSQL directly (`internal/httpapi/authpg.go`, `adminpg.go`),
with Sanctum semantics preserved: `{id}|{plain}` presentation, SHA-256 hex
at rest, bcrypt `$2y$` passwords, 2-day token expiry, revocation on logout,
suspension and password reset.

`cmd/gateway` has no MySQL code path: no `MYSQL_DSN` read, no MySQL pools,
no re-sync. `cmd/etl` and `db/mysql/` remain as the seed/parity tooling, not
runtime dependencies.

## Consequences

### Positive

- `docker`-free local boot: one database, `migrations + seed.sql`, gateway,
  web. No second engine to keep alive for day-to-day work.
- No ETL window on the auth hot path: the token a login mints is read from
  the same store that authenticates the next request.
- The MySQL driver is gone from the gateway binary (still used by `cmd/etl`).

### Negative

- The historical parity check (`verify.mjs --db`, baseline vs live MySQL)
  still needs a MySQL with the frozen schema; it is a seed audit, not a
  runtime gate. The everyday gate is `verify.mjs` (no `--db`).
- Pre-cutover sessions minted against MySQL-only data do not transfer; a
  fresh login is required after the seed.

## References

- `docs/adr/0018-users-and-tokens-stay-in-mysql.md` (transition posture)
- `internal/httpapi/authpg.go`, `internal/httpapi/adminpg.go`
- `db/postgres/seed.sql`
