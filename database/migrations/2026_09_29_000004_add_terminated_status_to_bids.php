<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Make `terminated` and `resigned` legal bid statuses.
 *
 * THE BUG
 * -------
 * `ProjectTerminationController::updateBidStatusOnTermination()` ends with
 *
 *     $bid->update(['status' => $status]);     // $status = 'terminated' | 'resigned'
 *
 * but `bids_arsitek.status` (and kontraktor / interior / notaris) is
 *
 *     ENUM('pending','shortlisted','invited','negotiating','contract_pending',
 *          'awaiting_payment','accepted','active','rejected','declined')
 *
 * Neither 'terminated' nor 'resigned' is a member, so under `sql_mode=strict`
 * the write fails with error 1265:
 *
 *     SQLSTATE[01000]: Warning: 1265 Data truncated for column 'status' at row 1
 *
 * Firing a contractor and a contractor resigning have therefore not been able to
 * mark the bid. Everything downstream of that write silently does not happen:
 *
 *   - the "dead payment guard" in PaymentVerificationService, which refuses to
 *     settle a payment whose contract was 'terminated', can never fire — so a
 *     DISMISSED professional keeps `payment_status = 'unpaid'` and can still
 *     drive their own payment to 'paid';
 *   - `settlePaymentStages()` cannot void the departing party's unpaid stages;
 *   - the bid keeps counting as allocated in the budget summary.
 *
 * This is the same class of defect as AGENTS.md trap 8, in the opposite
 * direction: there, a value was written that the ENUM did not allow. Here, code
 * that was WRITTEN to support the flow silently never ran.
 *
 * THE FIX
 * -------
 * Additive only. `EnumValues::addValues()` appends, so no existing row can be
 * invalidated and no table rebuild is needed beyond MySQL's normal in-place ENUM
 * extension. `bids_mep`, `bids_project_manager` and `bids_structural` are
 * plain `varchar(255)` and need nothing; they are listed for completeness so a
 * future conversion to ENUM starts from the right set.
 *
 * NOTE: the four tables still on `varchar` are also the reason the guard can
 * never fire for those three roles today. Converting them is Phase 5 work; the
 * bid-status strings are already correct.
 */
return new class extends Migration
{
    /** Tables whose status column should learn these two values. */
    private const BID_TABLES = [
        'bids_arsitek',
        'bids_kontraktor',
        'bids_notaris',
        'bids_interior',
        'bids_project_manager',
        'bids_structural',
        'bids_mep',
    ];

    public function up(): void
    {
        foreach (self::BID_TABLES as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }

            $values = EnumValues::addValues($table, 'status', ['terminated', 'resigned']);

            if ($values !== []) {
                echo "  {$table}.status now: ".implode(', ', $values)."\n";
            }
        }
    }

    public function down(): void
    {
        // Narrowing an ENUM is a full table rebuild (ALGORITHM=COPY) that
        // ABORTS under strict mode if any row holds a value being removed — and
        // `migrate --force` runs on every container start, so a failure here is
        // a deploy blocker. Refuse if anything actually used them.
        foreach (self::BID_TABLES as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }

            $inUse = EnumValues::valuesInUseOutside($table, 'status', array_values(array_diff(
                EnumValues::current($table, 'status'),
                ['terminated', 'resigned']
            )));

            if ($inUse !== []) {
                throw new RuntimeException(
                    "Refusing to roll back {$table}.status: rows still hold "
                    .implode(', ', $inUse)
                    .'. Dropping an ENUM member that is in use is a data-loss operation, and '
                    .'EnumValues::addValues() only ever appends, so this migration cannot remove '
                    .'them without deleting real termination history.'
                );
            }
        }

        // No rows depend on them, so narrowing is safe. Rebuilt through the same
        // additive helper machinery, reading the live definition each time.
        foreach (self::BID_TABLES as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }

            if (EnumValues::current($table, 'status') === []) {
                continue; // varchar, nothing to do
            }

            $remaining = array_values(array_diff(
                EnumValues::current($table, 'status'),
                ['terminated', 'resigned']
            ));

            $definition = implode(',', array_map(
                static fn (string $v) => "'".str_replace("'", "''", $v)."'",
                $remaining
            ));

            \Illuminate\Support\Facades\DB::statement(
                "ALTER TABLE `{$table}` MODIFY COLUMN `status` ENUM({$definition}) NOT NULL DEFAULT 'pending'"
            );
        }
    }
};
