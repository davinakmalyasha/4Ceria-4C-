<?php

use App\Support\Schema\ColumnGuard;
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
            // SYMMETRY. The `up()` above adds `fee_type` ONLY when it is
            // absent, and on `bids_project_manager` it was already present —
            // `2026_04_19_232807` had added it. Dropping it here would remove
            // a column this migration never created, and the earlier
            // migration's own `down()` would then fail with
            // 1091 Can't DROP 'fee_type'.
            //
            // So: `fee_type` is dropped only on the four tables where this
            // migration is the one that created it.
            $columns = $table === 'bids_project_manager'
                ? ['unit_price', 'quantity', 'calculated_total']
                : ['fee_type', 'unit_price', 'quantity', 'calculated_total'];

            ColumnGuard::drop($table, $columns);
        }
    }
};
