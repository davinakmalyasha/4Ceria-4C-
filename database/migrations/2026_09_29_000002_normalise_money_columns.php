<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Normalise every money column to ONE precision, and cast every one of them.
 *
 * WHY
 * ---
 * The escrow ledger (`project_budget_transactions.amount`) is `decimal(24,2)`
 * and is the reference. Everything else had drifted away from it:
 *
 *   - `project_payment_termins.amount` is `bigint`, so a termin cannot hold the
 *     sen its own `net_amount` / `retention_amount` columns are declared to.
 *   - `bids_mep.price` and `bids_structural.price` are `bigint` while their five
 *     siblings are `decimal`.
 *   - `bids_*.calculated_total` and `bids_*.unit_price` are all `bigint` (14
 *     columns) while the amounts they produce are `decimal(24,2)`.
 *   - 41 columns sit at `decimal(15,2)`, which caps at Rp 1 trillion. A
 *     `project_requirements.external_cost` is PER LINE ITEM, so a large project
 *     reaches that ceiling on a single row — and under `sql_mode=strict` that is
 *     a hard error mid-transaction, not a rounding.
 *
 * 17 columns to widen from `bigint`, 41 to widen from `decimal(15,2)`.
 *
 * WHY RAW SQL INSTEAD OF ->change()
 * ---------------------------------
 * Laravel 11 removed doctrine/dbal, so `->change()` requires re-declaring the
 * column in full — and getting `nullable`, `default`, `comment` or position
 * wrong silently changes behaviour. Instead each statement is built from the
 * column's CURRENT definition read out of information_schema, so only the type
 * changes and everything else is preserved by construction. This is the same
 * read-then-rebuild pattern used by
 * `2026_09_23_000001_add_termination_pending_to_projects_status`, and the same
 * rule AGENTS.md trap 9 states for ENUMs: never rewrite a type blind.
 *
 * WHY `currency` IS NOT ADDED HERE
 * -------------------------------
 * `App\Support\Money` already carries a currency through every calculation and
 * throws rather than mixing two, so the CODE is currency-safe today. A
 * `currency` column on fourteen tables would be fourteen columns of 'IDR' with
 * nothing reading them, until the Phase 6 gateway introduces a real second
 * currency. It lands with the gateway instead, where it is used from day one —
 * which is a forward-only ADD of a column with a default, not a rewrite of
 * every money column in the schema.
 *
 * COST
 * ----
 * `bigint` -> `decimal(24,2)` is a type change, so MySQL performs an
 * `ALGORITHM=COPY` table rebuild with a metadata lock. The `decimal(15,2)` ->
 * `decimal(24,2)` widenings are metadata-only. The affected tables are small
 * (bids and termins are per-project), and the container entrypoint runs this
 * before serving traffic.
 */
