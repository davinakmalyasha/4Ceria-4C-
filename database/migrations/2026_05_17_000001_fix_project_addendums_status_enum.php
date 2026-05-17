<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // R1: Security - Database constraints must support all application statuses.
        // The previous migration omitted several critical statuses.
        DB::statement("ALTER TABLE project_addendums MODIFY COLUMN status ENUM(
            'pending_approval',
            'approved',
            'approved_unpaid',
            'authorized',
            'verifying',
            'paid',
            'rejected',
            'negotiating',
            'accepted_by_pro'
        ) DEFAULT 'pending_approval'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Revert to the state after the previous migration
        DB::statement("ALTER TABLE project_addendums MODIFY COLUMN status ENUM(
            'pending_approval',
            'approved_unpaid',
            'rejected',
            'paid',
            'negotiating'
        ) DEFAULT 'pending_approval'");
    }
};
