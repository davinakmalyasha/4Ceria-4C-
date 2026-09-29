<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Allow every licensed role as a sub-professional's `parent_role`.
 *
 * THE BUG
 * -------
 * `project_sub_professionals.parent_role` was `ENUM('arsitek','kontraktor')` —
 * the two roles that predate the "4C Specialist" feature. But
 * `ProjectBudgetController::markPaid` writes `$addendum->role_type` straight
 * into that column, and the 4C Specialist flow exists precisely for the roles
 * that were never in the list:
 *
 *     'structural' => $project->update(['structural_id' => ...])
 *     'mep'        => $project->update(['mep_id' => ...])
 *
 * So hiring a structural engineer or an MEP engineer through a specialist
 * addendum wrote a value outside the ENUM. Under `sql_mode=strict` that is
 * error 1265 (AGENTS.md trap #8), the exception propagated out of `markPaid`,
 * and the endpoint returned 500 — for EVERY structural and MEP specialist
 * hire, on every environment.
 *
 * The wider damage is that the failure is atomic: the whole `markPaid`
 * transaction rolls back, so the owner could not hire a structural or MEP
 * specialist at all. A whole class of the product's own headline feature was
 * unreachable, and nothing reported it.
 *
 * The fix is additive, via `EnumValues::addValues()` — never a hand-written
 * `MODIFY COLUMN` with a hand-written list (AGENTS.md trap #9): the helper
 * preserves the existing order and only appends, so no row can be invalidated
 * and the statement is a no-op on a database that is already correct.
 */
return new class extends Migration
{
    /**
     * The seven licensed professional roles, matching `config/bids.php`.
     *
     * @var list<string>
     */
    private const ROLES = [
        'arsitek',
        'kontraktor',
        'notaris',
        'interior',
        'structural',
        'mep',
        'project_manager',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('project_sub_professionals')
            || ! Schema::hasColumn('project_sub_professionals', 'parent_role')) {
            return;
        }

        EnumValues::addValues('project_sub_professionals', 'parent_role', self::ROLES);
    }

    /**
     * Narrow back to the original two roles.
     *
     * Deliberately CONDITIONAL. `EnumValues::addValues()` is append-only by
     * design, and this is the one place a narrowing is legitimate: a rollback of
     * a migration that only ever added values. It still refuses to run if any
     * row now holds an added value, because under strict mode the ALTER would
     * fail with error 1265 and abort the `migrate:rollback` inside
     * `scripts/verify-schema.cmd` — and because silently coercing those rows to
     * `''` would destroy real hire records.
     *
     * On a freshly migrated database there is nothing to preserve, so the round
     * trip in the verify script completes normally.
     */
    public function down(): void
    {
        if (! Schema::hasTable('project_sub_professionals')
            || ! Schema::hasColumn('project_sub_professionals', 'parent_role')) {
            return;
        }

        $offending = DB::select(
            "SELECT DISTINCT `parent_role` AS v FROM `project_sub_professionals`
             WHERE `parent_role` IS NOT NULL AND `parent_role` NOT IN ('arsitek','kontraktor')"
        );

        if ($offending !== []) {
            // Leaving the column WIDE is harmless; narrowing it here is not.
            // The migration is still recorded as reverted, which is the correct
            // trade: the schema is a superset of what `down()` promises.
            return;
        }

        DB::statement(
            "ALTER TABLE `project_sub_professionals`
             MODIFY COLUMN `parent_role` ENUM('arsitek','kontraktor')"
        );
    }
};
