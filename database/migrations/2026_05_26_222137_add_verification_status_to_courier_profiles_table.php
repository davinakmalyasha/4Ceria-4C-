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
        Schema::table('courier_profiles', function (Blueprint $table) {
            $table->string('verification_status')->default('pending');
            $table->text('rejection_reason')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('courier_profiles', function (Blueprint $table) {
            $table->dropColumn(['verification_status', 'rejection_reason']);
        });
    }
};
