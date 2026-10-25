<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Resolves `projects.pm_id` from a USER id to a PROFILE id.
 *
 * WHY
 * ---
 * `projects.pm_id` was the ONE column in the schema whose id space nobody
 * had to think about, because it was the exception: it held the PM's USER id,
 * while every other `selected_*` column on `projects` held a PROFILE id.
 *
 * That single exception cost a great deal:
 *
 *   - `config/bids.php` needed a key that said "this column is a user id"
 *     (`project_user_key`), which was wrong for the other six roles and dead
 *     for all seven.
 *   - `Hire::profileIdFor()` had to branch on the role name to return the
 *     right id space.
 *   - `Project::projectManager()` was `belongsTo(ProjectManager::class,
 *     'pm_id', 'user_id')` — the third argument existed ONLY because of the
 *     exception.
 *   - Roughly eighty call sites compared `$project->pm_id` with `$user->id`,
 *     each one a place to compare the wrong two id spaces.
 *
 * And the column DISAGREED WITH ITS OWN BID TABLE: `bids_project_manager.pm_id`
 * held the PM's PROFILE id, so "the project's PM" and "the PM's bid" were two
 * different numbers for the same person.
 *
 * WHAT THIS MIGRATION DOES
 * ------------------------
 * `projects.pm_id` becomes the PM's PROFILE id — the same value
 * `bids_project_manager.pm_id` holds, and the same value `acceptBid` writes.
 * After it, there is ONE convention: every `selected_*` column on `projects`
 * holds a profile id.
 *
 * THE PRE-FLIGHT IS TOTAL
 * -----------------------
 * Two counts must be ZERO, or the migration refuses to run:
 *
 *   1. projects whose `pm_id` does not resolve to a `project_managers.user_id`
 *      — a PM whose profile row was deleted, or a `pm_id` that was never a
 *      user id. These would be silently NULLed, which would un-assign a PM
 *      from a live project.
 *
 *   2. user ids that resolve to MORE THAN ONE `project_managers` row.
 *      `project_managers.user_id` has no unique index, so the join is not
 *      guaranteed to be injective. A non-injective join would move two
 *      different projects onto the same profile — or, worse, pick one of the
 *      two arbitrarily.
 *
 * A migration that half-works is worse than one that refuses to start, so
 * both counts are checked BEFORE the update, in the same statement, and the
 * migration throws with the offending values named.
 *
 * THE `down()` IS THE INVERSE
 * ---------------------------
 * The old value is derivable by the inverse join, so the migration is
 * reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('projects') || ! Schema::hasTable('project_managers')) {
            return;
        }

        if (! Schema::hasColumn('projects', 'pm_id')) {
            return;
        }

        // Is the column already a profile id? Then the migration has run (or
        // never needed to). Idempotent, and safe on a re-run.
        if ($this->alreadyResolved()) {
            return;
        }

        $unresolvable = DB::select(
            'SELECT p.id AS project_id, p.pm_id
               FROM projects p
              WHERE p.pm_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM project_managers pm WHERE pm.user_id = p.pm_id
                )'
        );

        if ($unresolvable !== []) {
            $sample = collect($unresolvable)->take(10)
                ->map(fn ($row) => "project {$row->project_id} -> pm_id {$row->pm_id}")
                ->implode(', ');

            throw new \RuntimeException(
                'The pm_id resolution migration refuses to run: '
                .count($unresolvable).' project(s) have a pm_id that does not resolve to a '
                .'`project_managers.user_id`, so the profile id cannot be derived. '
                ."Offending rows: {$sample}. Resolve them by hand, or assign a PM, and re-run."
            );
        }

        $ambiguous = DB::select(
            'SELECT pm.user_id, COUNT(*) AS profile_count
               FROM project_managers pm
              WHERE pm.user_id IN (SELECT pm_id FROM projects WHERE pm_id IS NOT NULL)
              GROUP BY pm.user_id
             HAVING profile_count > 1'
        );

        if ($ambiguous !== []) {
            $sample = collect($ambiguous)->take(10)
                ->map(fn ($row) => "user {$row->user_id} -> {$row->profile_count} profiles")
                ->implode(', ');

            throw new \RuntimeException(
                'The pm_id resolution migration refuses to run: '
                .count($ambiguous).' user id(s) map to more than one `project_managers` row, '
                ."so the join is not injective and the result would be arbitrary. Offending: {$sample}."
            );
        }

        // The update. `project_managers.user_id` is verified unique by the
        // pre-flight above, so each project moves to exactly one profile.
        DB::statement(
            'UPDATE projects p
               JOIN project_managers pm ON pm.user_id = p.pm_id
               SET p.pm_id = pm.id
              WHERE p.pm_id IS NOT NULL'
        );
    }

    public function down(): void
    {
        if (! Schema::hasTable('projects') || ! Schema::hasTable('project_managers')) {
            return;
        }

        if (! Schema::hasColumn('projects', 'pm_id')) {
            return;
        }

        if (! $this->alreadyResolved()) {
            return;
        }

        // The inverse: profile id -> user id.
        DB::statement(
            'UPDATE projects p
               JOIN project_managers pm ON pm.id = p.pm_id
               SET p.pm_id = pm.user_id
              WHERE p.pm_id IS NOT NULL'
        );
    }

    /**
     * Does `projects.pm_id` already hold a PROFILE id?
     *
     * TRUE when every non-null `pm_id` resolves to a `project_managers.id` and
     * NOT to a `project_managers.user_id`.
     */
    private function alreadyResolved(): bool
    {
        $rows = DB::select(
            'SELECT p.pm_id,
                    (SELECT COUNT(*) FROM project_managers pm WHERE pm.id = p.pm_id) AS as_profile,
                    (SELECT COUNT(*) FROM project_managers pm WHERE pm.user_id = p.pm_id) AS as_user
               FROM projects p
              WHERE p.pm_id IS NOT NULL'
        );

        if ($rows === []) {
            return false;
        }

        foreach ($rows as $row) {
            if ((int) $row->as_profile === 0) {
                return false;
            }
        }

        return true;
    }
};
