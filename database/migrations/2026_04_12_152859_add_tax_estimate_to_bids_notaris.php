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
        Schema::table('bids_notaris', function (Blueprint $table) {
            $table->decimal('tax_estimate', 15, 2)->nullable()->after('price');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_notaris', function (Blueprint $table) {
            $table->dropColumn('tax_estimate');
        });
    }
};
