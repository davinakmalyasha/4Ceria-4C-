<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $tables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior', 'bids_structural', 'bids_mep'];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $tableSchema) {
                $tableSchema->json('proposed_termins')->nullable();
                $tableSchema->json('proposed_milestones')->nullable();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior', 'bids_structural', 'bids_mep'];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $tableSchema) {
                $tableSchema->dropColumn(['proposed_termins', 'proposed_milestones']);
            });
        }
    }
};
