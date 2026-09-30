<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Copy `project_disbursements` into `project_payment_termins`, then retire it.
 *
 * WHY
 * ---
 * `project_disbursements` was a second, parallel representation of
 * notary/architect money alongside `project_payment_termins`. It had drifted
 * into three defects, all of them live in `resources/js/components/Projects/
 * Phases/LegalVault.tsx`:
 *
 *   1. REJECTING APPROVED. The SPA POSTs `{ status: 'rejected' }`; the
 *      controller validated `action` in `verify|reject` and defaulted to
 *      `verify`. A Reject click wrote `status = 'verified'`, and the toast
 *      said "Budget order rejected".
 *   2. VERIFYING MOVED NO MONEY. `verifyDisbursement` set `verified` without
 *      calling `deductBudget` and without writing a ledger row, while
 *      `legalSummary` reported `total_spent` from termin data. Money approved,
 *      recorded nowhere, invisible in every financial figure.
 *   3. CREATING ALWAYS 422'd. The SPA POSTs `description`; the controller
 *      required `purpose`.
 *
 * The read side had already migrated: `legalSummary` serves `disbursements`
 * from `paymentTermins()` filtered to notaris/arsitek. So this table was
 * write-only, unreachable from the UI, and had produced a class of bug that
 * nothing tested.
 *
 * `project_payment_termins` is a strict superset — it adds `role_type`,
 * `percentage`, `net_amount`, `retention_amount`, `milestone_id`,
 * `refunded_amount`, the dispute freeze, the contract-value bounds and the
 * refund path. Keeping both meant a third representation to keep in step,
 * which is precisely what had gone wrong.
 *
 * SPLIT IN TWO MIGRATIONS ON PURPOSE
 * ----------------------------------
 * The copy and the drop are separate so the data survives a rollback of the
 * drop. `down()` of the drop recreates an empty table, and `down()` of the
 * copy then removes the termin rows it created — but the ORIGINAL rows are
 * already gone at that point, because the drop is not reversible with data.
 *
 * So `down()` of the copy is deliberately CONSERVATIVE: it deletes a copied
 * termin row ONLY when no ledger row references it. A termin that has been
 * paid has moved real money and is left alone, because losing it would lose
 * the record of that payment. Leaving extra termin rows is recoverable;
 * losing a paid payment's record is not.
 *
 * DO NOT ROLL THIS BACK ON PRODUCTION. Take a backup first. The guard above
 * makes a rollback survivable for unpaid rows, but it cannot restore the
 * original `project_disbursements` rows, and those may carry
 * `verification_notes` and `verified_by` provenance that a termin's
 * `verification_notes` column only approximates.
 */
return new class extends Migration
{
    /**
     * Marker written into `notes` so `down()` can identify exactly which termin
     * rows this migration created, and so the provenance is visible in the UI.
     */
    private const MARKER = 'migrated-from-disbursement';

    /**
     * `project_disbursements.status` -> `project_payment_termins.status`.
     *
     * `verified` becomes `paid` because that is what "the owner approved the
     * release" meant, and termin's `paid` is the only state the escrow treats
     * as disbursed. It is deliberately NOT written to the ledger here: the
     * original code never wrote a ledger row, so inventing one here would
     * fabricate a payment that may never have happened. Those rows are
     * reconciled by `money:detect-duplicates`, which will report them as
     * `paid` with no ledger entry — correctly, because that is exactly the
     * defect being fixed, and pretending otherwise would hide it.
     *
     * `rejected` becomes `void`, which PaymentVerificationService already
     * treats as terminal.
     *
     * @var array<string, string>
     */
    private const STATUS = [
        'pending' => 'pending',
        'verified' => 'paid',
        'rejected' => 'void',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('project_disbursements')) {
            return;
        }

        $rows = DB::table('project_disbursements')->orderBy('id')->get();

        if ($rows->isEmpty()) {
            return;
        }

        $requesters = DB::table('users')
            ->whereIn('id', $rows->pluck('requested_by')->unique()->filter())
            ->pluck('role_type', 'id');

        foreach ($rows as $row) {
            // `parent_role`/`role_type` must be one of the seven licensed roles
            // (TerminPlanService::assertKnownRole). The requester's role is the
            // only signal available — the table has no role column — and a
            // 'user' or 'admin' requester cannot own a payment stage, so those
            // are recorded with a null role rather than inventing one. They are
            // left in place for a human to reassign; `money:detect-duplicates`
            // and the owner will see them.
            $role = $requesters[$row->requested_by] ?? null;

            $label = $row->title ?: 'Disbursement';

            $note = trim(sprintf(
                '%s: %s (requested by user #%d%s%s)',
                self::MARKER,
                $row->purpose,
                $row->requested_by,
                $row->verified_by ? ', verified by user #'.$row->verified_by : '',
                $row->verification_notes ? ' — '.$row->verification_notes : ''
            ));

            DB::table('project_payment_termins')->insert([
                'project_id' => $row->project_id,
                'role_type' => in_array($role, [
                    'arsitek', 'kontraktor', 'notaris', 'interior',
                    'structural', 'mep', 'project_manager',
                ], true) ? $role : null,
                'recipient_id' => $row->requested_by,
                'label' => mb_substr($label, 0, 255),
                // percentage is NOT NULL with no usable default here, and the
                // original table recorded only an absolute amount. 0 is honest:
                // the proportion of the contract this represents is unknown, and
                // inventing one would corrupt every percentage roll-up.
                'percentage' => 0,
                'amount' => $row->amount,
                'retention_amount' => 0,
                'net_amount' => $row->amount,
                'trigger_description' => mb_substr((string) $row->purpose, 0, 255),
                'status' => self::STATUS[$row->status] ?? 'pending',
                'paid_at' => $row->status === 'verified' ? ($row->verified_at ?: $row->updated_at) : null,
                'notes' => $note,
                'refunded_amount' => 0,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
            ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_payment_termins')) {
            return;
        }

        $markers = DB::table('project_payment_termins')
            ->where('notes', 'like', self::MARKER.':%')
            ->pluck('id');

        if ($markers->isEmpty()) {
            return;
        }

        // Only remove a copied row when NOTHING references it in the ledger.
        // A termin that a payment or refund points at has moved real money, and
        // deleting it would destroy the record of that movement.
        $referenced = DB::table('project_budget_transactions')
            ->where('reference_model', 'App\Models\ProjectPaymentTermin')
            ->whereIn('reference_id', $markers)
            ->pluck('reference_id')
            ->flip();

        $removable = $markers->reject(fn ($id) => $referenced->has($id))->values();

        if ($removable->isNotEmpty()) {
            DB::table('project_payment_termins')->whereIn('id', $removable)->delete();
        }
    }
};
