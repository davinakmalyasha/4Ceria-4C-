<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectExternalVendor;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectActivityLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class ProjectPhaseService
{
    /**
     * Broadcast a project phase to the public bidding board.
     */
    public function broadcastPhase(Project $project, string $role)
    {
        $published = $project->published_bidding_roles ?? [];
        
        if (!in_array($role, $published)) {
            $published[] = $role;
            $project->update(['published_bidding_roles' => $published]);

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'phase_broadcast',
                'details' => "Bidding for {$role} phase was manually broadcasted to the 4C Board.",
            ]);
        }

        return $project;
    }

    /**
     * Import an external professional and assign them to a phase.
     */
    public function importExternalVendor(Project $project, array $data)
    {
        return DB::transaction(function () use ($project, $data) {
            $vendor = ProjectExternalVendor::create([
                'project_id' => $project->id,
                'phase_role' => $data['phase_role'],
                'company_name' => $data['company_name'] ?? null,
                'contact_person' => $data['contact_person'],
                'phone_number' => $data['phone_number'],
                'email' => $data['email'] ?? null,
                'agreed_fee' => $data['agreed_fee'] ?? 0,
            ]);

            // Deduct from budget if agreed_fee is present
            if ($vendor->agreed_fee > 0) {
                $oldBudget = $project->budget;
                $project->update([
                    'budget' => max(0, $oldBudget - $vendor->agreed_fee)
                ]);

                ProjectBudgetTransaction::create([
                    'project_id' => $project->id,
                    'transaction_type' => 'adjustment_down',
                    'amount' => $vendor->agreed_fee,
                    'title' => "External " . ucfirst($vendor->phase_role) . " Fee Allocation: {$vendor->contact_person}",
                    'reference_model' => 'ProjectExternalVendor',
                    'reference_id' => $vendor->id,
                    'transaction_date' => now(),
                ]);
            }

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'external_vendor_imported',
                'details' => "Externally handled {$vendor->phase_role} phase assigned to: {$vendor->contact_person}.",
            ]);

            return $vendor;
        });
    }
}
