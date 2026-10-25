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
     * THE COLUMN'S OTHER PROPERTIES ARE PRESERVED
     * -------------------------------------------
     * `MODIFY COLUMN` restates the ENTIRE column definition, so anything the
     * new statement does not mention is dropped. The first version of this
     * method restated only the value list:
     *
     *     ALTER TABLE `t` MODIFY COLUMN `c` ENUM('a','b')
     *
     * which silently changed THREE things the caller never asked for:
     *
     *   - the DEFAULT became NULL. The base migration declared
     *     `->default('pending_approval')`, and after the first call to this
     *     method the column had no default at all — so an INSERT that omitted
     *     the column stored NULL. Every application insert happened to set the
     *     column explicitly, so nothing broke loudly, and the loss was
     *     invisible: the reproducible schema and the live schema agreed with
     *     each other and disagreed with the BASE MIGRATION. The PostgreSQL
     *     target declares `DEFAULT 'pending_approval'`, so the two engines
     *     ended up with different schemas for the same column.
     *   - the column became NULLABLE, because `MODIFY COLUMN` without
     *     `NOT NULL` drops the attribute.
     *   - the column's COMMENT was dropped.
     *
     * So the definition is now rebuilt from the column's CURRENT properties.
     * The value list is the only thing this method is allowed to change.
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

        DB::statement(self::modifyStatement($table, $column, self::definition($table, $column, $next)));

        return $next;
    }

    /**
     * The column definition an `addValues()` call would install.
     *
     * PUBLIC so that it can be tested WITHOUT running DDL. A test that
     * ALTERs a table cannot be rolled back — MySQL commits implicitly on
     * `ALTER TABLE` — so the behaviour of this method is asserted against the
     * generated definition instead, which is the thing that actually decides
     * whether a default survives.
     *
     * @param  list<string>  $values  The full value list, in order.
     * @return string  The definition, or '' when the column is not an ENUM.
     */
    public static function definition(string $table, string $column, array $values): string
    {
        if ($values === []) {
            return '';
        }

        $properties = self::columnProperties($table, $column);

        $definition = implode(',', array_map(
            static fn (string $value): string => "'" . str_replace("'", "''", $value) . "'",
            $values
        ));

        $definition = 'ENUM('.$definition.')';

        // The nullability. `MODIFY COLUMN` without it drops `NOT NULL`.
        $definition .= $properties['nullable'] ? ' NULL' : ' NOT NULL';

        // The default, if the column had one. Omitting the clause removes it.
        if ($properties['default'] !== null) {
            $definition .= ' DEFAULT '.self::defaultLiteral($properties['default']);
        }

        // The comment, if the column had one. Omitting the clause removes it.
        if ($properties['comment'] !== null && $properties['comment'] !== '') {
            $definition .= ' COMMENT '.self::quoteLiteral($properties['comment']);
        }

        return $definition;
    }

    /**
     * Build the `MODIFY COLUMN` statement, restating every property of the
     * column except its value list.
     *
     * @param  string  $definition  The full new column definition.
     */
    private static function modifyStatement(string $table, string $column, string $definition): string
    {
        return "ALTER TABLE `{$table}` MODIFY COLUMN `{$column}` {$definition}";
    }

    /**
     * The column's current nullability, default and comment.
     *
     * @return array{nullable: bool, default: string|null, comment: string|null}
     */
    private static function columnProperties(string $table, string $column): array
    {
        $row = DB::selectOne(
            'SELECT IS_NULLABLE AS nullable,
                    COLUMN_DEFAULT AS `default`,
                    COLUMN_COMMENT AS `comment`
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [DB::getDatabaseName(), $table, $column]
        );

        if (! $row) {
            return ['nullable' => true, 'default' => null, 'comment' => null];
        }

        return [
            'nullable' => strtoupper((string) $row->nullable) === 'YES',
            // MySQL reports a NULL default as a NULL COLUMN_DEFAULT. A literal
            // default is reported WITHOUT its quotes, so it is stored here
            // unquoted and quoted at the point of use.
            'default' => $row->default === null ? null : (string) $row->default,
            'comment' => $row->comment === null ? null : (string) $row->comment,
        ];
    }

    /**
     * Render a reported default as a SQL literal.
     *
     * `information_schema` reports a string default WITHOUT its quotes, so a
     * bare word has to be quoted again on the way out. A number and a function
     * call are already valid expressions and must be passed through.
     */
    private static function defaultLiteral(string $default): string
    {
        if (preg_match('/^-?\d+(\.\d+)?$/', $default) === 1) {
            return $default;
        }

        // CURRENT_TIMESTAMP, NOW(), (expr) — pass through untouched.
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)$/', $default) === 1) {
            return $default;
        }

        return self::quoteLiteral($default);
    }

    /**
     * Quote a string as a MySQL literal.
     */
    private static function quoteLiteral(string $value): string
    {
        return "'" . str_replace("'", "''", $value) . "'";
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
