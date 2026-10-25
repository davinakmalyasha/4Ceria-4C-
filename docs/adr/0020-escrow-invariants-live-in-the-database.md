# ADR-0020: The escrow invariants live in the database

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

`AGENTS.md` trap #12 is the rule that has shaped this codebase the most:

> **Every payment path runs through `ProjectFinancialService`. Never write a
> `project_budget_transactions` row directly, and never read `projects.budget` to answer
> "how much is left" — use `ProjectFinancialService::available()`/`summary()`. New
> payment endpoints must call `DisputeService::assertNoOpenDispute()`. Check the return
> value of `recordPayment()` — discarding it is how a bid ends up `paid` with no ledger
> row.**

This is a **convention**. It has held, mostly, because the codebase is small and the
author knows the rules. Two documented incidents came from not holding it:

- `FINAL-SWEEP.md` §4.9 — a feature that "computed, stored, displayed and scheduled a
  value while **never moving money at all**". The lesson recorded: *"assert on **ledger
  rows**, never on a command's exit code, a `retention_released_at` timestamp, or a
  computed column. All three were green while the feature did nothing."*
- The retention release that wrote its ledger row with `transaction_type = 'payment'`
  against the termin's own reference tuple, so `deductBudget()`'s duplicate check
  matched the original payment, returned `true` **without inserting**, and the command
  reported success. The escrow was never debited.

Both are *convention* failures. The rewrite is an opportunity to make them
*impossible* rather than *discouraged*.

## Decision

**The escrow invariant is enforced by the database, not by a code convention.**

```sql
CREATE SCHEMA IF NOT EXISTS escrow;

CREATE OR REPLACE FUNCTION escrow.record_movement(
    p_project_id      bigint,
    p_type            ledger_tx_type,
    p_amount          numeric(24,2),
    p_title           text,
    p_reference_type  ledger_ref_type,
    p_reference_id    bigint,
    p_reverses_type   ledger_ref_type,
    p_reverses_id     bigint,
    p_actor_user_id   bigint,
    p_actor_role      text
) RETURNS TABLE (ledger_id bigint, written boolean,
                 ceiling numeric(24,2), available numeric(24,2))
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, escrow AS $$
DECLARE
    v_ceiling numeric(24,2);
    v_outflow numeric(24,2);
    v_ledger_id bigint;
BEGIN
    -- 1. lock the ceiling row; this serialises concurrent payments on the project
    SELECT budget INTO v_ceiling FROM projects WHERE id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'project % not found', p_project_id USING ERRCODE = 'P0002';
    END IF;

    -- 2. affordability, computed inside the lock. Refund rows are NEGATIVE and
    --    are part of the same sum.
    SELECT COALESCE(SUM(amount),0) INTO v_outflow
      FROM project_budget_transactions
     WHERE project_id = p_project_id
       AND transaction_type = ANY(ARRAY['payment','refund','platform_fee',
                                         'retention_release']::ledger_tx_type[]);

    IF p_type <> 'deposit' AND (v_ceiling - v_outflow) < p_amount THEN
        RAISE EXCEPTION 'insufficient escrow: need %, available %',
              p_amount, (v_ceiling - v_outflow)
            USING ERRCODE = 'P0001', DETAIL = 'insufficient_funds';
    END IF;

    -- 3. the dedupe guard, atomic
    INSERT INTO project_budget_transactions
      (project_id, transaction_type, amount, title,
       reference_type, reference_id, reverses_type, reverses_id,
       transaction_date, actor_user_id, actor_role)
    VALUES (p_project_id, p_type, p_amount, p_title,
            p_reference_type, p_reference_id, p_reverses_type, p_reverses_id,
            now(), p_actor_user_id, p_actor_role)
    ON CONFLICT (project_id, reference_type, reference_id, transaction_type)
      WHERE reference_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_ledger_id;

    IF v_ledger_id IS NULL THEN
        RETURN QUERY SELECT NULL::bigint, false, v_ceiling, (v_ceiling - v_outflow);
        RETURN;
    END IF;

    -- (The `available` figure in the RETURN QUERY below is RECOMPUTED AFTER
    --  the insert, not reused from the affordability check above. The check
    --  runs BEFORE the movement, so returning it would tell the caller the
    --  escrow was unchanged after the money moved. Corrected 2026-10-21 after
    --  the schema audit found the original sketch returning the pre-insert
    --  figure.)

    -- 4. structural movements move the ceiling. A MEMBERSHIP test, never
    --    `type != 'payment'` — that test double-subtracted platform_fee and
    --    retention_release.
    IF p_type NOT IN ('payment','refund','platform_fee','retention_release') THEN
        UPDATE projects
           SET budget = budget + CASE WHEN p_type = 'adjustment_down'
                                      THEN -p_amount ELSE p_amount END,
               updated_at = now()
         WHERE id = p_project_id
        RETURNING budget INTO v_ceiling;
    END IF;

    RETURN QUERY SELECT v_ledger_id, true, v_ceiling, (v_ceiling - v_outflow);
END $$;

REVOKE INSERT, UPDATE, DELETE ON project_budget_transactions FROM app_rw;
GRANT EXECUTE ON FUNCTION escrow.record_movement(...) TO app_rw;
```

