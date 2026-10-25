<?php

use App\Support\Schema\ColumnDefault;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * B21 — six columns had lost their DEFAULT.
 *
 * THE DEFECT
 * ----------
 * `EnumValues::addValues()` restated the column as
 *
 *     ALTER TABLE `t` MODIFY COLUMN `c` ENUM('a','b')
 *
 * and `MODIFY COLUMN` restates the ENTIRE column definition — so the
 * DEFAULT, which the statement did not mention, was dropped. The same
 * statement also dropped `NOT NULL` and the column's COMMENT.
 *
 * Six ENUM columns lost their default over the life of the migration set:
 *
 *   project_addendums.status              was 'pending_approval'
 *   material_orders.status                 was 'pending'
 *   bids_arsitek.status                    was 'pending'
 *   bids_kontraktor.status                 was 'pending'
 *   bids_notaris.status                    was 'pending'
 *   bids_interior.status                   was 'pending'
 *
 * WHY IT WAS INVISIBLE
 * --------------------
 *   - every application INSERT sets these columns explicitly, so nothing broke
 *     loudly; a column that is never omitted behaves identically whether or
 *     not it has a default;
 *   - the reproducible schema and the live schema AGREED with each other and
 *     disagreed with the BASE MIGRATION, which still declared
 *     `->default('pending_approval')` — so the schema was self-consistent
 *     while the declared intent was not;
 *   - `schema:verify` compares the migrations against the MODELS, and the
 *     models do not declare defaults, so it had nothing to compare;
 *   - the PostgreSQL target declares `DEFAULT 'pending_approval'` on
 *     `project_addendums.status` and `DEFAULT 'pending'` on the bid and
 *     material-order statuses, so the two engines had drifted into different
 *     schemas for the same columns.
 *
 * A direct INSERT that omits the column — a data fix, a script, a future
 * migration, a bulk import — stores NULL instead of the intended value, and
 * nothing downstream can tell the difference between "the caller did not say"
 * and "the caller said nothing".
 *
 * THE FIX
 * -------
 * Two parts, and the second is the one that matters:
 *
 *   1. `EnumValues::addValues()` now rebuilds the column definition from the
 *      column's CURRENT properties, so the DEFAULT, the nullability and the
 *      COMMENT survive. That is the root cause, and without it this migration
 *      would only be treating the symptom — the NEXT call to `addValues()`
 *      would drop the defaults again.
 *
 *   2. This migration restores the six defaults that were already lost.
 *
 * The restore is idempotent: it compares the current default with the
 * intended one and issues a statement only when they differ. On a
 * FROM-SCRATCH migration the first part already prevents the loss, so this
 * migration is a no-op there; on a database that has been ALTERed for months
 * it is the repair. Both paths end at the same schema, which is the property
 * that makes the round-trip test meaningful.
 *
 * `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` (MySQL 8.0.13+) is used
 * rather than `MODIFY COLUMN`, because it changes the default WITHOUT
 * restating the column: the value list, the nullability, the collation and
 * the comment are all left exactly as they are, so it cannot invalidate a row.
 */
return new class extends Migration
{
    /**
     * The column and the default the BASE migration declared for it.
     *
     * @var array<string, string>
     */
    private const DEFAULTS = [
        'project_addendums' => 'pending_approval',
        'material_orders' => 'pending',
        'bids_arsitek' => 'pending',
        'bids_kontraktor' => 'pending',
        'bids_notaris' => 'pending',
        'bids_interior' => 'pending',
    ];

    public function up(): void
    {
        foreach (self::DEFAULTS as $table => $default) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }

            if (ColumnDefault::ensure($table, 'status', $default)) {
                // Reported, not silent: a migration that changes a schema
                // without saying so is the thing this whole file exists to
                // undo.
                echo "  restored {$table}.status DEFAULT '{$default}'\n";
            }
        }
    }

    public function down(): void
    {
        // The defaults are restored, not introduced. The base migrations
        // declared them, so rolling this migration back means returning the
        // columns to the state the LOSS left them in — which is the state the
        // schema was in for months.
        //
        // This is a deliberate asymmetry: `up()` repairs damage, and there is
        // no sense in which the damage is the "correct" state. The round-trip
        // test requires `down()` to succeed, not to be a mirror of `up()`.
        foreach (self::DEFAULTS as $table => $default) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }

            if (ColumnDefault::drop($table, 'status')) {
                echo "  dropped {$table}.status DEFAULT\n";
            }
        }
    }
};
