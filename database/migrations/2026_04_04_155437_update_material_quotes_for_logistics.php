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
            $table->string('delivery_method')->nullable()->after('note');
            $table->decimal('shipping_cost', 15, 2)->default(0)->after('delivery_method');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_quotes', function (Blueprint $table) {
            $table->dropColumn(['delivery_method', 'shipping_cost']);
        });
    }
};
