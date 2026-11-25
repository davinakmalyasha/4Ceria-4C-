-- =============================================================================
-- The ledger's CONSTRAINTS, asserted against PostgreSQL itself.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- `escrow_behaviour.sql` drives `escrow.record_movement()` and proves the
-- MONEY.md outcomes. It never touches a constraint directly: every write it
-- makes is a legal one, so a dropped or weakened CHECK would pass it
-- silently. This file is the other half of that half — it pins the guards
-- themselves at the constraint level:
--
--   * the constraint EXISTS (information_schema / the catalog), and
--   * the exact row that must be refused IS refused, with the exact
--     SQLSTATE the application relies on.
--
-- Every assertion is a `RAISE EXCEPTION`, so a failure is a non-zero exit
-- from psql and a red CI job. Nothing here is a comment about intent.
--
-- WHAT IT PINS
--   0006  pbt_amount_sign: a refund is negative, everything else positive,
--         voided rows exempt — one bad positive-refund insert is refused.
--   0006  pbt_reference_required: a payment without a reference is refused.
--   0006  pbt_refund_reverses: a refund without a reverses link is refused.
--   0006  budget_tx_reference_unique is PARTIAL (NULLS NOT DISTINCT, WHERE
--         reference_id IS NOT NULL): two reference-less deposits are both
--         written, while a duplicate (project, reference, type) is an
--         idempotent success (written = false) through the function and a
--         unique_violation on a direct insert.
--   0020  the relaxation: a structural row may carry the legacy
--         (reference_model, reference_id) pair with a NULL registry key —
--         and nothing more, so a structural row WITH a registry key is
--         still refused.
--   0006  escrow.available() and escrow.summary() still agree afterwards.
--
-- NOTE ON PRIVILEGES. The application role holds no INSERT on this table
-- (0006 revokes it); these direct inserts run as the migration owner, the
-- same superuser the baseline runner uses. They pin what the constraint
-- says, not who may reach it.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Two projects to move money against. 301 carries the record_movement flows
-- whose balances the final block asserts; 302 absorbs the direct-insert
-- probes so refused rows — and the two rows that must succeed — never
-- disturb 301's arithmetic.
-- ---------------------------------------------------------------------------
INSERT INTO users (id, name, email, password) VALUES
    (301, 'Ledger Owner', 'ledger-owner@example.test', 'x');

INSERT INTO projects (id, user_id, title, budget) VALUES
    (301, 301, 'The constrained ledger', 1000000.00),
    (302, 301, 'The probe ledger',        500000.00);

-- ---------------------------------------------------------------------------
-- The guards EXIST. A dropped CHECK passes every behavioural suite, so the
-- names themselves are asserted: the three CHECKs of items 1-3, the relaxed
-- structural CHECK of 0020, and the partial unique index with its NULLS NOT
-- DISTINCT semantics and its WHERE clause.
--
-- Registry ids below are 0002's insert order (bid.arsitek = 1, ...,
-- external_vendor = 12, dispute = 13), the same order escrow_behaviour.sql
-- relies on.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_missing text;
    v_indexdef text;
    v_structural_clause text;
