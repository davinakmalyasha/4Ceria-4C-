-- =============================================================================
-- 0015 — The budget transaction descriptive columns.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The legacy `project_budget_transactions` table carries seven descriptive
-- columns the PostgreSQL mirror never got: `category`, `type`, `status`,
-- `description`, `reference_model` and `reverses_model` (plus the morph
-- naming: MySQL says `reference_model`, the mirror said
-- `reference_type_id`). They are all nullable, and they are all on the
-- wire: `GET /api/projects/{project}/budget` serializes every transaction
-- whole, so without them the port renders six nulls where the oracle
-- renders values.
--
-- Purely additive (see trap #9): new nullable columns, no backfill needed
-- beyond the next ETL, which copies them like any other column.
-- =============================================================================

ALTER TABLE project_budget_transactions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE project_budget_transactions ADD COLUMN IF NOT EXISTS "type" text;
ALTER TABLE project_budget_transactions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE project_budget_transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE project_budget_transactions ADD COLUMN IF NOT EXISTS reference_model text;
ALTER TABLE project_budget_transactions ADD COLUMN IF NOT EXISTS reverses_model text;
