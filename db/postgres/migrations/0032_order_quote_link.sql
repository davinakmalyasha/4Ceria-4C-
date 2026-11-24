-- 0032: link material_orders back to its quote so the ledger can move once.
--
-- Approve created orders without a quote reference, so a project-linked quote
-- could move money on mark-paid (MaterialQuote reference) and again on
-- order verify-payment (MaterialOrder reference). The column lets approve
-- record its source and lets both payment paths refuse the second move.
ALTER TABLE material_orders
    ADD COLUMN IF NOT EXISTS quote_id BIGINT
        REFERENCES material_quotes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS material_orders_quote_id_idx
    ON material_orders (quote_id);
