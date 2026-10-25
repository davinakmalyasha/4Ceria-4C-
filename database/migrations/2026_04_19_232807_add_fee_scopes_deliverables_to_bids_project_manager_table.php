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
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->string('fee_type')->nullable()->after('duration_unit');
            $table->json('scopes')->nullable()->after('fee_type');
            $table->json('deliverables')->nullable()->after('scopes');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // `2026_04_20_030903` also drops `fee_type` on its way down, so by the
        // time this migration runs the column may already be gone:
        //
        //     1091 Can't DROP 'fee_type'; check that column/key exists
        //
        // Dropping only what is still there keeps the round-trip reversible.
        ColumnGuard::drop('bids_project_manager', ['fee_type', 'scopes', 'deliverables']);
    }
};
