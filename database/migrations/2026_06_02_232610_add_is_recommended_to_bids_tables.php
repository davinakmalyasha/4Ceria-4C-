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
        $tables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior'];
        foreach ($tables as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                if (!Schema::hasColumn($table->getTable(), 'is_recommended')) {
                    $table->boolean('is_recommended')->default(false)->after('status');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = ['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior'];
        foreach ($tables as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                if (Schema::hasColumn($table->getTable(), 'is_recommended')) {
                    $table->dropColumn('is_recommended');
                }
            });
        }
    }
};
