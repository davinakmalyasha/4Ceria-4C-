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
            $table->string('address_detail')->nullable()->after('delivery_address');
        });

        Schema::table('material_orders', function (Blueprint $table) {
            $table->string('address_detail')->nullable()->after('delivery_address');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_quotes', function (Blueprint $table) {
            $table->dropColumn('address_detail');
        });

        Schema::table('material_orders', function (Blueprint $table) {
            $table->dropColumn('address_detail');
        });
    }
};
