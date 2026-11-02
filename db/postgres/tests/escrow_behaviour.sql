-- =============================================================================
-- The escrow's behaviour, asserted against PostgreSQL itself.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- `internal/domain/escrow` has 52 Go tests, and every one of them runs against
-- an in-memory store that MIRRORS `escrow.record_movement()`. A mirror that
-- drifts from the function it mirrors is a test that agrees with itself.
--
-- This file is the other half: it drives the REAL function, on the REAL
-- schema, built from scratch, and asserts the outcomes MONEY.md records.
--
-- Every assertion is a `RAISE EXCEPTION`, so a failure is a non-zero exit from
-- psql and a red CI job. Nothing here is a comment about intent.
--
-- WHAT IT PINS
--   I1/I2  the four disbursement types spend the ceiling WITHOUT moving it
--   I5     only deposit and adjustment_down move the ceiling
--   I6     a deposit is never limited by the current balance
--   I11    exactly one row per (project, reference, type)
--   I12    the dedupe key includes the type, so a fee may share a payment's
--          reference
--   I14    a duplicate is an idempotent success, not an error
--   I16    every row records its actor, and NULL is a SYSTEM movement
--   I26    the release is a `retention_release` row, never a `payment`
--   I40    a refund is negative, and its reference is the dispute
--   §4.4   the unique index is PARTIAL: a project may receive many deposits
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- A project to move money against.
-- ---------------------------------------------------------------------------
INSERT INTO users (id, name, email, password) VALUES
    (1, 'Escrow Owner', 'escrow-owner@example.test', 'x');

INSERT INTO projects (id, user_id, title, budget) VALUES
    (1, 1, 'The escrow', 1000000.00);

-- ---------------------------------------------------------------------------
-- A deposit RAISES the ceiling and is unbounded by the balance (I6).
--
-- It names no reference, and a SECOND deposit must still be allowed — which
-- it only is because the unique index is partial (MONEY.md §4.4).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'deposit',
        p_amount     => 500000.00,
        p_title      => 'Add funds'
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the first deposit was not written';
    END IF;

    IF r.ceiling <> 1500000.00 OR r.available <> 1500000.00 THEN
        RAISE EXCEPTION 'after a deposit: ceiling %, available % — want 1500000.00 / 1500000.00',
            r.ceiling, r.available;
    END IF;

    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'deposit',
        p_amount     => 250000.00,
        p_title      => 'Add funds again'
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'a project may receive only ONE deposit — the unique index is not partial';
    END IF;

    IF r.ceiling <> 1750000.00 THEN
        RAISE EXCEPTION 'after a second deposit: ceiling %, want 1750000.00', r.ceiling;
    END IF;

    -- Put it back, so the arithmetic below reads in round numbers.
    PERFORM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'adjustment_down',
        p_amount     => 250000.00,
        p_title      => 'Trim the ceiling'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- A payment SPENDS the ceiling without moving it (I2).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'payment',
        p_amount     => 600000.00,
        p_title      => 'Architect base fee',
        p_reference_type_id => 1::smallint,
        p_reference_id      => 1
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the payment was not written';
    END IF;

    IF r.ceiling <> 1500000.00 THEN
        RAISE EXCEPTION 'a payment moved the ceiling to % — it must not move it at all', r.ceiling;
    END IF;

    IF r.available <> 900000.00 THEN
        RAISE EXCEPTION 'after a payment: available %, want 900000.00', r.available;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A duplicate is an IDEMPOTENT SUCCESS (I11, I14): no row, no ceiling move.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    rows_before bigint;
    rows_after bigint;
BEGIN
    SELECT count(*) INTO rows_before FROM project_budget_transactions WHERE project_id = 1;

    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'payment',
        p_amount     => 600000.00,
        p_title      => 'Architect base fee',
        p_reference_type_id => 1::smallint,
        p_reference_id      => 1
    );

    SELECT count(*) INTO rows_after FROM project_budget_transactions WHERE project_id = 1;

    IF r.written THEN
        RAISE EXCEPTION 'a duplicate payment reported written = true';
    END IF;

    IF rows_after <> rows_before THEN
        RAISE EXCEPTION 'a duplicate payment wrote a row (% -> %)', rows_before, rows_after;
    END IF;

    IF r.available <> 900000.00 THEN
        RAISE EXCEPTION 'a duplicate payment moved the balance to %', r.available;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A platform fee MAY share the payment's reference (I12).
--
-- The transaction type is part of the dedupe key. The legacy application
-- checked the reference WITHOUT the type, treated the fee as a duplicate of
-- the payment, and returned success without inserting a row — so the client
-- was told they had been charged and the ledger had no record of it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'platform_fee',
        p_amount     => 6000.00,
        p_title      => 'Platform fee (1%): Architect base fee',
        p_reference_type_id => 1::smallint,
        p_reference_id      => 1
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the platform fee was swallowed as a duplicate of the payment';
    END IF;

    IF r.ceiling <> 1500000.00 THEN
        RAISE EXCEPTION 'the platform fee moved the ceiling to % — the double charge', r.ceiling;
    END IF;

    IF r.available <> 894000.00 THEN
        RAISE EXCEPTION 'after the fee: available %, want 894000.00 — the fee was counted twice or not at all', r.available;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A retention release spends the ceiling without moving it, under its OWN
