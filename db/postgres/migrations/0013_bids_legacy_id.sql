-- =============================================================================
-- 0013 — The legacy bid id on the unified bids table.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- ADR-0014 folds seven bid tables into one, carrying `bidder_user_id` and
-- `bidder_profile_id` verbatim and allocating fresh `bids.id` values. That
-- leaves one dangling end: every existing reference to a bid — the ledger's
-- (`reference_model`, `reference_id`), a dispute's (`payment_type`,
-- `payment_id`), the golden files — names the LEGACY (table, id) pair, and
-- a fresh identity id is a different number for the same bid.
--
-- Rewriting every reference to the new ids would change bytes the oracle
-- still serves (a golden that says bid 2587 must keep saying bid 2587),
-- and any row the rewrite misses becomes an orphan the double-charge guard
-- cannot see — which is exactly the R3 backfill hazard.
--
-- So the fold preserves the legacy id in its own column. The Go port
-- resolves a linked payment by (role, legacy id) and serializes the legacy
-- id on the wire for migrated rows; rows the new stack creates carry NULL
-- and serialize their real id. One nullable column, a partial unique index
-- so the mapping stays 1:1, no reference rewritten, no byte changed.
--
-- Append-only: a new nullable column with no backfill requirement, plus an
-- index. No rewrite of anything.
-- =============================================================================

ALTER TABLE bids ADD COLUMN legacy_id bigint;

CREATE UNIQUE INDEX bids_role_legacy_id_key
    ON bids (role, legacy_id)
    WHERE legacy_id IS NOT NULL;
