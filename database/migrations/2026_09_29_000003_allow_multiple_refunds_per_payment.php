<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Make MULTIPLE partial refunds against one payment representable.
 *
 * THE BUG
 * -------
 * `budget_tx_reference_unique` is
 * UNIQUE (project_id, reference_model, reference_id, transaction_type).
 *
 * A refund row was written with `reference_*` pointing at the PAYMENT. So for
 * any one payment the index permitted at most ONE `refund` row — verified
 * empirically, not inferred:
 *
 *   refund #0 of 100: INSERTED
 *   refund #1: BLOCKED -> UniqueConstraintViolationException
 *             Duplicate entry '...-ProjectPaymentTermin-999999-refund'
 *
 * Two consequences, and only the first was known:
 *
 *  1. `DisputeService` kept an `$alreadyRefunded` accumulator "so a second
 *     dispute cannot refund the same money again". That protection was
 *     redundant — the index already did it — and redundant logic is how the
 *     net-vs-gross bug got in: the cap was computed as
 *     `SUM(payment + refund) - refunded_amount`, i.e. NET minus GROSS, so it
 *     shrank by twice the already-refunded amount on every subsequent refund.
 *
 *  2. More seriously, arbitration could only ever return a payment ONCE. A
 *     ruling that releases Rp 2,000,000 now and Rp 1,000,000 on a later defect
 *     is not expressible. That is a product limitation, not a bug report.
 *
 * THE FIX
 * -------
 * Stop using the dedupe key for two different jobs.
 *
 *   reference_model / reference_id  ->  the DISPUTE that produced the reversal
 *   reverses_model / reverses_id    ->  the PAYMENT being returned
 *
 * Then the existing unique index does the right thing for free:
 *   - at most one `payment` row per payment reference (unchanged)
 *   - at most one `refund` row per DISPUTE, which is the idempotency guarantee
 *     that was actually wanted: the same dispute cannot be refunded twice
 *   - and any number of refunds against one payment, across disputes
 *
 * BACKFILL
 * --------
 * Existing `refund` rows are copied into the new columns, so every historical
 * reversal keeps its correct payment attribution. Their `reference_*` is left
 * pointing at the payment, which is what they actually contain: they are read
 * through `reverses_*` from now on, and the ledger's own `available()` sum is
 * by project so it is unaffected either way.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('project_budget_transactions')) {
            return;
        }

        Schema::table('project_budget_transactions', function (Blueprint $table) {
            if (! Schema::hasColumn('project_budget_transactions', 'reverses_model')) {
                $table->string('reverses_model', 255)->nullable()
                    ->after('reference_id')
                    ->comment('For a refund: the payment this reversal returns. NULL for any other type.');
            }

            if (! Schema::hasColumn('project_budget_transactions', 'reverses_id')) {
                $table->unsignedBigInteger('reverses_id')->nullable()
                    ->after('reverses_model')
                    ->comment('For a refund: the id of the payment this reversal returns.');
            }
        });

        // Backfill: historical refunds referenced the payment directly, so that
        // is the correct value for the new columns.
        DB::statement(
            "UPDATE project_budget_transactions
                SET reverses_model = reference_model,
                    reverses_id   = reference_id
              WHERE transaction_type = 'refund'
                AND reverses_model IS NULL
                AND reference_model IS NOT NULL"
        );

        // The aggregation that "what has been returned against this payment?"
        // runs on, for every paidTotal()/available() call.
        Schema::table('project_budget_transactions', function (Blueprint $table) {
            $name = 'budget_tx_reverses_idx';

            $exists = collect(Schema::getIndexes('project_budget_transactions'))
                ->pluck('name')
                ->contains($name);

            if (! $exists) {
                $table->index(['project_id', 'reverses_model', 'reverses_id'], $name);
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_budget_transactions')) {
            return;
        }

        // Rolling back restores the single-refund-per-payment limitation. Rows
        // written after this migration would violate the unique index, so this
        // refuses rather than dropping data to get there.
        //
        // The grouped columns are projected explicitly. `->exists()` on a query
        // with a GROUP BY compiles to `select exists(select * ... group by ...)`,
        // and `select *` is illegal under `sql_mode=only_full_group_by` (MySQL
        // error 1055) because the non-grouped `id` is not functionally
        // dependent on the grouping.
        $multi = DB::table('project_budget_transactions')
            ->where('transaction_type', 'refund')
            ->whereNotNull('reverses_id')
            ->selectRaw('project_id, reverses_model, reverses_id')
            ->groupBy('project_id', 'reverses_model', 'reverses_id')
            ->havingRaw('COUNT(*) > 1')
            ->limit(1)
            ->count() > 0;

        if ($multi) {
            throw new RuntimeException(
                'Refusing to roll back: a payment now carries more than one refund row, and the '
                .'pre-2026-09-29 unique index allows only one refund per payment. Rolling back would '
                .'require deleting reversals. This migration is forward-only by design.'
            );
        }

        Schema::table('project_budget_transactions', function (Blueprint $table) {
            $name = 'budget_tx_reverses_idx';

            $exists = collect(Schema::getIndexes('project_budget_transactions'))
                ->pluck('name')
                ->contains($name);

            if ($exists) {
                $table->dropIndex($name);
            }

            $table->dropColumn(['reverses_model', 'reverses_id']);
        });
    }
};
