<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * B20 — an addendum could not be REFUNDED.
 *
 * THE DEFECT
 * ----------
 * `DisputeService::adminAction()` with `action=record_refund` resolves the
 * disputed payment and, when the refund covers the whole payment, flips the
 * payment to its terminal state:
 *
 *     if (isset($payment->payment_status)) {
 *         $payment->payment_status = 'refunded';
 *     } elseif (isset($payment->status)) {
 *         $payment->status = 'refunded';
 *     }
 *
 * Bids carry BOTH `payment_status` (the money state) and `status` (the
 * lifecycle), so the first branch is taken and the lifecycle is preserved.
 * `ProjectAddendum` has NO `payment_status` column, so `isset()` is false and
 * the SECOND branch is taken — and `project_addendums.status` is a MySQL ENUM
 * that did not contain `refunded`.
 *
 * The write is rejected:
 *
 *     SQLSTATE[01000]: Warning: 1265 Data truncated for column 'status' at row 1
 *     update `project_addendums` set `status` = refunded, ...
 *
 * and because the arbitration runs inside `DB::transaction()`, the rejection
 * takes the WHOLE resolution with it. The observed result was:
 *
 *     - the admin's arbitration answered 422 with a generic message;
 *     - the NEGATIVE LEDGER ROW was rolled back — the money never came back;
 *     - the addendum stayed `paid`;
 *     - the dispute stayed `open`, so the payment freeze never lifted and the
 *       project could not proceed at all.
 *
 * A refund that the platform can neither record nor undo, on the one payment
 * type that a dispute is most often raised against. Nothing tested it: the
 * existing refund test covered the BID path, which works.
 *
 * WHY THE ENUM IS EXTENDED RATHER THAN THE SCHEMA RESTRUCTURED
 * -------------------------------------------------------------
 * The obvious alternative is to give `project_addendums` a `payment_status`
 * column, the way the bid tables have one. That would be a schema change
 * across MySQL, PostgreSQL, the model, the guard map in
 * `ProjectBudgetController::assertNotRefunded()`, the `isset()` chain above,
 * and the SPA — and it would move the refund state AWAY from the one place
 * the code already reads it from.
 *
 * The codebase already expects the refund state to live in `status`:
 *
 *     'addendum' => [\App\Models\ProjectAddendum::class, 'status'],
 *
 * in `assertNotRefunded()`. And the marketplace already models a refund as a
 * terminal value on the same column: `material_orders.status` is an ENUM that
 * contains `refunded`. So the ENUM was the odd one out, not the code.
 *
 * `EnumValues::addValues()` is used, never `MODIFY COLUMN`: see the class
 * docblock and AGENTS.md trap #9. `MODIFY COLUMN` is a table rebuild that
 * aborts the whole migration (error 1265) if any row holds a value outside the
 * new list, and the entrypoint runs `migrate --force` on every replica start.
 * `addValues()` only ever APPENDS, preserving the existing order, so no row
 * can be invalidated by the statement.
 *
 * EVERY READER OF THIS COLUMN
 * ---------------------------
 * All of them use explicit lists that do not include `refunded`, so a refunded
 * addendum correctly falls out of every one of them:
 *
 *   - `ProjectFinancialService::committedUnpaidMoney()` sums
 *     `['approved_unpaid','pending_approval','verifying']` — a refunded
 *     addendum is not outstanding money. Correct.
 *   - `ProjectResource`'s payment-status derivation reads `status = 'paid'`
 *     first, then `['authorized','verifying','approved_unpaid']`. A refunded
 *     addendum matches neither and falls through to `'unpaid'`. Correct: the
 *     money came back.
 *   - `FirmMemberController` checks `['pending_approval','approved']` for a
 *     duplicate assignment proposal. Unaffected.
 *   - `ProjectBudgetController::handleAddendumStatus()` only accepts a
 *     transition out of `['pending_approval','negotiating','accepted_by_pro']`,
 *     so a refunded addendum is terminal for the negotiation state machine.
 *   - `ProjectBudgetController::assertNotRefunded()` reads `status` and now
 *     sees `refunded` — which is the whole point. It is the guard that stops
 *     the owner charging a refunded addendum a second time.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('project_addendums')) {
            return;
        }

        // ADDITIVE ONLY. The existing members keep their order; `refunded` is
        // appended. A no-op when the value is already legal, so this is safe on
        // a database that has been migrated many times.
        EnumValues::addValues('project_addendums', 'status', ['refunded']);
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_addendums')) {
            return;
        }

        // Refuse to roll back while any row still holds `refunded`.
        //
        // Removing an ENUM member that is in use is a data-loss operation:
        // under `sql_mode=strict` the `MODIFY COLUMN` aborts (error 1265), and
        // under a non-strict mode it silently coerces those rows to ''. A
        // failed rollback is the better outcome — it says "there is data here"
        // instead of destroying it.
        $inUse = EnumValues::valuesInUseOutside('project_addendums', 'status', array_diff(
            EnumValues::current('project_addendums', 'status'),
            ['refunded']
        ));

        if ($inUse !== []) {
            throw new RuntimeException(
                'Cannot roll back the addendum refund status: project_addendums.status still holds '
                .implode(', ', $inUse)
                .'. EnumValues::addValues() only ever extends the list, so this migration cannot '
                .'remove `refunded` without data loss.'
            );
        }
    }
};
