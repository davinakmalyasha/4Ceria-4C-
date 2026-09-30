<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Escrow arithmetic — the SINGLE source of truth.
 *
 * MODEL
 * -----
 *   projects.budget                  = the escrow CEILING. Mutable by the owner
 *                                      through deposits / adjustment_down, both
 *                                      of which write a ledger row for the audit
 *                                      trail AND move this column.
 *   SUM(ledger WHERE type='payment') = actual outflow to professionals. The only
 *                                      thing that reduces what can still be paid.
 *   available = ceiling - outflow
 *
 * `deposit` / `adjustment_down` rows are deliberately NOT part of `available`:
 * they already moved the ceiling column, so counting them again would
 * double-count (that was the "Add Funds shows Rp 150M but the server refuses"
 * bug, and the matching double-subtraction of adjustment_down in the SPA).
 *
 * PRECISION
 * ---------
 * Every calculation is done in `App\Support\Money`, i.e. integer minor units.
 * The service previously used PHP `float` against `decimal(24,2)` columns, which
 * cannot represent 0.1 exactly and cannot represent a `decimal(24,2)` at all
 * above ~9e15. The public methods therefore accept anything money-shaped and
 * normalise at the boundary, and the `*Money()` variants are what new code
 * should call.
 *
 * MIGRATION SHAPE (read this before adding a caller)
 * --------------------------------------------------
 * The `float`-returning methods are retained as thin wrappers so that the
 * existing ~15 call sites keep working and each fix lands as a small,
 * reviewable change. They are DEPRECATED in favour of the `*Money()` variants
 * and are removed once every caller has moved. Grep for the float form and you
 * get the migration list.
 */
class ProjectFinancialService
{
    /**
     * Ledger row types that count as money leaving the escrow.
     *
     * `payment` is a disbursement (positive). `refund` is DisputeService's
     * reversal (negative), so it MUST be in the same sum — otherwise refunded
     * money stays consumed and every figure derived from it overstates what the
     * client actually paid.
     *
     * `deposit` and `adjustment_down` are deliberately excluded: `deposit`
     * raises the `projects.budget` ceiling rather than spending it, and
     * `adjustment_down` lowers that ceiling. Both move the ceiling, and
     * `available` is derived from the ceiling, so counting them as
     * disbursements would subtract the same movement twice.
     *
     * @var list<string>
     */
    public const DISBURSEMENT_TYPES = ['payment', 'refund'];

    /**
     * Total actually disbursed, net of dispute refunds.
     *
     * `refund` rows are reversals written by DisputeService (negative amounts),
     * so they must be part of the same sum — otherwise refunded money would
     * stay consumed and the escrow would read permanently exhausted.
     *
     * @deprecated Use {@see paidTotalMoney()} — a float cannot represent the
     *             value range of the column it is summing.
     */
    public function paidTotal(int $projectId): float
    {
        return $this->paidTotalMoney($projectId)->toFloat();
    }

    public function paidTotalMoney(int $projectId): Money
    {
        $sum = ProjectBudgetTransaction::where('project_id', $projectId)
            ->whereIn('transaction_type', self::DISBURSEMENT_TYPES)
            ->sum('amount');

        return Money::fromColumn($sum);
    }

    /**
     * Net disbursed per project owner, keyed by user id.
     *
     * EXISTS SO THE `payment + refund` RULE LIVES IN ONE PLACE.
     *
     * `ProjectController::attachClientHistory` used to inline
     * `->where('transaction_type', 'payment')` for the figure it labels
     * `total_spent` on a professional's public `client_history`. Refunds are
     * NEGATIVE ledger rows, so excluding them counted money that dispute
     * arbitration had already returned to the client as still spent — an
     * inflated figure on a page anyone can read, and one that rose every time a
     * professional was wrongly judged and the refund was issued.
     *
     * This is a single grouped query rather than a call per project: the caller
     * renders a list of many owners, and N+1 would be worse than the duplication
     * it replaces. The invariant still lives here, so a future transaction type
     * that counts as disbursed is added in one place.
     *
     * @param  list<int>  $ownerIds
     * @return array<int, Money>  keyed by user id; absent where nothing was paid
     */
    public function paidTotalByOwner(array $ownerIds): array
    {
        if ($ownerIds === []) {
            return [];
        }

        $rows = ProjectBudgetTransaction::query()
            ->join('projects', 'project_budget_transactions.project_id', '=', 'projects.id')
            ->whereIn('projects.user_id', $ownerIds)
            ->whereIn('project_budget_transactions.transaction_type', self::DISBURSEMENT_TYPES)
            ->groupBy('projects.user_id')
            ->selectRaw('projects.user_id as owner_id, SUM(project_budget_transactions.amount) as total')
            ->get();

        return $rows->mapWithKeys(
            fn ($row) => [(int) $row->owner_id => Money::fromColumn($row->total)]
        )->all();
    }

