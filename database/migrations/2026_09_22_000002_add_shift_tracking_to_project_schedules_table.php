<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Track delay-driven target-date shifts without losing the original
     * baseline dates (previously delays were logged but dates never moved).
     */
    public function up(): void
    {
        Schema::table('project_schedules', function (Blueprint $table) {
            $table->date('original_target_end_date')->nullable()->after('target_end_date');
            $table->integer('shifted_days')->default(0)->after('original_target_end_date');
        });
    }

    public function down(): void
    {
        Schema::table('project_schedules', function (Blueprint $table) {
            $table->dropColumn(['original_target_end_date', 'shifted_days']);
        });
    }
};
