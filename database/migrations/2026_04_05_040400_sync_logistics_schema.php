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
            if (!Schema::hasColumn('material_quotes', 'latitude')) {
                $table->decimal('latitude', 10, 8)->nullable()->after('delivery_address');
            }
            if (!Schema::hasColumn('material_quotes', 'longitude')) {
                $table->decimal('longitude', 11, 8)->nullable()->after('latitude');
            }
            if (!Schema::hasColumn('material_quotes', 'address_detail')) {
                $table->string('address_detail')->nullable()->after('delivery_address');
            }
        });

        Schema::table('material_orders', function (Blueprint $table) {
            if (!Schema::hasColumn('material_orders', 'delivery_address')) {
                $table->text('delivery_address')->nullable()->after('whatsapp_order_id');
            }
            if (!Schema::hasColumn('material_orders', 'latitude')) {
                $table->decimal('latitude', 10, 8)->nullable()->after('delivery_address');
            }
            if (!Schema::hasColumn('material_orders', 'longitude')) {
                $table->decimal('longitude', 11, 8)->nullable()->after('latitude');
            }
            if (!Schema::hasColumn('material_orders', 'address_detail')) {
                $table->string('address_detail')->nullable()->after('delivery_address');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_quotes', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'address_detail']);
        });

        Schema::table('material_orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_address', 'latitude', 'longitude', 'address_detail']);
        });
    }
};
