<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ProjectFinancialService
{
    /**
     * Deduct an amount from the project budget and log the transaction.
     * 
     * @param Project $project
     * @param float $amount
     * @param string $type (payment, adjustment_down)
     * @param string $title
     * @param string|null $refModel
     * @param int|null $refId
     * @return bool
     */
    public function deductBudget(Project $project, float $amount, string $type, string $title, ?string $refModel = null, ?int $refId = null): bool
    {
        return DB::transaction(function () use ($project, $amount, $type, $title, $refModel, $refId) {
            // 0. Check if already deducted to prevent double-charging
            if ($refModel && $refId) {
                $exists = ProjectBudgetTransaction::where('project_id', $project->id)
                    ->where('reference_model', $refModel)
                    ->where('reference_id', $refId)
                    ->exists();
                if ($exists) {
                    return true; 
                }
            }

            // 1. Check balance
            if ($project->budget < $amount) {
                Log::warning("Insufficient budget for project {$project->id}. Needed: {$amount}, Available: {$project->budget}");
                return false;
            }

            // 2. Update project budget ONLY for structural adjustments
            // Payments are deducted from the "Available" calculation in the UI, 
            // so we don't decrement the core budget column to avoid double-counting.
            if ($type !== 'payment') {
                $project->decrement('budget', $amount);
            }

            // 3. Record transaction
            ProjectBudgetTransaction::create([
                'project_id' => $project->id,
                'transaction_type' => $type,
                'amount' => $amount,
                'title' => $title,
                'reference_model' => $refModel,
                'reference_id' => $refId,
                'transaction_date' => now(),
            ]);

            return true;
        });
    }

    /**
     * Record a payment in the ledger without deducting from the project budget 
     * (e.g. for already allocated funds like termin payments).
     */
    public function recordTransaction(Project $project, float $amount, string $type, string $title, ?string $refModel = null, ?int $refId = null): void
    {
        ProjectBudgetTransaction::updateOrCreate(
            [
                'project_id' => $project->id,
                'reference_model' => $refModel,
                'reference_id' => $refId,
            ],
            [
                'transaction_type' => $type,
                'amount' => $amount,
                'title' => $title,
                'transaction_date' => now(),
            ]
        );
    }
}
