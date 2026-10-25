# ADR-0007: Native PostgreSQL enums, one migration per added value

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

`AGENTS.md` trap #8 and trap #9 are the repository's most expensive pair:

> **#8** — `projects.status` is a MySQL ENUM. Writing a value that is not in the list is a
> hard error under strict mode — this is how the entire amicable-exit flow stayed broken
> for months.
>
> **#9** — Never rewrite a MySQL ENUM with `MODIFY COLUMN`. It is an `ALGORITHM=COPY`
> table rebuild that aborts the whole migration (error 1265) if any row holds a value you
> dropped. Use `App\Support\Schema\EnumValues::addValues()`, which only ever APPENDS.

The repository's response was a careful append-only helper and a 284-line migration that
documents the reasoning. But the underlying hazard is MySQL's: a MySQL ENUM is a **column
type**, and changing it is a **table rebuild**.

The schema also has a **mixed status regime** that the trap does not describe:

| Concept | ENUM (type-checked) | VARCHAR (not type-checked) |
|---|---|---|
| Bid status | `bids_arsitek`, `bids_kontraktor`, `bids_notaris`, `bids_interior` | **`bids_mep`, `bids_project_manager`, `bids_structural`** |
| Payment-stage status | — | **`project_payment_termins.status`** (`varchar(255)`) — the most money-critical state machine in the app |
| Project status | `projects.status` (11 values) | `planning_status`, `construction_brief_status`, `walkthrough_status` |
| Dispute status / resolution | — | `project_disputes.status` (`varchar(20)`), `.resolution` |
| Bid payment status | — | `bids_*.payment_status` on all 7 tables |

A typo in `bids_arsitek.status` is a 500. The same typo in `bids_mep.status` persists a
row that no query can ever find. Same controller, three different failure modes.

## Decision

**Native PostgreSQL enums** for all 44 ENUM columns, **plus** the VARCHAR statuses
listed above, and:

1. **The value list lives in one file**, `spec/enums.yaml`, which generates:
   - the PostgreSQL `CREATE TYPE`,
   - the Go typed constants,
   - the TypeScript `as const` array and derived union,
   - the pre-flight validation query.
   A value can therefore never be written by Go that PostgreSQL rejects, nor by the
   frontend that the backend does not produce.

2. **One migration per added value.** `ALTER TYPE … ADD VALUE` is catalog-only — no
   table rebuild — but the new value cannot be *used* in the same transaction that added
   it. So "add the value" and "start writing it" are two migrations. `goose`'s
   `-- +goose NO TRANSACTION` escape hatch exists for exactly this.

3. **A `CHECK` constraint is added alongside every enum** during the transition window
   where a column was a VARCHAR. Belt-and-braces for the one window in which the
   column is not yet type-safe.

4. **The three VARCHAR bid-status tables and `project_payment_termins.status` are
   converted**, so the bid state machine has a single enforcement point.

## Consequences

### Positive

- **Traps #8 and #9 are retired, permanently.** `ALTER TYPE … ADD VALUE` never rebuilds
  a table. The class of bug that "stayed broken for months" cannot recur.
- **Type distinctness.** `transaction_type` becomes a distinct type; it cannot be
  compared to an unrelated text column by accident.
- **The mixed regime ends.** One enforcement point for the bid state machine, one for
  the payment-stage state machine.
- **The client and the server cannot drift.** The TypeScript union is generated from the
  same file as the Go constants, and CI fails if the committed file differs.

### Negative

- **A PostgreSQL enum value cannot be cheaply removed.** `DROP VALUE` (PG 14+) requires
  a table rewrite. This is acceptable here because **every list in this schema only ever
  grows** — the six `MODIFY COLUMN` migrations that narrowed enums are precisely the
  pattern being retired. The cost is that a *mistaken* value, once added, is permanent.
  The mitigation is the pre-flight query in `spec/enums.yaml`, and the convention that a
  value is added only after it appears in a shipped code path.
- **A Go constant and a SQL type can still drift** if someone bypasses the generator.
  The CI `contract-freshness` job regenerates everything and fails on any diff.
- **`ALTER TYPE … ADD VALUE` cannot run in a transaction that also uses the value** —
  a real constraint on how migrations are written.

### Neutral

- The `EnumValues` helper's *reason for existing* disappears. It is not ported; the
  hazard it mitigated is gone.
- The `EnumLiteralSafetyTest` suite (16 tests) ports to a Go test that asserts the Go
  constants equal the PostgreSQL type members.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **`text` + `CHECK` constraint** | Cheaper to edit — a value can be added or removed with `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT … NOT VALID` then `VALIDATE CONSTRAINT`, and no table rewrite either way. Loses type distinctness. This was a close call; the deciding factor is that the value lists only ever grow, so the main advantage of `text`+`CHECK` (cheap removal) never applies. |
| **Lookup tables with foreign keys** | Maximum flexibility and per-value metadata, but adds a join to the hottest query in the app (`available()` runs on every payment) to read a 3-value field, and it turns a schema question into a data-seeding question. |
| **Leave the VARCHAR statuses as VARCHAR** | Leaves the bid and payment-stage state machines unconstrained, which is where a typo does the most damage. |

## References

- `AGENTS.md` traps #8, #9
- `app/Support/Schema/EnumValues.php`
- `tests/EnumLiteralSafetyTest.php`
- `docs/REWRITE-PLAN.md` §6