    /**
     * What may still be disbursed — the value every write path must respect.
     *
     * @deprecated Use {@see availableMoney()}.
     */
    public function available(Project $project): float
    {
        return $this->availableMoney($project)->toFloat();
    }

    public function availableMoney(Project $project): Money
    {
        return Money::fromColumn($project->budget)->subtract($this->paidTotalMoney($project->id));
    }

    /**
     * Obligations the parties have already promised but not yet paid.
     *
     * Informational: it does NOT reduce `available`, but the owner must see it.
     *
     * @deprecated Use {@see committedUnpaidMoney()}.
     */
    public function committedUnpaid(Project $project): float
    {
        return $this->committedUnpaidMoney($project)->toFloat();
    }

    public function committedUnpaidMoney(Project $project): Money
    {
        $addendums = $project->addendums()
            ->whereIn('status', ['approved_unpaid', 'pending_approval', 'verifying'])
            ->sum('amount');

        // Unlocked-but-unpaid payment stages.
        $termins = $project->paymentTermins()
            ->whereIn('status', ['locked', 'pending', 'invoice_sent'])
            ->sum('amount');

        return Money::fromColumn($addendums)->add(Money::fromColumn($termins));
    }

    /**
     * Canonical project financial state. Every surface (budget dashboard,
     * brief, owner summary) must read this rather than re-deriving its own
     * numbers.
     *
     * The `total`/`paid`/`available`/... keys stay as floats because the SPA
     * renders them directly and changing the shape would break every consumer
     * in one go. The `_cents` keys alongside them are exact, and `_display` is
     * the string the SPA should format from once Phase 7 removes the client-side
     * re-derivation.
     */
    public function summary(Project $project): array
    {
        $ceiling = Money::fromColumn($project->budget);
        $paid = $this->paidTotalMoney($project->id);
        $available = $ceiling->subtract($paid);
        $committed = $this->committedUnpaidMoney($project);

        return [
            // --- existing float shape, unchanged for the SPA
            'total' => $ceiling->toFloat(),
            'paid' => $paid->toFloat(),
            'allocated' => $paid->add($committed)->toFloat(), // informational "committed against"
            'committed' => $committed->toFloat(),
            'remaining' => $available->toFloat(), // == what the server will allow
            'available' => $available->toFloat(),
            'percent_used' => $ceiling->isPositive()
                ? $paid->toFloat() / $ceiling->toFloat() * 100
                : 0,

            // --- exact, for anything that reconciles
            'total_cents' => $ceiling->toInt(),
            'paid_cents' => $paid->toInt(),
            'committed_cents' => $committed->toInt(),
            'available_cents' => $available->toInt(),
            'currency' => $ceiling->getCurrency(),
            'total_display' => $ceiling->toDecimal(),
            'paid_display' => $paid->toDecimal(),
            'committed_display' => $committed->toDecimal(),
            'available_display' => $available->toDecimal(),
        ];
    }

