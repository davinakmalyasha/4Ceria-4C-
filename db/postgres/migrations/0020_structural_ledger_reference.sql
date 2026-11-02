-- =============================================================================
-- 0020 — structural ledger movements MAY carry a reference.
--
-- 0006 added `pbt_structural_no_reference`: a `deposit`/`adjustment_down` row
-- could not name the thing it moved money for. That assumption is wrong for
-- the external-vendor import: `ProjectFinancialService::deductBudget()` is
-- called with type `adjustment_down` AND the vendor as its reference
-- (`App\Models\ProjectExternalVendor`, id), exactly so a re-import cannot
-- charge the same fee twice. MySQL accepts and stores that row.
--
-- PostgreSQL rejected every vendor import with
--   new row violates check constraint "pbt_structural_no_reference".
--
-- The registry link (`reference_type_id`) stays forbidden on structural
-- movements — it is a PG-only normalisation of `reference_model`, and the
-- PHP writer never produces it here. The legacy pair
-- (`reference_model`, `reference_id`) is what the dedupe and the budget read
-- render, so it must be allowed.
-- =============================================================================

ALTER TABLE project_budget_transactions
    DROP CONSTRAINT IF EXISTS pbt_structural_no_reference;

ALTER TABLE project_budget_transactions
    ADD CONSTRAINT pbt_structural_no_reference CHECK (
        voided_at IS NOT NULL
        OR transaction_type NOT IN ('deposit', 'adjustment_down')
        OR reference_type_id IS NULL
    );
