<?php

namespace App\Services;

use App\Models\Project;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class ProjectLegalService
{
    /**
     * Seal the legal phase, locking the design and allowing the project to proceed.
     */
    public function sealProjectLegal(Project $project)
    {
        return DB::transaction(function () use ($project) {
            $project->update([
                'legal_locked_at' => Carbon::now(),
                'legal_completed_at' => Carbon::now(),
                'status' => 'procurement' // Transition to BoM phase
            ]);

            return $project;
        });
    }

    /**
     * Fetch the financial status of the legal escrow.
     */
    public function getLegalFinancials(Project $project)
    {
        // For now, return a calculated ledger. In a real system, these would 
        // come from a 'transactions' table associated with the project.
        $totalBudget = (float) $project->budget;
        $allocatedTax = $totalBudget * 0.10; // Standard 10% tax/notary allocation
        
        $milestones = $project->milestones()
            ->where('phase_context', 'legal')
            ->get();

        $disbursements = $project->budgetTransactions()
            ->where('category', 'legal')
            ->get();

        return [
            'allocated_tax' => $allocatedTax,
            'total_spent' => $disbursements->where('status', 'paid')->sum('amount'),
            'pending_approval' => $disbursements->where('status', 'pending_approval')->sum('amount'),
            'disbursements' => $disbursements
        ];
    }
}
