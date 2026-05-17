<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Update ENUMs for tables that use them
        $enumTables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior'];
        foreach ($enumTables as $table) {
            DB::statement("ALTER TABLE $table MODIFY COLUMN status ENUM('pending', 'shortlisted', 'invited', 'negotiating', 'accepted', 'rejected') DEFAULT 'pending'");
        }

        // 2. Add negotiation columns to ALL bid tables
        $allBidTables = [
            'bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior', 
            'bids_project_manager', 'bids_structural', 'bids_mep'
        ];

        foreach ($allBidTables as $table) {
            Schema::table($table, function (Blueprint $table) {
                if (!Schema::hasColumn($table->getTable(), 'offered_by_id')) {
                    $table->foreignId('offered_by_id')->nullable()->constrained('users')->onDelete('set null');
                }
                if (!Schema::hasColumn($table->getTable(), 'fee_agreed_at')) {
                    $table->timestamp('fee_agreed_at')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        $allBidTables = [
            'bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior', 
            'bids_project_manager', 'bids_structural', 'bids_mep'
        ];

        foreach ($allBidTables as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropForeign(['offered_by_id']);
                $table->dropColumn(['offered_by_id', 'fee_agreed_at']);
            });
        }

        $enumTables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior'];
        foreach ($enumTables as $table) {
            DB::statement("ALTER TABLE $table MODIFY COLUMN status ENUM('pending', 'shortlisted', 'accepted', 'rejected') DEFAULT 'pending'");
        }
    }
};
