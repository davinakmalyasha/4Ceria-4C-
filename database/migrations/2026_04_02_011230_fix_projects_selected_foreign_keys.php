<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Discover and drop ALL foreign keys on selected_arsitek_id and selected_kontraktor_id
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

        // Ensure columns are nullable unsigned bigint (no FK constraint)
        Schema::table('projects', function (Blueprint $table) {
            $table->unsignedBigInteger('selected_arsitek_id')->nullable()->change();
            $table->unsignedBigInteger('selected_kontraktor_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // No-op: we intentionally removed bad foreign keys
    }
};
