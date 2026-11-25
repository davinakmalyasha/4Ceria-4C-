-- =============================================================================
-- The termin and dispute guards, asserted against PostgreSQL itself.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- A payment termin is the most money-critical state machine in the
-- application, and until migration 0004 its status was an unconstrained
-- VARCHAR. The split (retention_amount + net_amount = amount) is written AT
-- INSERT and never recomputed, so a half-written split is corruption — and it
-- must be visible as a constraint violation, not as a silent misreading.
--
-- A dispute freezes every payment path (the escrow FreezeGate), so the
-- one-open-dispute-per-project rule cannot be a handler check alone: two
-- concurrent opens both passed that check, and the partial unique index in
-- 0028 is the invariant.
--
-- WHAT IT PINS
--   0004  payment_termin_status has the locked/pending/.../paid/void states
--         (plus refunded from 0012)
--   0004  ppt_retention_split_exact: retention_amount + net_amount = amount
--   0004  a fresh termin seeds as locked
--   0028  project_disputes_one_open_per_project: one open dispute per project
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO users (id, name, email, password) VALUES
    (201, 'Termin Owner', 'termin-owner@example.test', 'x');

INSERT INTO projects (id, user_id, title, budget) VALUES
    (201, 201, 'The termin and the dispute', 5000000.00),
    (202, 201, 'The neighbouring project', 1000000.00);

-- ---------------------------------------------------------------------------
-- The termin state machine is the enum, not a free string.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_labels text[];
    v_want   text;
BEGIN
    SELECT array_agg(e.enumlabel::text) INTO v_labels
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'payment_termin_status';

    FOREACH v_want IN ARRAY ARRAY['locked', 'pending', 'invoice_sent', 'verifying', 'accepted', 'paid', 'void', 'refunded'] LOOP
        IF NOT (v_want = ANY (v_labels)) THEN
            RAISE EXCEPTION 'payment_termin_status is missing % (has %)', v_want, v_labels;
        END IF;
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- The retention split is a CHECK, not a convention.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_found bigint;
BEGIN
    SELECT count(*) INTO v_found
      FROM pg_constraint
     WHERE conrelid = 'project_payment_termins'::regclass
       AND conname = 'ppt_retention_split_exact'
       AND contype = 'c';

    IF v_found <> 1 THEN
        RAISE EXCEPTION 'ppt_retention_split_exact CHECK is missing — a half-written split would be silent corruption';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- The one-open-dispute rule is a partial unique index, not a handler check.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_unique boolean;
    v_def    text;
BEGIN
    SELECT i.indisunique, pg_get_indexdef(c.oid)
      INTO v_unique, v_def
      FROM pg_class c
      JOIN pg_index i ON i.indexrelid = c.oid
     WHERE c.relname = 'project_disputes_one_open_per_project';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'project_disputes_one_open_per_project is missing — two concurrent opens would both pass the handler check';
    END IF;

    IF NOT v_unique THEN
        RAISE EXCEPTION 'project_disputes_one_open_per_project is not unique — it cannot refuse the second open';
    END IF;

    IF v_def NOT LIKE '%WHERE%open%' THEN
        RAISE EXCEPTION 'project_disputes_one_open_per_project is not the open-only partial guard (def: %)', v_def;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A fresh termin seeds as locked with an exact split; a broken split is
-- REFUSED by the schema, not merely by the service.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_status payment_termin_status;
BEGIN
    INSERT INTO project_payment_termins (project_id, label, amount, retention_amount, net_amount)
    VALUES (201, 'Stage 1', 1000000.00, 100000.00, 900000.00);

    SELECT status INTO v_status
      FROM project_payment_termins
     WHERE project_id = 201 AND label = 'Stage 1';

    IF v_status <> 'locked' THEN
        RAISE EXCEPTION 'a fresh termin is % — want locked (the seed shape)', v_status;
    END IF;

    BEGIN
        INSERT INTO project_payment_termins (project_id, label, amount, retention_amount, net_amount)
        VALUES (201, 'Broken split', 1000000.00, 100000.00, 800000.00);

        RAISE EXCEPTION 'a termin with retention + net <> amount was accepted';
    EXCEPTION
        WHEN check_violation THEN
            NULL;  -- the ppt_retention_split_exact constraint did its job
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- A second open dispute for the same project is REFUSED; a resolved dispute
-- does not block, and a neighbour project is unaffected.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO project_disputes (project_id, opened_by, category, title, description)
    VALUES (201, 201, 'payment', 'First dispute', 'The first freeze');

    BEGIN
        INSERT INTO project_disputes (project_id, opened_by, category, title, description)
        VALUES (201, 201, 'payment', 'Second dispute', 'The concurrent open');

        RAISE EXCEPTION 'a second open dispute for the same project was accepted';
    EXCEPTION
        WHEN unique_violation THEN
            NULL;  -- the one-open-per-project index did its job
    END;

    -- The guard is partial on open: a resolved dispute does not block.
    UPDATE project_disputes
       SET status = 'resolved'
     WHERE project_id = 201 AND title = 'First dispute';

    INSERT INTO project_disputes (project_id, opened_by, category, title, description)
    VALUES (201, 201, 'payment', 'Second dispute', 'The legitimate reopen');

    IF (SELECT count(*) FROM project_disputes WHERE project_id = 201 AND status = 'open') <> 1 THEN
        RAISE EXCEPTION 'resolving then reopening left the project without exactly one open dispute';
    END IF;

    -- A neighbour project was never frozen by this one.
    INSERT INTO project_disputes (project_id, opened_by, category, title, description)
    VALUES (202, 201, 'payment', 'Neighbour dispute', 'Unrelated freeze');

    IF (SELECT count(*) FROM project_disputes WHERE project_id = 202 AND status = 'open') <> 1 THEN
        RAISE EXCEPTION 'the neighbour project could not open its own dispute';
    END IF;
END;
$$;

ROLLBACK;

\echo 'TERMIN DISPUTE BEHAVIOUR PASSED'
