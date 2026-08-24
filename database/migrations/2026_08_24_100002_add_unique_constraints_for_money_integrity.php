<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ADDITIVE ONLY: unique backstops that turn application-level dedup checks
     * into hard database guarantees (money integrity).
     *
     * Pre-checked against production data: 0 duplicate groups exist for every
     * constraint below (see refinement-tests/detect-duplicate-keys.php), so
     * these adds cannot fail on existing rows and delete nothing.
     */
    public function up(): void
    {
        // One ledger row per paid reference — closes the double-spend vector.
        if (!$this->indexExists('project_budget_transactions', 'budget_tx_reference_unique')) {
            Schema::table('project_budget_transactions', function (Blueprint $table) {
                $table->unique(['project_id', 'reference_model', 'reference_id'], 'budget_tx_reference_unique');
            });
        }

        // One bid per professional per project — closes the duplicate-bid race.
        $bidTables = [
            'bids_arsitek' => ['bids_arsitek_project_arsitek_unique', 'arsitek_id'],
            'bids_kontraktor' => ['bids_kontraktor_project_kontraktor_unique', 'kontraktor_id'],
            'bids_notaris' => ['bids_notaris_project_notaris_unique', 'notaris_id'],
            'bids_interior' => ['bids_interior_project_interior_unique', 'interior_id'],
            'bids_structural' => ['bids_structural_project_structural_unique', 'structural_id'],
            'bids_mep' => ['bids_mep_project_mep_unique', 'mep_id'],
            'bids_project_manager' => ['bids_pm_project_pm_unique', 'pm_id'],
        ];

        foreach ($bidTables as $table => [$indexName, $column]) {
            if (Schema::hasTable($table) && !$this->indexExists($table, $indexName)) {
                Schema::table($table, function (Blueprint $t) use ($table, $indexName, $column) {
                    // pm_id is nullable in bids_project_manager — handled separately.
                    $t->unique(['project_id', $column], $indexName);
                });
            }
        }
    }

    public function down(): void
    {
        //
    }

    private function indexExists(string $table, string $indexName): bool
    {
        return collect(Schema::getIndexes($table))->pluck('name')->contains($indexName);
    }
};
