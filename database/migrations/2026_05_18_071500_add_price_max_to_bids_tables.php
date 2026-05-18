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
            'bids_arsitek',
            'bids_kontraktor',
            'bids_notaris',
            'bids_interior',
            'bids_structural',
            'bids_mep',
            'bids_project_manager'
        ];

        foreach ($tables as $tableName) {
            if (Schema::hasTable($tableName)) {
                Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                    if (!Schema::hasColumn($table->getTable(), 'price_max')) {
                        $table->decimal('price_max', 15, 2)->nullable()->after('price');
                    }
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = [
            'bids_arsitek',
            'bids_kontraktor',
            'bids_notaris',
            'bids_interior',
            'bids_structural',
            'bids_mep',
            'bids_project_manager'
        ];

        foreach ($tables as $tableName) {
            if (Schema::hasTable($tableName)) {
                Schema::table($tableName, function (Blueprint $table) {
                    if (Schema::hasColumn($table->getTable(), 'price_max')) {
                        $table->dropColumn('price_max');
                    }
                });
            }
        }
    }
};
