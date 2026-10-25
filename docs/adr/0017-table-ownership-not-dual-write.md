# ADR-0017: Table ownership, not dual-write

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The rewrite runs two application stacks against two databases for ~20 weeks. The data
has to move, and the movement has to be safe, reversible, and incapable of losing a
write to a financial ledger.

Three approaches are common:

- **Dual-write** — both stacks write both databases. Requires a distributed transaction
  or an outbox, and every write becomes a reconciliation problem.
- **One-way ETL** — MySQL is the source of truth; Postgres is a read replica that is
  rebuilt on demand. Simple, but Postgres can never be authoritative, so the cutover
  still needs a big-bang data migration.
- **Ownership-driven replication** — each table has exactly one writer, and the
  replication direction is *derived from* the ownership record.

`AGENTS.md` trap #13 records the related infrastructure hazard: the API runs
`migrate --force` on **every** container start, which is an unguarded multi-replica DDL
race. The rewrite must fix that too.

## Decision

**Each table has exactly one owner — `mysql` or `pg` — and the ETL's direction is
derived from that record. There is no dual-write and no distributed transaction.**

```
routing.table_ownership
  table_name | owner | direction
  users      | mysql | mysql -> pg
  projects   | pg    | pg -> mysql
  bids       | pg    | pg -> mysql
```

**Four invariants:**

1. **Single writer per table, always.** The ETL can never overwrite the owner's writes,
   because its direction is derived from the owner row. There is no dual-write anywhere
   and no distributed transaction anywhere.

2. **Enforced in the database, not by convention.** When a table flips to `owner=pg`, a
   MySQL trigger rejects writes from the legacy application:
   ```sql
   CREATE TRIGGER trg_pg_owned_projects BEFORE UPDATE ON projects
   FOR EACH ROW BEGIN
     IF CURRENT_USER() = 'laravel_app' THEN
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
         '4Ceria: table projects is owned by postgres; laravel_app may not write it';
     END IF;
   END;
   ```
   The Go service's PostgreSQL role has no `INSERT/UPDATE/DELETE` on MySQL-owned
   tables; the grants are asserted in CI from a `pg_dump`.

3. **The ETL is bidirectional**, so after a table flips, MySQL remains a **complete,
   current rollback mirror** of everything the Go stack wrote. That is what makes the
   rollback a copy plus a map edit rather than a data-recovery incident.

4. **`users` and `personal_access_tokens` stay in MySQL** for the whole transition
   (ADR-0018).

**The migrate race is fixed** with a PostgreSQL **advisory lock** in the migration
runner: the first replica to start takes `pg_advisory_lock(hash('4ceria:migrate'))`, and
the others wait for it and then observe that the migrations are already applied. A
`SELECT … FOR UPDATE` on the `migrations` table is the fallback if the advisory lock is
unavailable.

## Consequences

### Positive

- **No distributed transaction, ever.** Every write is a single-database transaction.
  This is the property that keeps the escrow's atomicity intact.
- **The invariant is physical, not a convention.** A stray write from the legacy app
  fails loudly at the database, with a message that names the table and the rule.
- **Rollback is lossless.** The rollback procedure is a full authoritative copy
  (pg → mysql) *before* the ownership flip, so the Go stack's writes are re-materialised
  rather than discarded. **RPO = 0.**
- **The migrate race disappears.** The advisory lock is three lines, and it is a
  PostgreSQL-native answer to a MySQL-native problem.

### Negative

- **The project domain is one indivisible cluster.** A `mark-paid` writes a bid row, a
  termin row, a ledger row **and** `projects.budget` — so those tables must all be
  owned by the same stack at the same time. The rule *"a slice may not contain an
  endpoint that writes another stack's tables"* follows directly, and it means the
  money slice cannot be cut over early, even though the money *library* is ported in
  week 2. This is the honest cost of refusing dual-write.
- **An ETL is a new, permanent-until-the-end component** with a type-mapping surface
  between two engines: 44 enums, 59 JSON columns, 100 decimals, 90 identities, 24
  booleans, 4 unsigned columns, 250 timestamps, one `datetime`, and the datetime
  timezone assumption (MySQL is naive; `APP_TIMEZONE` is UTC while the MySQL session
  timezone is `SYSTEM` = `Asia/Jakarta`).
- **Row checksums must be computed canonically** — decimals canonicalised to 2 dp,
  timestamps to UTC ISO-8601, JSON key-sorted, `NULL` distinguished from `''` — or the
  same logical row hashes two ways and the check trains everyone to ignore it.
- **Replication lag is real** for reads that cross the boundary. The read set is
  bounded (five tables) and reads that must be exact (anything feeding a money figure)
  are served from the local database.

### Neutral

- **The ownership table is a real PostgreSQL table**, not a file, so the ETL, the
  gateway and the tooling all read the same source of truth.
- **The ETL is DML-only, never DDL.** Schema changes are migrations, and they run
  against one engine at a time.
- **`cmd/etl --verify`** is a first-class command, and the nightly
  `legacy-mysql-parity` CI job runs it plus a 1 000-row fuzz round-trip. The fuzz is
  what proves the type mapping, not the row count.

## References

- `docs/REWRITE-PLAN.md` §4.2, §8
- `AGENTS.md` trap #13
- `docker/entrypoint.sh:5` — the current unguarded `migrate --force`
- `docs/adr/0018-users-and-tokens-stay-in-mysql.md`
