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
        Schema::table('projects', function (Blueprint $table) {
            $table->string('latitude')->nullable();
            $table->string('longitude')->nullable();
            $table->string('province')->nullable();
            $table->string('city')->nullable();
            $table->string('kecamatan')->nullable();
            $table->string('kelurahan')->nullable();
            $table->string('postal_code')->nullable();
            $table->string('street_name')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn([
                'latitude', 'longitude', 'province', 'city', 
                'kecamatan', 'kelurahan', 'postal_code', 'street_name'
            ]);
        });
    }
};
