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
        DB::statement("ALTER TABLE projects MODIFY COLUMN status ENUM('open', 'accepted_arsitek', 'accepted_kontraktor', 'awaiting_payment', 'in_progress', 'legal', 'procurement', 'completed_build', 'completed', 'cancelled') NOT NULL DEFAULT 'open'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE projects MODIFY COLUMN status ENUM('open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress', 'legal', 'procurement', 'completed_build', 'completed', 'cancelled') NOT NULL DEFAULT 'open'");
    }
};