return new class extends Migration
{
    /**
     * Every money column in the schema, as `table.column`.
     *
     * A FLAT LIST, not a table-keyed map: several tables appear twice (once for
     * their `bigint` columns, once for their `decimal(15,2)` ones) and a PHP
     * array literal silently keeps only the last value for a repeated key.
     *
     * @var list<string>
     */
    private const MONEY_COLUMNS = [
        // --- the reference column, already correct
        'project_budget_transactions.amount',

        // --- bigint -> decimal(24,2): the lossy-to-fix group
        'project_payment_termins.amount',
        'bids_arsitek.calculated_total',
        'bids_arsitek.unit_price',
        'bids_kontraktor.calculated_total',
        'bids_kontraktor.unit_price',
        'bids_notaris.calculated_total',
        'bids_notaris.unit_price',
        'bids_interior.calculated_total',
        'bids_interior.unit_price',
        'bids_project_manager.calculated_total',
        'bids_project_manager.unit_price',
        'bids_structural.price',
        'bids_structural.calculated_total',
        'bids_structural.unit_price',
        'bids_mep.price',
        'bids_mep.calculated_total',
        'bids_mep.unit_price',

        // --- decimal(15,2) / (16,2) -> decimal(24,2)
        'bids_arsitek.price',
        'bids_arsitek.price_max',
        'bids_arsitek.quantity',
        'bids_arsitek.refunded_amount',
        'bids_kontraktor.price',
        'bids_kontraktor.price_max',
        'bids_kontraktor.quantity',
        'bids_kontraktor.refunded_amount',
        'bids_notaris.price',
        'bids_notaris.price_max',
        'bids_notaris.quantity',
        'bids_notaris.refunded_amount',
        'bids_interior.price',
        'bids_interior.price_max',
        'bids_interior.quantity',
        'bids_interior.refunded_amount',
        'bids_project_manager.price',
        'bids_project_manager.price_max',
        'bids_project_manager.quantity',
        'bids_project_manager.refunded_amount',
        'bids_structural.price_max',
        'bids_structural.quantity',
        'bids_structural.refunded_amount',
        'bids_mep.price_max',
        'bids_mep.quantity',
        'bids_mep.refunded_amount',
        'project_payment_termins.retention_amount',
        'project_payment_termins.net_amount',
        'project_payment_termins.refunded_amount',
        'project_addendums.refunded_amount',
        'material_orders.refunded_amount',
        'material_orders.shipping_cost',
        'material_orders.total_price',
        'material_quotes.shipping_cost',
        'material_quotes.total_amount',
        'material_order_items.price_at_order',
        'project_requirements.estimated_unit_cost',
        'project_requirements.external_cost',
        'project_requirement_histories.quantity',
        'project_change_orders.cost_impact',
        'project_warranty_claims.cost_impact',
        'project_disputes.disputed_amount',
        'project_disbursements.amount',
        'delivery_jobs.agreed_fee',
        'project_external_vendors.agreed_fee',
        'project_budget_sandbox.estimated_amount',
        'notaris_services.price',
        'materials.price',
        'house.price',
    ];

    private const TARGET = 'decimal(24,2)';

    public function up(): void
    {
        $changed = 0;

        foreach ($this->targets() as [$table, $column]) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
                continue;
            }

            $current = $this->currentDefinition($table, $column);

            // Signed and unsigned bigint both become a SIGNED decimal:
            // unsigned-ness is meaningless for a currency amount, and keeping
            // UNSIGNED would make a negative refund row unrepresentable.
            if ($current === null || $this->isAlreadyTarget($current)) {
                continue;
            }

            DB::statement($this->modifyStatement($table, $column, $current, self::TARGET));
            $changed++;
        }

        $this->report($changed);
    }

    public function down(): void
    {
        // Narrowing decimal(24,2) back to bigint is LOSSY: every sen is
        // truncated. Rolling back would silently change a professional's
        // agreed amount, so this refuses rather than doing it quietly.
        $lossy = [];

        foreach ($this->targets() as [$table, $column]) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
                continue;
            }

            $hasFraction = DB::table($table)
                ->whereNotNull($column)
                ->whereRaw("{$column} <> TRUNCATE({$column}, 0)")
                ->limit(1)
                ->exists();

            if ($hasFraction) {
                $lossy[] = "{$table}.{$column}";
            }
        }

        if ($lossy !== []) {
            throw new RuntimeException(
                'Refusing to roll back the money-column normalisation: these columns hold a fractional '
                .'amount, and narrowing decimal(24,2) to bigint would silently truncate it. '
                .implode(', ', array_slice($lossy, 0, 10))
                .(count($lossy) > 10 ? ' (+'.(count($lossy) - 10).' more)' : '')
                .'. This migration is forward-only by design.'
            );
        }

        // No fractional values anywhere: it is still safe to narrow. Each
        // statement is again built from the live definition.
        foreach ($this->targets() as [$table, $column]) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
                continue;
            }

            $current = $this->currentDefinition($table, $column);

            if ($current === null || str_contains($current['type'], 'bigint')) {
                continue;
            }

            DB::statement($this->modifyStatement($table, $column, $current, 'bigint'));
        }
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    /**
     * @return list<array{0: string, 1: string}>  [table, column] pairs
     */
    private function targets(): array
    {
        $pairs = [];

        foreach (self::MONEY_COLUMNS as $ref) {
            $table = Str::before($ref, '.');
            $column = Str::after($ref, '.');

            $pairs[] = [$table, $column];
        }

        return $pairs;
    }

    /**
     * @return array{type: string, nullable: bool, default: ?string, comment: ?string}|null
     */
    private function currentDefinition(string $table, string $column): ?array
    {
        $row = DB::selectOne(
            'SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS d, COLUMN_COMMENT AS comment
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [DB::getDatabaseName(), $table, $column]
        );

        if (! $row) {
            return null;
        }

        return [
            'type' => (string) $row->type,
            'nullable' => ((string) $row->nullable) === 'YES',
            'default' => $row->d === null ? null : (string) $row->d,
            'comment' => $row->comment === null || $row->comment === '' ? null : (string) $row->comment,
        ];
    }

    private function isAlreadyTarget(array $definition): bool
    {
        $type = strtolower($definition['type']);

        if (str_contains($type, 'unsigned')) {
            return false;
        }

        return $type === strtolower(self::TARGET);
    }

    /**
     * Build `ALTER TABLE ... MODIFY COLUMN` from the CURRENT definition with
     * only the type swapped, so nullability, default and comment survive
     * untouched.
     */
    private function modifyStatement(string $table, string $column, array $definition, string $newType): string
    {
        $parts = [
            '`'.$column.'` '.$newType,
            $definition['nullable'] ? 'NULL' : 'NOT NULL',
        ];

        if ($definition['default'] !== null) {
            $parts[] = 'DEFAULT '.$this->quoteDefault($definition['default']);
        } elseif (! $definition['nullable'] && $newType === 'bigint') {
            // A NOT NULL bigint with no default must still be insertable, and
            // MySQL would otherwise implicitly default it to 0 on rollback.
            $parts[] = 'DEFAULT 0';
        }

        if ($definition['comment'] !== null) {
            $parts[] = "COMMENT ".$this->quoteString($definition['comment']);
        }

        return 'ALTER TABLE `'.$table.'` MODIFY COLUMN '.implode(' ', $parts);
    }

    private function quoteDefault(string $default): string
    {
        return is_numeric($default) ? $default : $this->quoteString($default);
    }

    private function quoteString(string $value): string
    {
        return "'".str_replace(["\\", "'"], ["\\\\", "\\'"], $value)."'";
    }

    private function report(int $changed): void
    {
        if ($changed > 0) {
            echo "  normalised {$changed} money column(s) to ".self::TARGET."\n";
        }
    }
};