BEGIN
    SELECT string_agg(want, ', ')
      INTO v_missing
      FROM (VALUES ('pbt_amount_sign'),
                   ('pbt_reference_required'),
                   ('pbt_refund_reverses'),
                   ('pbt_structural_no_reference')) AS v(want)
     WHERE NOT EXISTS (
        SELECT 1
          FROM information_schema.table_constraints
         WHERE table_schema = 'public'
           AND table_name = 'project_budget_transactions'
           AND constraint_name = v.want
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'missing ledger constraint(s): % — 0006/0020 did not apply', v_missing;
    END IF;

    -- 0020 relaxed the structural CHECK to forbid ONLY the registry key: the
    -- clause must still name reference_type_id, and must no longer name a
    -- bare reference_id (that is exactly what the relaxation permits).
    SELECT check_clause
      INTO v_structural_clause
      FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'pbt_structural_no_reference';

    IF v_structural_clause NOT LIKE '%reference_type_id IS NULL%' THEN
        RAISE EXCEPTION 'pbt_structural_no_reference lost its registry-key ban: %', v_structural_clause;
    END IF;

    IF v_structural_clause LIKE '%reference_id IS NULL%' THEN
        RAISE EXCEPTION 'pbt_structural_no_reference still bans a bare reference_id — the 0020 relaxation is missing: %',
            v_structural_clause;
    END IF;

    -- The dedupe key is an INDEX (partiality cannot be a table constraint),
    -- so it lives in the catalog rather than information_schema. Looked up
    -- by name (not ::regclass, which raises instead of returning NULL when
    -- the index is missing) so the assertion below reports the absence.
    SELECT pg_get_indexdef(i.indexrelid)
      INTO v_indexdef
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'budget_tx_reference_unique';

    IF v_indexdef IS NULL THEN
        RAISE EXCEPTION 'budget_tx_reference_unique is missing — the ledger has no dedupe key';
    END IF;

    IF v_indexdef NOT LIKE '%NULLS NOT DISTINCT%' THEN
        RAISE EXCEPTION 'budget_tx_reference_unique is not NULLS NOT DISTINCT — partially-keyed rows stop deduping: %',
            v_indexdef;
    END IF;

    IF v_indexdef NOT LIKE '%reference_id IS NOT NULL%' THEN
        RAISE EXCEPTION 'budget_tx_reference_unique lost its partial predicate — deposits become unrepeatable: %',
            v_indexdef;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. pbt_amount_sign: a refund is negative, everything else positive.
--
-- The one bad row: a POSITIVE refund carrying a reference and a reverses
-- link, so the sign CHECK is the only guard that can fire. The voided
-- exemption is pinned too: the same positive amount with voided_at set is
-- representable — the audit marker for a withdrawn movement.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO project_budget_transactions (
            project_id, transaction_type, amount, title,
            reference_type_id, reference_id, reverses_type_id, reverses_id
        ) VALUES (
            302, 'refund', 50000.00, 'A refund that adds money',
            13::smallint, 901, 1::smallint, 701
        );

        RAISE EXCEPTION 'a POSITIVE refund was accepted — it would inflate the ledger';
    EXCEPTION
        WHEN check_violation THEN
            NULL;  -- pbt_amount_sign did its job
    END;

    -- The voided exemption: a withdrawn movement is a marker, not a movement.
    INSERT INTO project_budget_transactions (
        project_id, transaction_type, amount, title, voided_at
    ) VALUES (
        302, 'refund', 50000.00, 'A withdrawn refund marker', now()
    );

    IF NOT EXISTS (
        SELECT 1 FROM project_budget_transactions
         WHERE project_id = 302 AND title = 'A withdrawn refund marker'
    ) THEN
        RAISE EXCEPTION 'a voided refund marker was lost — the voided exemption is broken';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. pbt_reference_required: a non-structural movement without a reference
--    is refused. Amount and sign are legal, so only the reference CHECK can
--    fire.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO project_budget_transactions (
            project_id, transaction_type, amount, title
        ) VALUES (
            302, 'payment', 10000.00, 'A payment about nothing'
        );

        RAISE EXCEPTION 'a payment WITHOUT a reference was accepted — the ledger cannot explain it';
    EXCEPTION
        WHEN check_violation THEN
            NULL;  -- pbt_reference_required did its job
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. pbt_refund_reverses: a refund that reverses nothing is refused. The
--    amount is negative and the dispute reference is present, so only the
--    reverses CHECK can fire.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO project_budget_transactions (
            project_id, transaction_type, amount, title,
            reference_type_id, reference_id
        ) VALUES (
            302, 'refund', -10000.00, 'A refund reversing nothing',
            13::smallint, 902
        );

        RAISE EXCEPTION 'a refund WITHOUT a reverses link was accepted — refunded money cannot be traced';
    EXCEPTION
        WHEN check_violation THEN
            NULL;  -- pbt_refund_reverses did its job
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. budget_tx_reference_unique is PARTIAL.
--
-- Two reference-less deposits are BOTH written (repeatable): the structural
-- rows carry no reference and are excluded from the key by the WHERE
-- clause. A duplicate (project, reference, type) through the write path is
-- an idempotent success — written = false, no new row, no balance move —
-- and the same key as a direct insert is a unique_violation naming the
-- index itself.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    rows_before bigint;
    rows_after bigint;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 301,
        p_type       => 'deposit',
        p_amount     => 500000.00,
        p_title      => 'Add funds'
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the first deposit was not written';
    END IF;

    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 301,
        p_type       => 'deposit',
        p_amount     => 250000.00,
        p_title      => 'Add funds again'
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'a project may receive only ONE deposit — the unique index is not partial';
    END IF;

    IF r.ceiling <> 1750000.00 THEN
        RAISE EXCEPTION 'after two deposits: ceiling %, want 1750000.00', r.ceiling;
    END IF;

    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 301,
        p_type       => 'payment',
        p_amount     => 600000.00,
        p_title      => 'Architect base fee',
        p_reference_type_id => 1::smallint,
        p_reference_id      => 101
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the payment was not written';
    END IF;

    -- The duplicate through the function: idempotent, not an error.
    SELECT count(*) INTO rows_before FROM project_budget_transactions WHERE project_id = 301;

    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 301,
        p_type       => 'payment',
        p_amount     => 600000.00,
        p_title      => 'Architect base fee',
        p_reference_type_id => 1::smallint,
        p_reference_id      => 101
    );

    SELECT count(*) INTO rows_after FROM project_budget_transactions WHERE project_id = 301;

    IF r.written THEN
        RAISE EXCEPTION 'a duplicate payment reported written = true';
    END IF;

    IF rows_after <> rows_before THEN
        RAISE EXCEPTION 'a duplicate payment wrote a row (% -> %)', rows_before, rows_after;
    END IF;

    IF r.available <> 1150000.00 THEN
        RAISE EXCEPTION 'a duplicate payment moved the balance to %', r.available;
    END IF;

    -- The same duplicate as a direct insert: the index itself refuses it.
    -- Kept on project 302 so the accepted first row never disturbs 301.
    INSERT INTO project_budget_transactions (
        project_id, transaction_type, amount, title,
        reference_type_id, reference_id
    ) VALUES (
        302, 'payment', 5000.00, 'Probe movement',
        1::smallint, 556
    );

    BEGIN
        INSERT INTO project_budget_transactions (
            project_id, transaction_type, amount, title,
            reference_type_id, reference_id
        ) VALUES (
            302, 'payment', 5000.00, 'Probe movement again',
            1::smallint, 556
        );

        RAISE EXCEPTION 'a duplicate (project, reference, type) was accepted — the dedupe key is gone';
    EXCEPTION
        WHEN unique_violation THEN
            IF SQLERRM NOT LIKE '%budget_tx_reference_unique%' THEN
                RAISE EXCEPTION 'duplicate refused by %, not budget_tx_reference_unique', SQLERRM;
            END IF;
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- A refund through the write path, so the final block has a negative row
-- to reconcile. Reference is the dispute (13, 311); reversal is the payment.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id => 301,
        p_type       => 'refund',
        p_amount     => -200000.00,
        p_title      => 'Dispute #311 refund',
        p_reference_type_id => 13::smallint,
        p_reference_id      => 311,
        p_reverses_type_id  => 1::smallint,
        p_reverses_id       => 101
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the refund was not written';
    END IF;

    IF r.available <> 1350000.00 THEN
        RAISE EXCEPTION 'after the refund: available %, want 1350000.00', r.available;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The 0020 relaxation: a structural row MAY carry the legacy
