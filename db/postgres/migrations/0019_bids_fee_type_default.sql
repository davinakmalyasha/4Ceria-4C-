-- =============================================================================
-- 0019 — bids.fee_type must default to 'fixed', like every legacy bid table.
--
-- The seven legacy `bids_*` tables declare `fee_type varchar(50) NOT NULL
-- DEFAULT 'fixed'`. The unified PostgreSQL table carried the column with NO
-- default, so a row inserted without `fee_type` rendered `null` here and
-- `"fixed"` there — the same wire object, two different answers.
--
-- The application's bid writers set the column explicitly, which is why the
-- parity gate never saw it; a direct insert (the ETL's own fixtures, an admin
-- script, a future import) reproduces it immediately. Defaults are part of the
-- schema contract, not an implementation detail.
-- =============================================================================

ALTER TABLE bids ALTER COLUMN fee_type SET DEFAULT 'fixed';
