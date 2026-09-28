<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Escrow arithmetic — the SINGLE source of truth.
 *
 * MODEL (2026-09-23, previously inconsistent in four places):
 *   projects.budget                 = the escrow CEILING. Mutable by the owner
 *                                     through deposits / adjustment_down, both
 *                                     of which write a ledger row for the audit
 *                                     trail AND move this column.
 *   SUM(ledger WHERE type='payment')= actual outflow to professionals. The only
 *                                     thing that reduces what can still be paid.
 *   available = ceiling − outflow
 *
 * `deposit` / `adjustment_down` rows are deliberately NOT part of `available`:
 * they already moved the ceiling column, so counting them again would
 * double-count (that was the "Add Funds shows Rp 150M but the server refuses"
 * bug, and the matching double-subtraction of adjustment_down in the SPA).
 */
class ProjectFinancialService
{
    /**
     * Total actually disbursed, net of dispute refunds.
     *
     * `refund` rows are reversals written by DisputeService (negative amounts),
     * so they must be part of the same sum — otherwise refunded money would
     * stay consumed and the escrow would read permanently exhausted.
     */
    public function paidTotal(int $projectId): float
    {
        return (float) ProjectBudgetTransaction::where('project_id', $projectId)
            ->whereIn('transaction_type', ['payment', 'refund'])
            ->sum('amount');
    }

    /**
     * What may still be disbursed — the value every write path must respect.
     */
    public function available(Project $project): float
    {
        return (float) $project->budget - $this->paidTotal($project->id);
    }

    /**
     * Obligations the parties have already promised but not yet paid.
     * Informational: it does NOT reduce `available` (the server historically
     * allowed over-committing here), but the owner must see it.
     */
    public function committedUnpaid(Project $project): float
    {
        $addendums = (float) $project->addendums()
            ->whereIn('status', ['approved_unpaid', 'pending_approval', 'verifying'])
            ->sum('amount');

        // Unlocked-but-unpaid payment stages.
        $termins = (float) $project->paymentTermins()
            ->whereIn('status', ['locked', 'pending', 'invoice_sent'])
            ->sum('amount');

        return $addendums + $termins;
    }

    /**
     * Canonical project financial state. Every surface (budget dashboard,
     * brief, owner summary) must read this rather than re-deriving its own
     * numbers.
     */
    public function summary(Project $project): array
    {
        $ceiling = (float) $project->budget;
        $paid = $this->paidTotal($project->id);
        $available = $ceiling - $paid;
        $committed = $this->committedUnpaid($project);

        return [
            'total' => $ceiling,
            'paid' => $paid,
            'allocated' => $paid + $committed,   // informational "committed against"
            'committed' => $committed,
            'remaining' => $available,            // == what the server will allow
            'available' => $available,
            'percent_used' => $ceiling > 0 ? ($paid / $ceiling) * 100 : 0,
        ];
    }

    /**
     * Deduct an amount from the project budget and log the transaction.
     *
     * @param  string  $type  payment|adjustment_down
     * @return bool  false when the escrow cannot cover it (caller MUST throw)
     */
    public function deductBudget(Project $project, float $amount, string $type, string $title, ?string $refModel = null, ?int $refId = null): bool
    {
        return DB::transaction(function () use ($project, $amount, $type, $title, $refModel, $refId) {
            // Normalize to FQCN so every code path writes ONE canonical
            // spelling — the unique ledger index (project_id,
            // reference_model, reference_id) can only dedupe across paths if
            // the spellings match. The exists() check below still matches
            // BOTH spellings for legacy rows.
            if ($refModel && !str_contains($refModel, '\\')) {
                $refModel = 'App\\Models\\' . $refModel;
            }

            // 0. Check if already deducted to prevent double-charging.
            // Matches BOTH reference spellings (legacy short name and FQCN)
            // so historical rows written either way still dedupe correctly.
            if ($refModel && $refId) {
                $shortName = str_contains($refModel, '\\') ? substr($refModel, strrpos($refModel, '\\') + 1) : $refModel;
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

            // 1. Check balance — affordability = ceiling MINUS payments already
            // recorded in the ledger (not the raw budget column).
            // SECURITY: lock the project row first so two concurrent
            // verifyProof calls on DIFFERENT references cannot both pass this
            // check and overdraw the escrow budget (TOCTOU).
            $locked = Project::where('id', $project->id)->lockForUpdate()->first();

            if (! $locked) {
                return false;
            }

            $available = $this->available($locked);

            // A deposit ADDS money, so it is never limited by the current
            // balance; only outbound movements (payment, adjustment_down) must
            // fit inside the escrow.
            if ($type !== 'deposit' && $available < $amount) {
                Log::warning("Insufficient budget for project {$project->id}. Needed: {$amount}, Available: {$available}");
                return false;
            }

            // 2. Update the escrow ceiling ONLY for structural adjustments.
            // Payments never touch the column — they are deducted from the
            // "available" calculation, so decrementing here would double-count.
            if ($type !== 'payment') {
                if ($type === 'deposit') {
                    $locked->increment('budget', $amount);
                } else {
                    $locked->decrement('budget', $amount);
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
                    'amount' => $amount,
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
     * @return bool false when the escrow cannot cover the payment
     */
    public function recordPayment(Project $project, float $amount, string $title, ?string $refModel = null, ?int $refId = null): bool
    {
        return $this->deductBudget($project, $amount, 'payment', $title, $refModel, $refId);
    }
}
