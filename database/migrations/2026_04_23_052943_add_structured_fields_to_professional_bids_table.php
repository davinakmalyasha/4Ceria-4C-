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
        // Fix bids_interior (which was missing many columns)
        Schema::table('bids_interior', function (Blueprint $table) {
            if (!Schema::hasColumn('bids_interior', 'scopes')) {
                $table->json('scopes')->nullable()->after('proposal');
            }
            if (!Schema::hasColumn('bids_interior', 'deliverables')) {
                $table->json('deliverables')->nullable()->after('scopes');
            }
            if (!Schema::hasColumn('bids_interior', 'style')) {
                $table->string('style')->nullable()->after('deliverables');
            }
            if (!Schema::hasColumn('bids_interior', 'payment_status')) {
                $table->string('payment_status')->default('unpaid')->after('duration_unit');
            }
            if (!Schema::hasColumn('bids_interior', 'paid_at')) {
                $table->timestamp('paid_at')->nullable()->after('payment_status');
            }
        });

        // Add style to bids_arsitek
        Schema::table('bids_arsitek', function (Blueprint $table) {
            if (!Schema::hasColumn('bids_arsitek', 'style')) {
                $table->string('style')->nullable()->after('deliverables');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_interior', function (Blueprint $table) {
            $table->dropColumn(['scopes', 'deliverables', 'style', 'payment_status', 'paid_at']);
        });

        Schema::table('bids_arsitek', function (Blueprint $table) {
            $table->dropColumn(['style']);
        });
    }
};
