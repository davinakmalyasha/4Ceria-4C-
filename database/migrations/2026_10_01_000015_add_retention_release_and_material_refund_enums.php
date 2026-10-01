<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;

/**
 * Two ENUM values that both existing code paths already try to write.
 *
 * Neither is a new feature. Both are values that shipped code has been
 * attempting to store, and that MySQL strict mode rejects with error 1265 --
 * a hard failure, in the middle of a money transaction, that leaves the row
 * un-updated and the money moved.
 *
 * 1. `project_budget_transactions.transaction_type` += `retention_release`
 *
 *    The retention release command wrote its ledger row with type `payment`
 *    against reference (ProjectPaymentTermin, $stage->id) -- which is the
 *    IDENTICAL tuple the termin's own payment used. `deductBudget()`'s
 *    duplicate check is (project_id, reference_id, transaction_type,
 *    reference_model), so the release found the original payment, returned
 *    `true` WITHOUT INSERTING, and the command marked the stage released and
 *    reported success.
 *
 *    In other words: the escrow was never debited, `retention_released_at` was
 *    set anyway, and the retention was neither held nor released. It simply
 *    vanished. This is AGENTS.md trap 12 -- "discarding the return value is how
 *    a bid ends up paid with no ledger row" -- reached from the other
 *    direction, by a value that was `true` for the wrong reason.
 *
 *    A distinct type is the only correct fix. Reusing `adjustment_down` would
 *    be wrong: that type LOWERS the ceiling, and a release spends retained
 *    money that is already inside it.
 *
 * 2. `material_orders.status` += `refunded`
 *
 *    `DisputeService::resolve()` flips a fully-refunded payment to `refunded`,
 *    preferring `payment_status` and falling back to `status`:
 *
 *        if (isset($payment->payment_status)) { ... = 'refunded'; }
 *        elseif (isset($payment->status))      { $payment->status = 'refunded'; }
 *
 *    `MaterialOrder` has no `payment_status`, so a material order takes the
 *    `status` branch -- and `refunded` is not one of
 *    (pending, awaiting_payment, verifying, paid, shipping, delivered,
 *    completed, cancelled, processing, ready_for_pickup).
 *
 *    Resolving a dispute in the buyer's favour for a material order is
 *    therefore a hard 1265 inside a transaction, after the refund ledger row
 *    was written. The user sees a 500 on a successful arbitration, and the
 *    order stays `paid` while the money is gone.
 *
 *    This is the same class of bug as the amicable-exit outage in
 *    AGENTS.md trap 8, found by an audit rather than by a user report.
 *
 * APPEND-ONLY, PER AGENTS.md TRAP 9
 * ---------------------------------
 * `EnumValues::addValues()` only APPENDS and preserves existing order, so no
 * stored row can be invalidated. A hand-written `MODIFY COLUMN` narrowing these
 * lists is the ALGORITHM=COPY rebuild that aborts the `migrate --force` every
 * replica start runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (EnumValues::current('project_budget_transactions', 'transaction_type')) {
            EnumValues::addValues('project_budget_transactions', 'transaction_type', ['retention_release']);
        }

        if (EnumValues::current('material_orders', 'status')) {
            EnumValues::addValues('material_orders', 'status', ['refunded']);
        }
    }

    public function down(): void
    {
        // Intentionally empty -- see the class docblock.
        //
        // Dropping `retention_release` is the ALGORITHM=COPY rebuild of trap 9 and
        // would fail for any project whose retention has been released. Dropping
        // `refunded` from `material_orders.status` would fail for any material
        // order that a dispute has already refunded -- which is precisely the row
        // this migration exists to make writable.
    }
};
