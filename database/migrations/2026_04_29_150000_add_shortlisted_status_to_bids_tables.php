<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Expand ENUM columns to include 'shortlisted'
        DB::statement("ALTER TABLE bids_arsitek MODIFY COLUMN status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending'");
        DB::statement("ALTER TABLE bids_kontraktor MODIFY COLUMN status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending'");
        DB::statement("ALTER TABLE bids_notaris MODIFY COLUMN status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending'");
        DB::statement("ALTER TABLE bids_interior MODIFY COLUMN status ENUM('pending','shortlisted','accepted','rejected') DEFAULT 'pending'");
        // bids_project_manager, bids_structural, bids_mep use STRING columns — no schema change needed
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE bids_arsitek MODIFY COLUMN status ENUM('pending','accepted','rejected') DEFAULT 'pending'");
        DB::statement("ALTER TABLE bids_kontraktor MODIFY COLUMN status ENUM('pending','accepted','rejected') DEFAULT 'pending'");
        DB::statement("ALTER TABLE bids_notaris MODIFY COLUMN status ENUM('pending','accepted','rejected') DEFAULT 'pending'");
        DB::statement("ALTER TABLE bids_interior MODIFY COLUMN status ENUM('pending','accepted','rejected') DEFAULT 'pending'");
    }
};