    /**
     * Deduct an amount from the project budget and log the transaction.
     *
     * @param  Money|string|int|float  $amount
     * @param  string  $type  payment|adjustment_down|deposit
     * @return bool  false when the escrow cannot cover it (caller MUST throw)
     */
    public function deductBudget(
        Project $project,
        Money|string|int|float $amount,
        string $type,
        string $title,
        ?string $refModel = null,
        ?int $refId = null,
    ): bool {
        $money = $amount instanceof Money ? $amount : Money::fromColumn($amount);

        return DB::transaction(function () use ($project, $money, $type, $title, $refModel, $refId) {
            // Normalize to FQCN so every code path writes ONE canonical
            // spelling — the unique ledger index (project_id,
            // reference_model, reference_id, transaction_type) can only dedupe
            // across paths if the spellings match. The exists() check below
            // still matches BOTH spellings for legacy rows.
            if ($refModel && ! str_contains($refModel, '\\')) {
                $refModel = 'App\\Models\\' . $refModel;
            }

            // 0. Already deducted? Prevents double-charging. Matches BOTH
            // reference spellings (legacy short name and FQCN) so historical
            // rows written either way still dedupe correctly.
            //
            // This runs BEFORE the lock, so it is an optimisation and not the
            // correctness guarantee — the unique index is. The lock below is
            // what actually serialises two concurrent payments.
            if ($refModel && $refId) {
                $shortName = str_contains($refModel, '\\')
                    ? substr($refModel, strrpos($refModel, '\\') + 1)
                    : $refModel;

                $exists = ProjectBudgetTransaction::where('project_id', $project->id)
                    ->where('reference_id', $refId)
                    ->where(function ($q) use ($refModel, $shortName) {
                        $q->where('reference_model', $refModel)
                            ->orWhere('reference_model', $shortName);
                    })
                    ->exists();

                if ($exists) {
                    return true;
                }
            }

            // 1. Affordability = ceiling MINUS payments already in the ledger
            // (not the raw budget column).
            // SECURITY: lock the project row first so two concurrent
            // verifyProof calls on DIFFERENT references cannot both pass this
            // check and overdraw the escrow (TOCTOU).
            $locked = Project::where('id', $project->id)->lockForUpdate()->first();

            if (! $locked) {
                return false;
            }

            $available = $this->availableMoney($locked);

            // A deposit ADDS money, so it is never limited by the current
            // balance; only outbound movements (payment, adjustment_down) must
            // fit inside the escrow.
            //
            // Exact integer comparison. This used to be a float `<` with no
            // epsilon, which meant the boundary was whatever the double
            // rounding happened to produce.
            if ($type !== 'deposit' && $available->isLessThan($money)) {
                Log::warning(
                    "Insufficient budget for project {$project->id}. Needed: {$money->toDecimal()}, "
                    ."Available: {$available->toDecimal()}"
                );

                return false;
            }

            // 2. Update the escrow ceiling ONLY for structural adjustments.
            // Payments never touch the column — they are deducted from the
            // "available" calculation, so decrementing here would double-count.
            if ($type !== 'payment') {
                if ($type === 'deposit') {
                    $locked->increment('budget', $money->toDecimal());
                } else {
                    $locked->decrement('budget', $money->toDecimal());
                }
                $project->budget = (float) $locked->budget;
            }

            // 3. Record transaction. UCV catch = concurrent verifyProof on the
            // same reference lost the race; treat as success (money recorded
            // once) instead of 500ing the pro after their payment cleared.
            try {
                ProjectBudgetTransaction::create([
                    'project_id' => $project->id,
                    'transaction_type' => $type,
                    'amount' => $money->toDecimal(),
                    'title' => $title,
                    'reference_model' => $refModel,
                    'reference_id' => $refId,
                    'transaction_date' => now(),
                ]);
            } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
                return true;
            }

            $project->touch();

            return true;
        });
    }

    /**
     * Record a payment in the ledger.
     *
     * 2026-09-23: this used to be a bare `updateOrCreate` with NO
     * affordability check and NO lock, while only BID payments went through
     * deductBudget. That meant the majority of real disbursements — termin,
     * addendum and material payments — could push the ledger past the escrow
     * ceiling, after which every later bid payment 422'd and the project was
     * stuck. It now shares the exact same guard as every other path.
     *
     * CALLERS MUST CHECK THE RETURN VALUE. Discarding it is how a bid ends up
     * `paid` with no ledger row behind it — which is exactly what happened in
     * ProjectBudgetController::markPaid for the specialist-addendum branch.
     *
     * @param  Money|string|int|float  $amount
     * @return bool false when the escrow cannot cover the payment
     */
    public function recordPayment(
        Project $project,
        Money|string|int|float $amount,
        string $title,
        ?string $refModel = null,
        ?int $refId = null,
    ): bool {
        $money = $amount instanceof Money ? $amount : Money::fromColumn($amount);

        return $this->deductBudget($project, $money, 'payment', $title, $refModel, $refId);
    }
}
