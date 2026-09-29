<?php

use App\Support\Schema\ForeignKeyIndexGuard;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Enable true PARTIAL refunds (and make over-refunding impossible).
     *
     * WHY:
     *  1. `project_budget_transactions.transaction_type` already carried a
     *     'refund' enum value, but the only unique index
     *     (`budget_tx_reference_unique` on project_id, reference_model,
     *     reference_id) allowed exactly ONE row per payment reference — so a
     *     reversal could never be attributed to the payment it reverses, and a
     *     second refund of the same payment could not be represented at all.
     *  2. Nothing tracked HOW MUCH of a payment had been given back, so the
     *     dispute centre could only compare the refund against the PROJECT's
     *     total payments — allowing an admin to refund pro A's termin using
     *     pro B's money, and to repeat the same refund across disputes.
     *
     * CHANGES (all additive):
     *  - widen the unique index to include transaction_type, so each reference
     *    may hold exactly one `payment` AND one `refund` row;
     *  - add `refunded_amount` to every payment-bearing table so the refunded
     *    portion of a payment is durable state, not an inference.
     */
    private const PAYMENT_TABLES = [
        'bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior',
        'bids_project_manager', 'bids_structural', 'bids_mep',
        'project_payment_termins', 'project_addendums', 'material_orders',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('project_budget_transactions')) {
            return;
        }

        // 1. Widen the dedupe index so payment + refund can coexist per reference.
        $hasOld = collect(Schema::getIndexes('project_budget_transactions'))
            ->contains(fn ($i) => $i['name'] === 'budget_tx_reference_unique');

        if ($hasOld) {
            $columns = collect($this->indexColumns('project_budget_transactions', 'budget_tx_reference_unique'));
            if (! $columns->contains('transaction_type')) {
                // MySQL backs a foreign key with the leftmost index whose first
                // column matches. `budget_tx_reference_unique` starts with
                // `project_id`, so while it is the only such index it IS the
                // project's FK backing store and dropping it fails with
                //   1553 Cannot drop index 'budget_tx_reference_unique':
                //       needed in a foreign key constraint
                //
                // This only bites on a FROM-SCRATCH migration. On a database
                // that had been ALTERed over months, some earlier incidental
                // index already covered `project_id`, so the drop silently
                // succeeded and nobody noticed that `migrate:fresh` had never
                // worked. `2026_09_23_000010` adds the dedicated
                // `budget_tx_project_type_idx`, but it runs AFTER this file, so
                // it cannot help here.
                //
                // Give the foreign key its own index before narrowing the
                // unique one, so the drop is legal on any schema.
                ForeignKeyIndexGuard::ensureBackingIndex('project_budget_transactions', 'project_id', 'budget_tx_reference_unique');

                Schema::table('project_budget_transactions', function (Blueprint $table) {
                    $table->dropUnique('budget_tx_reference_unique');
                });

                Schema::table('project_budget_transactions', function (Blueprint $table) {
                    $table->unique(
                        ['project_id', 'reference_model', 'reference_id', 'transaction_type'],
                        'budget_tx_reference_unique'
                    );
                });
            }
        } else {
            Schema::table('project_budget_transactions', function (Blueprint $table) {
                $table->unique(
                    ['project_id', 'reference_model', 'reference_id', 'transaction_type'],
                    'budget_tx_reference_unique'
                );
            });
        }

        // 2. Durable refunded-portion per payment.
        foreach (self::PAYMENT_TABLES as $tableName) {
            if (! Schema::hasTable($tableName) || Schema::hasColumn($tableName, 'refunded_amount')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                // No ->after(): bid tables have no `amount` column (they use
                // price / calculated_total), so column positioning differs
                // per table and would abort the migration.
                $table->decimal('refunded_amount', 15, 2)->default(0)
                    ->comment('Portion of this payment returned via dispute arbitration');
            });
        }
    }

    public function down(): void
    {
        foreach (self::PAYMENT_TABLES as $tableName) {
            if (Schema::hasTable($tableName) && Schema::hasColumn($tableName, 'refunded_amount')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->dropColumn('refunded_amount');
                });
            }
        }

        if (Schema::hasTable('project_budget_transactions')) {
            $columns = collect($this->indexColumns('project_budget_transactions', 'budget_tx_reference_unique'));
            if ($columns->contains('transaction_type')) {
                // Same FK-backing-index hazard as `up()`: narrowing the unique
                // index back to three columns still leaves it starting with
                // `project_id`, so it keeps backing the foreign key and can be
                // dropped safely — but the dedicated index must exist first in
                // case anything else relied on it.
                ForeignKeyIndexGuard::ensureBackingIndex('project_budget_transactions', 'project_id', 'budget_tx_reference_unique');

                Schema::table('project_budget_transactions', function (Blueprint $table) {
                    $table->dropUnique('budget_tx_reference_unique');
                });
                Schema::table('project_budget_transactions', function (Blueprint $table) {
                    $table->unique(['project_id', 'reference_model', 'reference_id'], 'budget_tx_reference_unique');
                });
            }
        }
    }

    private function indexColumns(string $table, string $name): array
    {
        $index = collect(Schema::getIndexes($table))->firstWhere('name', $name);

        return $index ? ($index['columns'] ?? []) : [];
    }
};
