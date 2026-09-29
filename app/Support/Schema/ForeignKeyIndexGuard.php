<?php

namespace App\Support\Schema;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Foreign-key-safe index management for migrations.
 *
 * THE HAZARD
 * ----------
 * MySQL/InnoDB backs a foreign key with the *leftmost* index whose leading
 * column matches the FK column. It creates one at constraint-creation time only
 * if no suitable index already exists, and it will happily adopt a composite
 * index as the backing store.
 *
 * The consequence is that an index you did not think of as structural becomes
 * load-bearing, and dropping it later fails with:
 *
 *     SQLSTATE[HY000]: General error: 1553 Cannot drop index '<name>':
 *         needed in a foreign key constraint
 *
 * This repository hit that twice, and in both cases only on a from-scratch
 * migration — a database that had been ALTERed for months already carried an
 * incidental index that absorbed the foreign key, so the drop silently worked
 * locally while `migrate:fresh` and `migrate:rollback` were permanently broken:
 *
 *   - `2026_09_23_000002_enable_partial_refunds` dropped
 *     `budget_tx_reference_unique`, whose leading column is `project_id`. The
 *     dedicated `budget_tx_project_type_idx` that would have covered the
 *     foreign key is added by `2026_09_23_000010`, which runs LATER.
 *   - `2026_09_23_000010_add_hot_path_indexes` dropped
 *     `project_activity_logs_project_created_idx`. `project_activity_logs` has
 *     no standalone `project_id` index at all, so that composite was the
 *     constraint's only backing store.
 *
 * THE FIX
 * -------
 * Before dropping an index, guarantee that a different index can carry the
 * foreign key: if the index being dropped is the only one starting with the FK
 * column, create a plain single-column index on that column first. The drop then
 * succeeds on any schema, at the cost of one extra index.
 *
 * The complementary move is `ensureForeignKeyIndex()` when ADDING a composite
 * over a foreign-key column, so the composite stays purely additive — and
 * therefore reversible — instead of silently becoming structural.
 */
final class ForeignKeyIndexGuard
{
    /**
     * Drop an index, first guaranteeing that no foreign key depends on it.
     *
     * @param  string  $table
     * @param  string  $indexName
     * @param  string|null  $leadingColumn  Auto-detected from the index
     *                                      definition when omitted.
     */
    public static function dropIndex(string $table, string $indexName, ?string $leadingColumn = null): void
    {
        if (! Schema::hasTable($table) || ! self::exists($table, $indexName)) {
            return;
        }

        $leading = $leadingColumn ?? (self::definition($table, $indexName)['columns'][0] ?? null);

        if ($leading !== null) {
            self::ensureBackingIndex($table, $leading, $indexName);
        }

        Schema::table($table, function (Blueprint $t) use ($indexName) {
            $t->dropIndex($indexName);
        });
    }

    /**
     * Guarantee that some index other than $exceptIndex starts with $column.
     *
     * Call this when adding a composite whose leading column is a foreign key,
     * so the composite never becomes the constraint's only backing store.
     *
     * @param  string  $table
     * @param  string  $column
     * @param  string|null  $exceptIndex  An index that is about to be dropped
     *                                    and therefore does not count.
     */
    public static function ensureBackingIndex(string $table, string $column, ?string $exceptIndex = null): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
            return;
        }

        $alreadyCovered = collect(Schema::getIndexes($table))->contains(
            fn (array $index) => self::startsWith($index, $column, $exceptIndex)
        );

        if ($alreadyCovered) {
            return;
        }

        $name = self::availableName($table, $column, $exceptIndex);

        Schema::table($table, function (Blueprint $t) use ($column, $name) {
            $t->index($column, $name);
        });
    }

    public static function exists(string $table, string $indexName): bool
    {
        if (! Schema::hasTable($table)) {
            return false;
        }

        return collect(Schema::getIndexes($table))->pluck('name')->contains($indexName);
    }

    /**
     * @return array<string, mixed>
     */
    public static function definition(string $table, string $indexName): array
    {
        $index = collect(Schema::getIndexes($table))->firstWhere('name', $indexName);

        return $index ?: [];
    }

    /**
     * @param  array<string, mixed>  $index
     */
    private static function startsWith(array $index, string $column, ?string $exceptIndex): bool
    {
        $name = $index['name'] ?? '';

        if ($name === 'PRIMARY') {
            return false;
        }

        if ($exceptIndex !== null && $name === $exceptIndex) {
            return false;
        }

        return ($index['columns'][0] ?? null) === $column;
    }

    /**
     * Deterministic, collision-free name for a protective index.
     */
    private static function availableName(string $table, string $column, ?string $exceptIndex): string
    {
        $taken = collect(Schema::getIndexes($table))->pluck('name');
        $base = $table . '_' . $column . '_fk_support';
        $name = $base;

        // Both guards: the name may already exist, and it may be exactly the
        // index about to be dropped — in which case reusing it would drop the
        // protection we just created.
        for ($i = 2; $taken->contains($name) || $name === $exceptIndex; $i++) {
            $name = $base . '_' . $i;
        }

        return $name;
    }
}
