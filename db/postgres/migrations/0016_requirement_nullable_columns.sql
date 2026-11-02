-- =============================================================================
-- 0016 — Nullable requirement columns, matching the legacy schema.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The legacy `project_requirements` table leaves `quantity_procured_externally`,
-- `external_cost`, `unit`, `quality_level` and `category` nullable: a minimal
-- `store` body omits them and the row carries NULLs. The PostgreSQL mirror
-- declared them NOT NULL, so the same insert fails with 23502 and the
-- requirement can never be created through the port.
--
-- Purely additive in effect (see trap #9): constraints only loosen, no
-- rewrite, no backfill. New rows may now carry the same NULLs the oracle
-- has always written.
-- =============================================================================

ALTER TABLE project_requirements ALTER COLUMN quantity_procured_externally DROP NOT NULL;
ALTER TABLE project_requirements ALTER COLUMN external_cost DROP NOT NULL;
ALTER TABLE project_requirements ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE project_requirements ALTER COLUMN quality_level DROP NOT NULL;
ALTER TABLE project_requirements ALTER COLUMN category DROP NOT NULL;
