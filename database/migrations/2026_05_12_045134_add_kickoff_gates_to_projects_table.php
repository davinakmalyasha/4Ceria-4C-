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
            $table->timestamp('arsitek_kickoff_at')->nullable()->after('interior_payment_verified_at');
            $table->timestamp('kontraktor_kickoff_at')->nullable()->after('arsitek_kickoff_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['arsitek_kickoff_at', 'kontraktor_kickoff_at']);
        });
    }
};
