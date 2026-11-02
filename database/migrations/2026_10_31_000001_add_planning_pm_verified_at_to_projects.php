<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `planning_pm_verified_at` is written by the planning machine but never
 * existed as a column — and was not fillable either.
 *
 * `ProjectController::verifyPlanningPM()` and `rejectPlanning()` both set
 * it, so under `Model::shouldBeStrict()` every PM verification of a
 * design brief raised a MassAssignmentException (500) — the PM half of
 * the planning flow could not complete for any project. The column is
 * additive and nullable, so existing rows are untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (! Schema::hasColumn('projects', 'planning_pm_verified_at')) {
                $table->timestamp('planning_pm_verified_at')->nullable()->after('planning_approved_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (Schema::hasColumn('projects', 'planning_pm_verified_at')) {
                $table->dropColumn('planning_pm_verified_at');
            }
        });
    }
};
