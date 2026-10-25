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
        if (!Schema::hasTable('rooms')) return;
        if (Schema::hasColumn('rooms', 'type')) return;
        Schema::table('rooms', function (Blueprint $table) {
            $table->string('type')->default('room')->after('name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // The `up()` above was a NO-OP on a from-scratch migration: `rooms` did
        // not exist yet, because `2026_04_17_999999_restore_legacy_tables`
        // creates it later. On the way back down, that later migration drops
        // `rooms` again, so this one has to tolerate the table being gone:
        //
        //     1146 Table 'rooms' doesn't exist
        if (! Schema::hasTable('rooms')) {
            return;
        }

        if (! Schema::hasColumn('rooms', 'type')) {
            return;
        }

        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
