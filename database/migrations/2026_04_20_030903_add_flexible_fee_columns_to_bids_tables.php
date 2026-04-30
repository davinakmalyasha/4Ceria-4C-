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
            'bids_notaris',
            'bids_kontraktor',
            'bids_interior',
            'bids_project_manager'
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $table) {
                // Only add if not already exists (BidProjectManager might have some)
                if (!Schema::hasColumn($table->getTable(), 'fee_type')) {
                    $table->string('fee_type', 50)->nullable()->default('fixed')->after('price');
                }
                if (!Schema::hasColumn($table->getTable(), 'unit_price')) {
                    $table->bigInteger('unit_price')->nullable()->after('fee_type');
                }
                if (!Schema::hasColumn($table->getTable(), 'quantity')) {
                    $table->decimal('quantity', 15, 2)->nullable()->after('unit_price');
                }
                if (!Schema::hasColumn($table->getTable(), 'calculated_total')) {
                    $table->bigInteger('calculated_total')->nullable()->after('quantity');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = [
            'bids_arsitek',
            'bids_notaris',
            'bids_kontraktor',
            'bids_interior',
            'bids_project_manager'
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropColumn(['fee_type', 'unit_price', 'quantity', 'calculated_total']);
            });
        }
    }
};
