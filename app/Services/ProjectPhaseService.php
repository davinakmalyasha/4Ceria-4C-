<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectExternalVendor;
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
     *
     * MONEY CORRECTNESS (2026-09-29)
     * -------------------------------
     * This used to debit the escrow by hand:
     *
     *     $oldBudget = $project->budget;
     *     $project->update(['budget' => max(0, $oldBudget - $vendor->agreed_fee)]);
     *     ProjectBudgetTransaction::create([... 'adjustment_down' ...]);
     *
     * Bypassing ProjectFinancialService cost it all three of the guarantees
     * that service exists to provide:
     *
     *   1. NO AFFORDABILITY CHECK. The import succeeded regardless of whether
     *      the escrow could cover the agreed fee.
     *   2. THE CHECK WAS MASKED BY A CLAMP. `max(0, ...)` meant an import that
     *      overran the budget drove `budget` to 0 instead of failing, so the
     *      overdraft was invisible: the ledger recorded a fee that the ceiling
     *      no longer reflected, and the owner was never told.
     *   3. NO ROW LOCK. The read-modify-write of `budget` had a TOCTOU window,
     *      so two concurrent imports could both spend the same headroom.
     *
     * Routing through `deductBudget()` fixes all three at once and produces the
     * identical accounting: for an `adjustment_down` that service decrements the
     * ceiling AND writes the matching positive row, which is exactly what the
     * hand-rolled code did. `available` is `budget - sum(payment, refund)`, so
     * an `adjustment_down` correctly moves the ceiling without being counted as
     * disbursed money.
     *
     * `adjustment_down` remains the right transaction type: importing a vendor
     * records a commitment, not a completed transfer, so it must NOT reduce
     * `available` and must not look like a disbursement to dispute arbitration.
     */
    public function importExternalVendor(Project $project, array $data)
    {
        return DB::transaction(function () use ($project, $data) {
            $vendor = ProjectExternalVendor::create([
                'project_id' => $project->id,
                'team_member_id' => $data['team_member_id'] ?? null,
                'phase_role' => $data['phase_role'],
                'company_name' => $data['company_name'] ?? null,
                'contact_person' => $data['contact_person'],
                'phone_number' => $data['phone_number'],
                'email' => $data['email'] ?? null,
                'agreed_fee' => $data['agreed_fee'] ?? 0,
                'notes' => $data['notes'] ?? null,
            ]);

            // Commit the agreed fee to the escrow through the shared service.
            if ((float) $vendor->agreed_fee > 0) {
                $ok = app(ProjectFinancialService::class)->deductBudget(
                    $project,
                    $vendor->agreed_fee,
                    'adjustment_down',
                    'External ' . ucfirst($vendor->phase_role) . ' Fee Allocation: ' . $vendor->contact_person,
                    // Either spelling is fine: `deductBudget()` normalises a
                    // bare class name to the FQCN before writing, and matches
                    // both forms when de-duplicating, so the rows this path
                    // wrote before the fix still dedupe against new ones.
                    ProjectExternalVendor::class,
                    $vendor->id
                );

                if (!$ok) {
                    // Throwing rolls back the whole import, so the owner gets a
                    // truthful failure instead of a silently clamped escrow.
                    throw new \Exception(sprintf(
                        'Insufficient project budget to allocate the agreed fee of Rp %s to %s. '
                        .'Reduce the fee, or raise the project budget first.',
                        number_format((float) $vendor->agreed_fee, 0, ',', '.'),
                        $vendor->contact_person
                    ), 422);
                }
            }

            $source = $vendor->team_member_id ? "internal team" : "external partner";
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'external_vendor_imported',
                'details' => "Externally handled {$vendor->phase_role} phase assigned to {$vendor->contact_person} (imported from {$source}).",
            ]);

            return $vendor;
        });
    }
}
