<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $tables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior'];
        $statuses = "'pending', 'shortlisted', 'invited', 'negotiating', 'contract_pending', 'awaiting_payment', 'accepted', 'active', 'rejected', 'declined'";
        
        foreach ($tables as $table) {
            DB::statement("ALTER TABLE $table MODIFY COLUMN status ENUM($statuses) DEFAULT 'pending'");
        }
    }

    public function down(): void
    {
        $tables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior'];
        $statuses = "'pending', 'shortlisted', 'invited', 'negotiating', 'accepted', 'rejected'";
        
        foreach ($tables as $table) {
            DB::statement("ALTER TABLE $table MODIFY COLUMN status ENUM($statuses) DEFAULT 'pending'");
        }
    }
};