**The Go service calls the function.** The Go-side implementation of the same logic is
kept as the **reference semantics** — unit-tested, and used by the differential corpus —
but it is not the enforcement point. The database is.

Three supporting constraints:

```sql
-- A non-structural movement MUST carry a reference, or the guard would silently
-- not apply to it.
ALTER TABLE project_budget_transactions
  ADD CONSTRAINT pbt_reference_required CHECK (
      transaction_type IN ('deposit','adjustment_down')
      OR (reference_type IS NOT NULL AND reference_id IS NOT NULL));

-- A refund is the ONLY negative movement.
ALTER TABLE project_budget_transactions
  ADD CONSTRAINT pbt_amount_sign CHECK (
      (transaction_type = 'refund' AND amount < 0)
   OR (transaction_type <> 'refund' AND amount > 0));
```

## Consequences

### Positive

- **"Never write a ledger row directly" becomes a database privilege**, not a code
  convention. A stray `INSERT` from a mis-written controller fails with a permission
  error, not with a silent ledger corruption.
- **The double-charge guard is atomic** — `ON CONFLICT DO NOTHING RETURNING id`, decided
  inside the `FOR UPDATE` lock. Zero rows returned means "already recorded", and the
  caller gets an idempotent success with **no ceiling move and no platform fee**.
- **The affordability check cannot be bypassed by an out-of-order write**, because it is
  computed inside the same lock as the insert.
- **The `type != 'payment'` bug class is closed.** The membership test is in the
  function, so it cannot be mis-written per endpoint.
- **The sign convention is enforced**: a negative `payment` or a positive `refund` is
  impossible.

### Negative

- **The database is now coupled to the domain.** A schema change to the ledger has a
  function body to change too. The function is the *one* place, which is the point.
- **`SECURITY DEFINER` needs a careful `search_path`.** It is set to
  `public, escrow` explicitly, and the function is owned by a role that is not the
  application role.
- **The Go implementation and the SQL implementation can drift.** Mitigated by the
  `money-diff` CI job and by the `legacy-mysql-parity` nightly, which recomputes the
  invariants on both engines and compares them.
- **Debugging moves from the application to the database.** A failed payment now
  surfaces as a PostgreSQL error with a `DETAIL` code, which is a different debugging
  muscle.

### Neutral

- **The Go service still has a `FinancialService` with the same shape** — `Record`,
  `RecordPayment`, `Available`, `Summary` — and it is the reference implementation the
  SQL is checked against. The API surface is unchanged; only the enforcement point
  moves.
- **`ProjectFinancialService::available()` / `summary()` remain the only way to read a
  balance** — but the *values* they return now come from the same function that writes
  the ledger, so a read and a write cannot disagree.

## References

- `docs/MONEY.md`
- `AGENTS.md` trap #12
- `FINAL-SWEEP.md` §4.9 — the "green while the feature did nothing" lesson
- `app/Services/ProjectFinancialService.php` — the reference semantics
- `docs/adr/0012-money-is-integer-minor-units.md`
- `docs/adr/0013-the-ledger-reference-registry.md`
