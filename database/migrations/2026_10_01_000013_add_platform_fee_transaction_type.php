<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;

/**
 * Add `platform_fee` as a ledger movement type.
 *
 * WHY A NEW TYPE RATHER THAN REUSING `payment`
 * ---------------------------------------------
 * The unique ledger index is (project_id, reference_model, reference_id,
 * transaction_type), which is what lets `deductBudget()` refuse a double-charge.
 * A fee recorded as another `payment` against the same termin would therefore
 * collide with the payment it applies to and be silently dropped as a duplicate --
 * the platform would charge nothing and the ledger would look correct.
 *
 * A distinct type also makes the fee separable in reporting. `money:reconcile` and
 * `paidTotalByOwner()` can answer "how much of this was platform revenue" without
 * having to parse titles.
 *
 * APPEND-ONLY, PER AGENTS.md TRAP 9
 * ---------------------------------
 * `EnumValues::addValues()` only APPENDS and preserves the existing order, so no
 * row can be invalidated. A hand-written `MODIFY COLUMN` that dropped a value is an
 * ALGORITHM=COPY table rebuild which aborts with error 1265 if any row still holds
 * it -- and the container entrypoint runs `migrate --force` on every replica start,
 * so that failure is a deploy-time outage.
 *
 * The value is added but NOTHING charges it yet: the fee is off unless
 * `ESCROW_PLATFORM_FEE_PERCENT` is set. See PlatformFeeService.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! EnumValues::current('project_budget_transactions', 'transaction_type')) {
            return;
        }

        EnumValues::addValues('project_budget_transactions', 'transaction_type', ['platform_fee']);
    }

    public function down(): void
    {
        // Intentionally empty -- see the class docblock.
        //
        // Dropping `platform_fee` would be the ALGORITHM=COPY rebuild described in
        // AGENTS.md trap 9, and it would fail outright for any project that has been
        // charged a fee. The value is additive and inert: older readers that do not
        // know the type ignore the row, and the product copy already tells clients a
        // fee "will be itemised on the project ledger next to the payment it applies
        // to", so no reader of a historic ledger is misled.
    }
};