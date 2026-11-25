-- =============================================================================
-- The marketplace link's behaviour, asserted against PostgreSQL itself.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- Migration 0032 links material_orders back to material_quotes so the ledger
-- can move money once. Approve created orders WITHOUT a quote reference, so
-- a project-linked quote could move money on mark-paid (a MaterialQuote
-- reference) and AGAIN on order verify-payment (a MaterialOrder reference):
-- two DIFFERENT registry keys, so the dedupe index
-- (budget_tx_reference_unique, 0006) cannot see them as the same movement.
-- The quote_id column lets approve record its source and lets both payment
-- paths refuse the second move — but only if the link itself holds.
--
-- WHAT IT PINS
--   0032  material_orders.quote_id REFERENCES material_quotes (id)
--         ON DELETE SET NULL: the FK, its delete rule, its index, nullability
--   0006  the ledger double-move guard: the same (project, reference, type)
--         is an idempotent success (written = false), and the type is part
--         of the key so a fee may share a payment's reference
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO users (id, name, email, password) VALUES
    (101, 'Marketplace Owner', 'marketplace-owner@example.test', 'x'),
    (102, 'Marketplace Supplier', 'marketplace-supplier@example.test', 'x');

INSERT INTO suppliers (user_id, store_name) VALUES
    (102, 'Marketplace Store');

INSERT INTO projects (id, user_id, title, budget) VALUES
    (101, 101, 'The marketplace link', 2000000.00);

-- ---------------------------------------------------------------------------
-- 0032: the column exists, is nullable, and carries the right FK and index.
--
-- An order created without a quote must be representable (nullable); a bogus
-- link must be refused (the FK); deleting a quote must orphan the link, never
-- the order (ON DELETE SET NULL); the approve lookup must have its index.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_nullable text;
    v_fkcol    text;
    v_delrule  text;
    v_idxcol   text;
BEGIN
    SELECT is_nullable INTO v_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'material_orders'
       AND column_name = 'quote_id';

    IF v_nullable IS DISTINCT FROM 'YES' THEN
        RAISE EXCEPTION 'material_orders.quote_id is not nullable (got %) — an order created without a quote must be representable',
            v_nullable;
    END IF;

    SELECT a.attname, c.confdeltype::text
      INTO v_fkcol, v_delrule
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.conrelid = 'material_orders'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'material_quotes'::regclass;

    IF v_fkcol IS DISTINCT FROM 'quote_id' THEN
        RAISE EXCEPTION 'no FK from material_orders.quote_id to material_quotes (found column %) — 0032 is missing',
            v_fkcol;
    END IF;

    -- confdeltype 'n' is ON DELETE SET NULL.
    IF v_delrule <> 'n' THEN
        RAISE EXCEPTION 'material_orders.quote_id delete rule is %, want SET NULL — deleting a quote must orphan the link, never the order',
            v_delrule;
    END IF;

    SELECT a.attname INTO v_idxcol
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
     WHERE c.relname = 'material_orders_quote_id_idx'
       AND i.indrelid = 'material_orders'::regclass;

    IF v_idxcol IS DISTINCT FROM 'quote_id' THEN
        RAISE EXCEPTION 'index material_orders_quote_id_idx is missing or not on quote_id — the approve lookup has no index';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0032 behaviour: a bogus link is refused; deleting the quote NULLs the link
-- and keeps the order.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_supplier_id bigint;
    v_quote_id    bigint;
    v_order_id    bigint;
    v_after       bigint;
BEGIN
    SELECT id INTO v_supplier_id FROM suppliers WHERE user_id = 102;

    INSERT INTO material_quotes (user_id, supplier_id, project_id, items, delivery_address, total_amount)
    VALUES (101, v_supplier_id, 101, '[]'::jsonb, 'Jl. Test 1', 400000.00)
    RETURNING id INTO v_quote_id;

    INSERT INTO material_orders (user_id, supplier_id, project_id, quote_id, total_price, whatsapp_order_id)
    VALUES (101, v_supplier_id, 101, v_quote_id, 400000.00, 'WA-LINK-1')
    RETURNING id INTO v_order_id;

    BEGIN
        INSERT INTO material_orders (user_id, supplier_id, project_id, quote_id, total_price, whatsapp_order_id)
        VALUES (101, v_supplier_id, 101, 999999999, 1000.00, 'WA-LINK-BOGUS');

        RAISE EXCEPTION 'an order linked to a nonexistent quote was accepted';
    EXCEPTION
        WHEN foreign_key_violation THEN
            NULL;  -- the 0032 FK did its job
    END;

    DELETE FROM material_quotes WHERE id = v_quote_id;

    SELECT quote_id INTO v_after FROM material_orders WHERE id = v_order_id;

    IF v_after IS NOT NULL THEN
        RAISE EXCEPTION 'deleting the quote left order.quote_id = % — want NULL (ON DELETE SET NULL)',
            v_after;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM material_orders WHERE id = v_order_id) THEN
        RAISE EXCEPTION 'deleting the quote deleted the order — the link must orphan, never cascade';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0006 via the marketplace registry keys: the same (project, reference, type)
