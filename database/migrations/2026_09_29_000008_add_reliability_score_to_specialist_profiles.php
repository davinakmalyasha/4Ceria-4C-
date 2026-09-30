<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Give the two 4C Specialist profiles a `reliability_score`.
 *
 * WHY
 * ---
 * `ProjectTerminationController` penalises reliability when a professional is
 * fired (-10) or resigns (-5), flooring at zero:
 *
 *     $profile->update(['reliability_score' => max(0, ($profile->reliability_score ?? 100) - 10)]);
 *
 * `arsiteks`, `kontraktors`, `interior_profiles`, `notaris_profiles` and
 * `project_managers` all have the column. `structural_engineers` and
 * `mep_engineers` never did — they were added with the 4C Specialist feature
 * and were never given the accountability field the other five had.
 *
 * That was MASKED, not harmless. `fireProfessional` validated role_type
 * against a list that excluded `structural` and `mep`, so the method 422'd
 * before reaching the update and nobody ever saw the missing column. Fixing
 * the validation without fixing the schema turns a clean 422 into a 500 on
 * every structural and MEP termination — the endpoint would appear to succeed
 * right up to the reliability penalty and then fail.
 *
 * `reliability_score` is `int NOT NULL DEFAULT 100`, matching the existing five
 * tables exactly. The controller's `?? 100` fallback reads a column that is
 * NOT NULL, so it never fires; it is retained rather than "cleaned up" because
 * it is the correct guard if the column is ever made nullable.
 */
return new class extends Migration
{
    /**
     * @var list<string>
     */
    private const TABLES = ['structural_engineers', 'mep_engineers'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'reliability_score')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->integer('reliability_score')
                    ->default(100)
                    ->after('rate_harga')
                    ->comment('Deducted on termination (10) or resignation (5); floored at 0.');
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'reliability_score')) {
                continue;
            }

            // Safe to drop only when nothing has been written: under strict
            // mode a narrowing operation on an unexpected value aborts the
            // whole migration, which would abort a `migrate --force` on every
            // replica start.
            if (DB::table($table)->whereNotNull('reliability_score')->where('reliability_score', '<>', 100)->exists()) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('reliability_score');
            });
        }
    }
};