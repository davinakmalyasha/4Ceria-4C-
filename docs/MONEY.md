# Money

## The rule

Money is an exact integer in minor units (sen). No float ever touches a money
value: request parsing, the domain packages, PostgreSQL `numeric` and the
wire format all meet at `internal/domain/money` and
`internal/domain/escrow`. A percentage split uses truncating division so the
parts always add back to the whole.

The wire format keeps the stored decimal text (`"1250000.00"`); the database
column is `numeric(24,2)`.

## The ledger

Every movement is a row in `project_budget_transactions` (migration `0006`).
The row records:

- `project_id` and `transaction_type`:
  `deposit`, `adjustment_down`, `payment`, `refund`, `platform_fee`,
  `retention_release`;
- `amount` (positive except a refund, which is negative);
- `reference_type_id` / `reference_id` — the registry entry (migration `0002`)
  naming what the movement is about;
- `reverses_type_id` / `reverses_id` — for a refund, the payment being
  reversed;
- `actor_user_id` and `actor_role` — NULL means a system movement;
- `voided_*` — a duplicate movement is voided, never deleted.

The unique index is **partial**:

```sql
CREATE UNIQUE INDEX budget_tx_reference_unique
    ON project_budget_transactions
       (project_id, reference_type_id, reference_id, transaction_type)
    NULLS NOT DISTINCT
    WHERE reference_id IS NOT NULL;
```

Structural movements (`deposit`, `adjustment_down`) carry no reference, so
they are outside the key. A project can receive many deposits; it cannot
record the same payment twice. The partiality is the invariant, not an
optimisation.

## Invariants

- A project has a **ceiling**: `deposits + adjustment_down`. Disbursements
  (`payment`, `refund`, `platform_fee`, `retention_release`) spend the ceiling
  without moving it.
- `available = ceiling - spent`. A payment cannot exceed `available`.
- A duplicate `(project, reference, type)` is an idempotent success, not an
  error and not a second row.
- `retention + net == gross`. Retention is withheld, then released as its own
  `retention_release` movement. It is never a second `payment`.
- The platform fee is separate from the professional's net and is a
  `platform_fee` movement.
- A refund is negative and names the dispute as its reference and the payment
  as its reversal.
- The schema provides one writer (`escrow.record_movement()`) and grants the
  application role no direct ledger DML. The local portfolio runtime connects
  as the database owner, so that privilege boundary is a deployment hardening
  step; the Go escrow service performs the same checks under a row lock in the
  request transaction.
- `db/postgres/tests/escrow_behaviour.sql` drives the real function and asserts
  these rules against PostgreSQL, not against a Go mirror.

## Disputes freeze money

`internal/domain/escrow/service.go` takes a `FreezeGate`. The PostgreSQL
implementation checks `project_disputes` for an `open` row. Every payment
handler runs that gate before writing money state; a second open dispute is
prevented by a partial unique index (migration `0028`).

## Retention and platform fee

- Retention percentage and platform-fee percentage are configuration, not
  constants in a handler.
- `internal/domain/escrow/percent.go`, `retention.go` and `fee.go` own the
  arithmetic.
- A stage releases its withheld retention only after the related work is
  approved.

## Where to look

| | |
|---|---|
| Integer money | `internal/domain/money` |
| Escrow types and invariants | `internal/domain/escrow` |
| Ledger schema and writer | `db/postgres/migrations/0006_escrow_ledger.sql` |
| Registry | `db/postgres/migrations/0002_reference_registry.sql` |
| SQL behaviour suite | `db/postgres/tests/escrow_behaviour.sql` |
