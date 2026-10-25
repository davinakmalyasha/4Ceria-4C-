<?php

namespace App\Support\Schema;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Column drops that survive a schema that has moved on.
 *
 * THE HAZARD
 * ----------
 * A migration's `down()` runs against whatever the LATER migrations left
 * behind, not against the schema that existed when it ran. A later migration
 * that dropped a column, or dropped the table entirely, therefore breaks the
 * earlier migration's `down()` with:
 *
 *     SQLSTATE[42000]: Syntax error or access violation: 1091 Can't DROP 'fee_type';
 *         check that column/key exists
 *     SQLSTATE[42S02]: Base table or view not found: 1146 Table 'rooms' doesn't exist
 *
 * The 219-migration round-trip (`migrate:reset` then `migrate`) was broken by
 * exactly this: `2026_04_20_030903` dropped `bids_project_manager.fee_type` on
 * its way down, and `2026_04_19_232807` then tried to drop the same column
 * again.
 *
 * THE FIX
 * -------
 * Drop only the columns that are actually there. The alternative — making
 * every `down()` perfectly symmetric with its `up()` — is not reachable in
 * practice, because a migration that skipped a column (`if (! hasColumn(...))`)
 * has no memory of having skipped it.
 */
final class ColumnGuard
{
    /**
     * Drop the given columns, skipping any that are not present.
     *
     * @param  list<string>  $columns
     * @return list<string>  The columns that were actually dropped.
     */
    public static function drop(string $table, array $columns): array
    {
        if (! Schema::hasTable($table)) {
            return [];
        }

        $present = array_values(array_filter(
            $columns,
            static fn (string $column): bool => Schema::hasColumn($table, $column)
        ));

        if ($present === []) {
            return [];
        }

        Schema::table($table, function (Blueprint $t) use ($present) {
            $t->dropColumn($present);
        });

        return $present;
    }
}
