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
        Schema::table('projects', function (Blueprint $blueprint) {
            $blueprint->timestamp('construction_payment_verified_at')->nullable()->after('design_payment_verified_at');
            $blueprint->timestamp('interior_payment_verified_at')->nullable()->after('construction_payment_verified_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $blueprint) {
            $blueprint->dropColumn(['construction_payment_verified_at', 'interior_payment_verified_at']);
        });
    }
};
