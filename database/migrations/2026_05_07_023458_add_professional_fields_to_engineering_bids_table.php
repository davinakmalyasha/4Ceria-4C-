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
        Schema::table('bids_structural', function (Blueprint $table) {
            $table->string('license_number')->nullable()->after('structural_id');
            $table->integer('experience_years')->nullable()->after('license_number');
        });

        Schema::table('bids_mep', function (Blueprint $table) {
            $table->string('license_number')->nullable()->after('mep_id');
            $table->integer('experience_years')->nullable()->after('license_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_structural', function (Blueprint $table) {
            $table->dropColumn(['license_number', 'experience_years']);
        });

        Schema::table('bids_mep', function (Blueprint $table) {
            $table->dropColumn(['license_number', 'experience_years']);
        });
    }
};
