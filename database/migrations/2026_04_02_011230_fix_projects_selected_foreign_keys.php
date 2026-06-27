<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Skip on SQLite — information_schema is MySQL-specific and there are no FK issues on fresh SQLite builds
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        // Only run if columns exist but have bad FKs (won't apply on consolidated fresh install)
        if (!Schema::hasColumn('projects', 'selected_arsitek_id')) {
            return;
        }

        $foreignKeys = DB::select("
            SELECT CONSTRAINT_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'projects'
              AND COLUMN_NAME IN ('selected_arsitek_id', 'selected_kontraktor_id')
              AND REFERENCED_TABLE_NAME IS NOT NULL
        ");

        if (count($foreignKeys) > 0) {
            Schema::table('projects', function (Blueprint $table) use ($foreignKeys) {
                foreach ($foreignKeys as $fk) {
                    $table->dropForeign($fk->CONSTRAINT_NAME);
                }
            });
        }
    }

    public function down(): void
    {
        // No-op
    }
};
