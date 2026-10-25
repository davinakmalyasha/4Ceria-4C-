<?php

namespace App\Support\Schema;

use Illuminate\Support\Facades\DB;

/**
 * Column defaults that survive an ALTER.
 *
 * WHY THIS EXISTS
 * ---------------
 * A column's DEFAULT is easy to lose and hard to notice.
 *
 * `EnumValues::addValues()` had the bug: it restated the column as
 *
 *     ALTER TABLE `t` MODIFY COLUMN `c` ENUM('a','b')
 *
 * and `MODIFY COLUMN` restates the ENTIRE column definition, so the DEFAULT
 * — which the statement did not mention — was dropped. Six columns had lost
 * theirs over the life of the migration set, and nothing said so:
 *
 *   - the base migration declared `->default('pending_approval')`, so the
 *     reproducible schema and the base migration disagreed with each other;
 *   - every application INSERT happened to set the column explicitly, so
 *     nothing broke loudly;
 *   - `schema:verify` compares the migrations against the MODELS, and the
 *     models do not declare defaults either, so it did not see it;
 *   - the PostgreSQL target declared `DEFAULT 'pending_approval'`, so the two
 *     engines ended up with different schemas for the same column.
 *
 * THE FIX
 * -------
 * `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` (MySQL 8.0.13+) changes the
 * default WITHOUT restating the column. The value list, the nullability, the
 * collation and the comment are all left exactly as they were, so there is
 * no way for this operation to invalidate a row.
 *
 * The alternative — `MODIFY COLUMN` with the full definition restated — is
 * the operation that caused the damage in the first place.
 */
final class ColumnDefault
{
    /**
     * The column's current default, as reported by the server.
     *
     * MySQL reports a literal default WITHOUT its quotes, so 'pending' comes
     * back as `pending`. A column with no default reports NULL.
     */
    public static function current(string $table, string $column): ?string
    {
        $row = DB::selectOne(
            'SELECT COLUMN_DEFAULT AS `default`
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [DB::getDatabaseName(), $table, $column]
        );

        if (! $row || $row->default === null) {
            return null;
        }

        return (string) $row->default;
    }

    /**
     * Give the column a default, if it does not already have that one.
     *
     * @return bool  Whether a statement was run.
     */
    public static function ensure(string $table, string $column, string $default): bool
    {
        $current = self::current($table, $column);

        if ($current === $default) {
            return false;
        }

        DB::statement(
            "ALTER TABLE `{$table}` ALTER COLUMN `{$column}` SET DEFAULT "
            .self::quoteLiteral($default)
        );

        return true;
    }

    /**
     * Remove the column's default, if it has one.
     *
     * @return bool  Whether a statement was run.
     */
    public static function drop(string $table, string $column): bool
    {
        if (self::current($table, $column) === null) {
            return false;
        }

        DB::statement("ALTER TABLE `{$table}` ALTER COLUMN `{$column}` DROP DEFAULT");

        return true;
    }

    /**
     * Quote a string as a MySQL literal.
     */
    private static function quoteLiteral(string $value): string
    {
        return "'" . str_replace("'", "''", $value) . "'";
    }
}
