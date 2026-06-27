<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $tables = ['bid_arsitek', 'bid_kontraktor', 'bid_notaris', 'bid_interior', 'bid_structural', 'bid_mep', 'bid_project_manager'];
        foreach ($tables as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, 'rejection_reason')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->text('rejection_reason')->nullable();
                });
            }
        }
    }

    public function down(): void
    {
        // no-op
    }
};
