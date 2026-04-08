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
        Schema::table('material_orders', function (Blueprint $table) {
            $table->string('delivery_method')->nullable()->after('whatsapp_order_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_orders', function (Blueprint $table) {
            $table->dropColumn('delivery_method');
        });
    }
};
