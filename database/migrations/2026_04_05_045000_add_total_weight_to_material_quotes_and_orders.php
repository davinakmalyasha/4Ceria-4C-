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
        Schema::table('material_quotes', function (Blueprint $table) {
            $table->string('total_weight')->nullable()->after('total_amount');
        });

        Schema::table('material_orders', function (Blueprint $table) {
            $table->string('total_weight')->nullable()->after('total_price');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_quotes', function (Blueprint $table) {
            $table->dropColumn('total_weight');
        });

        Schema::table('material_orders', function (Blueprint $table) {
            $table->dropColumn('total_weight');
        });
    }
};