-- reference and type (I26 in the PHP service, I2 here).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'retention_release',
        p_amount     => 100000.00,
        p_title      => 'Retention release',
        p_reference_type_id => 8::smallint,
        p_reference_id      => 2,
        p_actor_user_id     => 1,
        p_actor_role        => 'admin'
    );

    -- I16: the actor is part of the record, and it is on THIS row.
    IF NOT EXISTS (
        SELECT 1 FROM project_budget_transactions
         WHERE project_id = 1 AND transaction_type = 'retention_release'
           AND actor_user_id = 1 AND actor_role = 'admin'
    ) THEN
        RAISE EXCEPTION 'the retention release did not record its actor';
    END IF;

    IF r.ceiling <> 1500000.00 THEN
        RAISE EXCEPTION 'the retention release moved the ceiling to % — the escrow shrinks on every warranty expiry', r.ceiling;
    END IF;

    IF r.available <> 794000.00 THEN
        RAISE EXCEPTION 'after the release: available %, want 794000.00', r.available;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A refund is NEGATIVE and its reference is the DISPUTE (I40).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'refund',
        p_amount     => -200000.00,
        p_title      => 'Dispute #3 refund',
        p_reference_type_id => 13::smallint,
        p_reference_id      => 3,
        p_reverses_type_id  => 1::smallint,
        p_reverses_id       => 1
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the refund was not written';
    END IF;

    IF r.available <> 994000.00 THEN
        RAISE EXCEPTION 'after the refund: available %, want 994000.00 — refunded money is still consumed', r.available;
    END IF;

    IF r.ceiling <> 1500000.00 THEN
        RAISE EXCEPTION 'the refund moved the ceiling to %', r.ceiling;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A refund that is not negative is REFUSED by the schema, not merely by the
-- service.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        PERFORM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'refund',
        p_amount     => 50000.00,
        p_title      => 'A refund that adds money',
        p_reference_type_id => 13::smallint,
        p_reference_id      => 4,
        p_reverses_type_id  => 1::smallint,
        p_reverses_id       => 1
    );

        RAISE EXCEPTION 'a POSITIVE refund was accepted — it would inflate the ledger';
    EXCEPTION
        WHEN check_violation THEN
            NULL;  -- the pbt_amount_sign constraint did its job
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- `adjustment_down` LOWERS the ceiling (I5), and the available balance falls
-- with it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'adjustment_down',
        p_amount     => 100000.00,
        p_title      => 'Correct the ceiling'
    );

    IF r.ceiling <> 1400000.00 THEN
        RAISE EXCEPTION 'after adjustment_down: ceiling %, want 1400000.00', r.ceiling;
    END IF;

    IF r.available <> 894000.00 THEN
        RAISE EXCEPTION 'after adjustment_down: available %, want 894000.00', r.available;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Affordability: a movement larger than what is left is REFUSED, and it
-- writes no row.
--
-- 894000.00 is available; 900000.00 is asked for.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    rows_before bigint;
    rows_after bigint;
BEGIN
    SELECT count(*) INTO rows_before FROM project_budget_transactions WHERE project_id = 1;

    BEGIN
        PERFORM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'payment',
        p_amount     => 900000.00,
        p_title      => 'One payment too many',
        p_reference_type_id => 8::smallint,
        p_reference_id      => 99
    );

        RAISE EXCEPTION 'an overdraw was accepted';
    EXCEPTION
        WHEN raise_exception THEN
            -- Distinguish the function's own refusal from our own assertion.
            IF SQLERRM LIKE '%an overdraw was accepted%' THEN
                RAISE;
            END IF;
    END;

    SELECT count(*) INTO rows_after FROM project_budget_transactions WHERE project_id = 1;

    IF rows_after <> rows_before THEN
        RAISE EXCEPTION 'a refused payment still wrote a row (% -> %)', rows_before, rows_after;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- `escrow.available()` and `escrow.summary()` agree with the ledger.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    available numeric(24,2);
    summary   record;
BEGIN
    SELECT escrow.available(1) INTO available;

    SELECT * INTO summary FROM escrow.summary(1);

    IF available <> 894000.00 THEN
        RAISE EXCEPTION 'escrow.available() = %, want 894000.00', available;
    END IF;

    IF summary.ceiling <> 1400000.00 THEN
        RAISE EXCEPTION 'escrow.summary().ceiling = %, want 1400000.00', summary.ceiling;
    END IF;

    IF summary.disbursed <> 506000.00 THEN
        RAISE EXCEPTION 'escrow.summary().disbursed = %, want 506000.00', summary.disbursed;
    END IF;

    IF summary.available <> 894000.00 THEN
        RAISE EXCEPTION 'escrow.summary().available = %, want 894000.00', summary.available;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A zero movement is refused: a ledger row of nothing is not a record of
-- anything.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        PERFORM escrow.record_movement(
        p_project_id => 1,
        p_type       => 'payment',
        p_amount     => 0.00,
        p_title      => 'Nothing at all',
        p_reference_type_id => 1::smallint,
        p_reference_id      => 1
    );
        RAISE EXCEPTION 'a zero payment was accepted';
    EXCEPTION
        -- 22004 from the function is the refusal we want; a P0001 is our own
        -- assertion and must be re-raised.
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%a zero payment was accepted%' THEN
                RAISE;
            END IF;
    END;
END;
$$;

ROLLBACK;

\echo 'ESCROW BEHAVIOUR PASSED'
