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
        Schema::table('delivery_jobs', function (Blueprint $table) {
            $table->json('pickup_photos')->nullable();
            $table->json('delivery_photos')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('delivery_jobs', function (Blueprint $table) {
            $table->dropColumn(['pickup_photos', 'delivery_photos']);
        });
    }
};