--    (reference_model, reference_id) pair with a NULL registry key — the
--    external-vendor import shape — and NOTHING more.
--
-- record_movement() has no reference_model parameter, so these go in
-- directly. The permitted row succeeds; a structural row that ALSO sets
-- the registry key is still refused by pbt_structural_no_reference.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Exactly what 0020 permits: legacy pair present, registry key NULL.
    INSERT INTO project_budget_transactions (
        project_id, transaction_type, amount, title,
        reference_model, reference_id, reference_type_id
    ) VALUES (
        302, 'deposit', 75000.00, 'Vendor import opening',
        'App\Models\ProjectExternalVendor', 4242, NULL
    );

    IF NOT EXISTS (
        SELECT 1 FROM project_budget_transactions
         WHERE project_id = 302 AND title = 'Vendor import opening'
           AND reference_model = 'App\Models\ProjectExternalVendor'
           AND reference_id = 4242
           AND reference_type_id IS NULL
    ) THEN
        RAISE EXCEPTION 'a 0020 structural row (legacy pair, NULL registry key) was lost';
    END IF;

    -- Nothing more: a registry key on a structural row is still refused.
    BEGIN
        INSERT INTO project_budget_transactions (
            project_id, transaction_type, amount, title,
            reference_model, reference_id, reference_type_id
        ) VALUES (
            302, 'deposit', 75000.00, 'Vendor import with registry key',
            'App\Models\ProjectExternalVendor', 4243, 12::smallint
        );

        RAISE EXCEPTION 'a structural row WITH a registry key was accepted — 0020 allows the legacy pair only';
    EXCEPTION
        WHEN check_violation THEN
            NULL;  -- pbt_structural_no_reference (0020 form) did its job
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. escrow.available() and escrow.summary() agree after all of the above.
--
-- Project 301: ceiling 1000000 + 500000 + 250000 = 1750000; disbursed
-- 600000 (payment) - 200000 (refund) = 400000; available 1350000.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    available numeric(24,2);
    summary   record;
BEGIN
    SELECT escrow.available(301) INTO available;

    SELECT * INTO summary FROM escrow.summary(301);

    IF available <> 1350000.00 THEN
        RAISE EXCEPTION 'escrow.available() = %, want 1350000.00', available;
    END IF;

    IF summary.ceiling <> 1750000.00 THEN
        RAISE EXCEPTION 'escrow.summary().ceiling = %, want 1750000.00', summary.ceiling;
    END IF;

    IF summary.disbursed <> 400000.00 THEN
        RAISE EXCEPTION 'escrow.summary().disbursed = %, want 400000.00', summary.disbursed;
    END IF;

    IF summary.available <> 1350000.00 THEN
        RAISE EXCEPTION 'escrow.summary().available = %, want 1350000.00', summary.available;
    END IF;

    IF summary.available <> available THEN
        RAISE EXCEPTION 'available() (%) and summary().available (%) disagree', available, summary.available;
    END IF;
END;
$$;

ROLLBACK;

\echo 'LEDGER CONSTRAINTS BEHAVIOUR PASSED'
