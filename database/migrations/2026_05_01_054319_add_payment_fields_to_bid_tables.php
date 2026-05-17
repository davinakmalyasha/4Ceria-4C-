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
        $tables = [
            'bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior',
            'bids_project_manager', 'bids_structural', 'bids_mep'
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->string('payment_proof_path')->nullable();
                $table->text('verification_notes')->nullable();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = [
            'bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior',
            'bids_project_manager', 'bids_structural', 'bids_mep'
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropColumn(['payment_proof_path', 'verification_notes']);
            });
        }
    }
};
