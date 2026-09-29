<?php

namespace App\Support\Schema;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Additive-only ENUM helpers.
 *
 * WHY THIS EXISTS
 * ---------------
 * `MySQL ENUM` is a footgun in this codebase because it is invisible to
 * application code until it detonates. Writing a value that is not in the list
 * is a hard error under strict mode — AGENTS.md trap #8 records a months-long
 * production outage caused by exactly that.
 *
 * The second, worse failure mode is ALTER. `MODIFY COLUMN ... ENUM(...)`:
 *
 *   - takes ALGORITHM=COPY, which is a full table rebuild with a metadata
 *     lock, not an in-place change;
 *   - under `sql_mode=strict` it FAILS the whole migration if any row holds a
 *     value outside the new list (error 1265), which aborts the `migrate
 *     --force` that runs on EVERY container start;
 *   - under non-strict it silently coerces unknown values to ''.
 *
 * So a migration that "tidies up" an ENUM by rewriting it with a shorter list
 * is both destructive and fragile. Several migrations here did that, and the
 * repairs were themselves migrations (e.g. `2026_05_16_073918` narrowed
 * `project_addendums.status` and dropped `verifying`, and
 * `2026_05_17_000001` — one second later — had to widen it again).
 *
 * The only safe operation is ADDING a value, which MySQL performs in place.
 * `addValue()` below does exactly that, preserving the existing order and
 * appending only what is missing.
 */
final class EnumValues
{
    /**
     * Read the current value list of an ENUM column.
     *
     * @return list<string>
     */
    public static function current(string $table, string $column): array
    {
        $type = self::columnType($table, $column);

        if (! str_contains($type, 'enum(')) {
            return [];
        }

        // Extract the quoted members of `enum('a','b','c')`. MySQL escapes a
        // literal quote inside a member as two single quotes.
        $inner = Str::between($type, 'enum(', ')');

        if ($inner === '') {
            return [];
        }

        return array_map(
            static fn (string $value) => str_replace("''", "'", trim($value, "'")),
            str_getcsv($inner, ',', "'", '"')
        );
    }

    /**
     * Append any missing values to an ENUM, leaving the existing order intact.
     *
     * A no-op when every value is already present, so it is safe on a database
     * that has been ALTERed many times and safe to re-run.
     *
     * @param  list<string>  $values
     * @return list<string>  The value list that is now in force.
     */
    public static function addValues(string $table, string $column, array $values): array
    {
        $current = self::current($table, $column);

        if ($current === []) {
            return [];
        }

        $missing = array_values(array_diff($values, $current));

        if ($missing === []) {
            return $current;
        }

        // Preserve the existing order, then append. Never reorders, never
        // removes — so no row can be invalidated by this statement.
        $next = array_values(array_unique(array_merge($current, $missing)));

        $definition = implode(',', array_map(
            static fn (string $value) => "'" . str_replace("'", "''", $value) . "'",
            $next
        ));

        DB::statement("ALTER TABLE `{$table}` MODIFY COLUMN `{$column}` ENUM({$definition})");

        return $next;
    }

    /**
     * Warn about values present in the table that a migration is about to
     * declare illegal. Call BEFORE any narrowing operation.
     *
     * @param  list<string>  $values
     * @return list<string>  The offending values actually present in the data.
     */
    public static function valuesInUseOutside(string $table, string $column, array $values): array
    {
        $present = self::current($table, $column);

        if ($present === []) {
            return [];
        }

        $rows = DB::select(
            "SELECT DISTINCT `{$column}` AS v FROM `{$table}` WHERE `{$column}` IS NOT NULL"
        );

        $allowed = array_flip($values);

        return array_values(array_filter(
            array_map(static fn ($row) => (string) $row->v, $rows),
            static fn (string $value) => ! isset($allowed[$value])
        ));
    }

    private static function columnType(string $table, string $column): string
    {
        $database = DB::getDatabaseName();

        $row = DB::selectOne(
            'SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$database, $table, $column]
        );

        return $row ? (string) $row->t : '';
    }
}
