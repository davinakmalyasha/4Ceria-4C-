<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Normalize legacy short-name reference_model spellings in the budget
 * ledger to FQCN, matching what recordTransaction()/deductBudget() now write.
 * The unique index (project_id, reference_model, reference_id) can only
 * dedupe across code paths when both sides use ONE canonical spelling.
 */
return new class extends Migration
{
    public function up(): void
    {
        $models = [
            'BidArsitek', 'BidKontraktor', 'BidNotaris', 'BidInterior',
            'BidStructural', 'BidMep', 'BidProjectManager',
            'ProjectPaymentTermin', 'ProjectAddendum', 'MaterialOrder',
            'ProjectChangeOrder', 'ProjectExternalVendor',
        ];

        foreach ($models as $short) {
            $fqcn = "App\\Models\\{$short}";
            // Only update rows where the FQCN twin does NOT already exist,
            // otherwise the unique constraint would reject the rename.
            // (Derived-table wrapper: MySQL forbids selecting the target
            // table inside an UPDATE's subquery directly.)
            DB::statement(
                "UPDATE project_budget_transactions t
                 SET t.reference_model = ?
                 WHERE t.reference_model = ?
                   AND NOT EXISTS (
                     SELECT 1 FROM (
                       SELECT project_id, reference_model, reference_id
                       FROM project_budget_transactions
                     ) twin
                     WHERE twin.project_id = t.project_id
                       AND twin.reference_model = ?
                       AND twin.reference_id <=> t.reference_id
                   )",
                [$fqcn, $short, $fqcn]
            );
        }

        // If a short/FQCN pair coexisted (dedupe failed historically), drop
        // the redundant short-named row — keep the earliest.
        foreach ($models as $short) {
            DB::statement(
                "DELETE t FROM project_budget_transactions t
                 JOIN project_budget_transactions keep
                   ON keep.project_id = t.project_id
                  AND keep.reference_model = ?
                  AND keep.reference_id <=> t.reference_id
                  AND keep.id < t.id
                 WHERE t.reference_model = ?",
                ["App\\Models\\{$short}", $short]
            );
        }
    }

    public function down(): void
    {
        // One-way normalization; restoring ambiguous spellings is never wanted.
    }
};