-- moves once and repeats idempotently; a fee may share the payment's
-- reference because the type is in the key.
--
-- The order reference is a DIFFERENT key from the quote reference, so the
-- dedupe index cannot see a quote move and an order move as the same
-- movement. That blindness is exactly why 0032 exists: the second move must
-- be refused by the application reading quote_id, because the database
-- cannot refuse it here.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r             record;
    v_quote_type  smallint;
    v_order_type  smallint;
    v_supplier_id bigint;
    v_quote_id    bigint;
    v_order_id    bigint;
    v_available   numeric(24,2);
    rows_before   bigint;
    rows_after    bigint;
BEGIN
    SELECT id INTO v_quote_type FROM ledger_reference_types WHERE type_key = 'material_quote';
    SELECT id INTO v_order_type  FROM ledger_reference_types WHERE type_key = 'material_order';

    IF v_quote_type IS NULL OR v_order_type IS NULL THEN
        RAISE EXCEPTION 'ledger_reference_types is missing material_quote/material_order — the registry is incomplete';
    END IF;

    SELECT id INTO v_supplier_id FROM suppliers WHERE user_id = 102;

    INSERT INTO material_quotes (user_id, supplier_id, project_id, items, delivery_address, total_amount)
    VALUES (101, v_supplier_id, 101, '[]'::jsonb, 'Jl. Test 2', 400000.00)
    RETURNING id INTO v_quote_id;

    INSERT INTO material_orders (user_id, supplier_id, project_id, quote_id, total_price, whatsapp_order_id)
    VALUES (101, v_supplier_id, 101, v_quote_id, 400000.00, 'WA-LINK-2')
    RETURNING id INTO v_order_id;

    PERFORM escrow.record_movement(
        p_project_id => 101,
        p_type       => 'deposit',
        p_amount     => 500000.00,
        p_title      => 'Fund the marketplace'
    );

    -- The quote mark-paid moves the money.
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id        => 101,
        p_type              => 'payment',
        p_amount            => 400000.00,
        p_title             => 'Quote mark-paid',
        p_reference_type_id => v_quote_type,
        p_reference_id      => v_quote_id
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the quote mark-paid was not written';
    END IF;

    -- The same key again is an IDEMPOTENT SUCCESS: no row, no balance move.
    SELECT count(*) INTO rows_before FROM project_budget_transactions WHERE project_id = 101;

    SELECT * INTO r FROM escrow.record_movement(
        p_project_id        => 101,
        p_type              => 'payment',
        p_amount            => 400000.00,
        p_title             => 'Quote mark-paid',
        p_reference_type_id => v_quote_type,
        p_reference_id      => v_quote_id
    );

    SELECT count(*) INTO rows_after FROM project_budget_transactions WHERE project_id = 101;

    IF r.written THEN
        RAISE EXCEPTION 'a duplicate quote payment reported written = true';
    END IF;

    IF rows_after <> rows_before THEN
        RAISE EXCEPTION 'a duplicate quote payment wrote a row (% -> %)', rows_before, rows_after;
    END IF;

    -- The fee shares the quote's reference: the type is part of the key.
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id        => 101,
        p_type              => 'platform_fee',
        p_amount            => 4000.00,
        p_title             => 'Platform fee: quote mark-paid',
        p_reference_type_id => v_quote_type,
        p_reference_id      => v_quote_id
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the platform fee was swallowed as a duplicate of the quote payment';
    END IF;

    -- The order verify-payment is a DIFFERENT dedupe key, so the database
    -- records it. In production this second move is refused by the
    -- application (it reads the 0032 quote_id); this assertion pins that the
    -- database will not catch it, so the application must.
    SELECT * INTO r FROM escrow.record_movement(
        p_project_id        => 101,
        p_type              => 'payment',
        p_amount            => 400000.00,
        p_title             => 'Order verify-payment',
        p_reference_type_id => v_order_type,
        p_reference_id      => v_order_id
    );

    IF NOT r.written THEN
        RAISE EXCEPTION 'the order-reference payment was treated as a duplicate of the quote payment';
    END IF;

    -- Ceiling 2000000 + 500000 deposit; outflow 400000 + 4000 + 400000.
    SELECT escrow.available(101) INTO v_available;

    IF v_available <> 1696000.00 THEN
        RAISE EXCEPTION 'escrow.available() = %, want 1696000.00', v_available;
    END IF;
END;
$$;

ROLLBACK;

\echo 'MARKETPLACE LINK BEHAVIOUR PASSED'
