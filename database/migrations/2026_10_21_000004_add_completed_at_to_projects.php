<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * B25 — `POST /api/projects/{project}/mark-complete` answered 500.
 *
 * THE DEFECT
 * ----------
 * The endpoint completes a project:
 *
 *     $project->update([
 *         'status' => 'completed',
 *         'completed_at' => now(),
 *     ]);
 *
 * and `projects` has no `completed_at` column. The projects table has
 * `completed_phases` — a JSON column listing which phases are done — and
 * five phase-level timestamps (`design_completed_at`,
 * `construction_completed_at`, `interior_completed_at`,
 * `legal_completed_at`), but nothing recording WHEN the project as a whole
 * was completed.
 *
 * So the write was rejected:
 *
 *     Add fillable property [completed_at] to allow mass assignment on
 *     [App\Models\Project]
 *
 * — or, with the column added and the model not fillable, a column that
 * does not exist. Either way the endpoint could not complete a project, and
 * the owner got a 500 for the one action that ends their project.
 *
 * WHY A COLUMN AND NOT A CONTROLLER CHANGE
 * ---------------------------------------
 * The project has a `status` ENUM with a `completed` member, and the
 * endpoint already sets it. The missing piece is the TIMESTAMP — and the
 * rest of the domain asks for it: the portfolio, the owner's project list
 * and the "completed projects" count all need to know WHEN a project
 * ended, and a status alone cannot say that.
 *
 * `completed_at` is nullable, so a project that has not been completed has
 * no value, and the column is added at the END of the table so the existing
 * column order is untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('projects')) {
            return;
        }

        if (Schema::hasColumn('projects', 'completed_at')) {
            return;
        }

        Schema::table('projects', function (Blueprint $table) {
            $table->timestamp('completed_at')->nullable()->after('walkthrough_status');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('projects')) {
            return;
        }

        if (! Schema::hasColumn('projects', 'completed_at')) {
            return;
        }

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('completed_at');
        });
    }
};
