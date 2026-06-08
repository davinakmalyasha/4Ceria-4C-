<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\Notification;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectLifecycleService
{
    /**
     * Formal verification of a project phase by the PM or Owner.
     */
    public function verifyPhase(Project $project, string $phase, ?string $notes = null): bool
    {
        return DB::transaction(function () use ($project, $phase, $notes) {
            $updateData = [];
            $action = "";
            $details = "";

            switch ($phase) {
                case 'design':
                    $updateData = [
                        'owner_design_approved_at' => now(),
                        'design_locked_at' => now(),
                        'design_completed_at' => now(),
                    ];

                    // Auto-approve structural, mep, interior, and architect deliverables, milestones, and payments if hired
                    $subRoles = [
                        'design' => [
                            'hired_id' => $project->selected_arsitek_id,
                            'db_col' => 'owner_design_approved_at',
                            'doc_cat' => 'blueprint',
                        ],
                        'structural' => [
                            'hired_id' => $project->structural_id,
                            'db_col' => 'structural_approved_at',
                            'doc_cat' => 'structural_calc',
                        ],
                        'mep' => [
                            'hired_id' => $project->mep_id,
                            'db_col' => 'mep_approved_at',
                            'doc_cat' => 'mep_layout',
                        ],
                        'interior' => [
                            'hired_id' => $project->selected_interior_id,
                            'db_col' => 'owner_interior_approved_at',
                            'doc_cat' => 'interior_design',
                        ]
                    ];

                    foreach ($subRoles as $role => $cfg) {
                        if ($cfg['hired_id']) {
                            $updateData[$cfg['db_col']] = now();
                            
                            // Auto-verify documents
                            $project->documents()->where('category', $cfg['doc_cat'])->update([
                                'status' => 'verified',
                                'reviewed_at' => now()
                            ]);

                            // Auto-approve and complete milestones
                            $milestones = $project->milestones()
                                ->where('phase_context', $role)
                                ->where('approval_status', '!=', 'approved')
                                ->get();

                            foreach ($milestones as $milestone) {
                                $milestone->update([
                                    'is_completed' => true,
                                    'approval_status' => 'approved',
                                    'pm_verified_at' => now(),
                                ]);

                                // Unlock linked payment termins
                                $termins = \App\Models\ProjectPaymentTermin::where('milestone_id', $milestone->id)
                                    ->whereIn('status', ['locked', 'pending'])
                                    ->get();
                                    
                                foreach ($termins as $termin) {
                                    $termin->update(['status' => 'pending']);
                                    $this->logActivity(
                                        $project, 
                                        'payment_triggered', 
                                        "Progress Verified: '{$milestone->title}' via Design Phase Handover Approval. Payment Termin '{$termin->label}' is now unlocked."
                                    );
                                }
                            }
                        }
                    }

                    $action = 'design_verified';
                    $details = "PM/Owner formally verified and approved the Design Phase.";
                    break;
                case 'construction':
                    $updateData = [
                        'owner_build_approved_at' => now(),
                        'construction_locked_at' => now(),
                        'construction_completed_at' => now(),
                    ];
                    $action = 'construction_verified';
                    $details = "PM/Owner formally verified and approved the Construction Phase.";
                    break;
                case 'interior':
                    $updateData = [
                        'owner_interior_approved_at' => now(),
                        'interior_locked_at' => now(),
                        'interior_completed_at' => now(),
                    ];
                    $action = 'interior_verified';
                    $details = "PM/Owner formally verified and approved the Interior Phase.";
                    break;
                case 'legal':
                    $updateData = [
                        'owner_legal_approved_at' => now(),
                        'legal_locked_at' => now(),
                        'legal_completed_at' => now(),
                        'legal_handover_submitted_at' => null,
                        'legal_handover_notes' => null,
                    ];
                    $action = 'legal_verified';
                    $details = "PM/Owner formally verified and approved the Legal Phase.";
                    break;
                default:
                    return false;
            }

            // Update completed phases array
            $completed = $project->completed_phases ?? [];
            if (!in_array($phase, $completed)) {
                $completed[] = $phase;
            }
            $updateData['completed_phases'] = $completed;

            $project->update($updateData);

            $this->logActivity($project, $action, $details);
            $this->triggerPaymentForPhase($project, $phase);

            // Notify relevant professionals
            $this->notifyProfessionalsOfVerification($project, $phase);

            return true;
        });
    }

    /**
     * Implicitly verify a phase if the next professional is hired.
     */
    public function implicitVerify(Project $project, string $phase): void
    {
        $checkField = match($phase) {
            'design' => 'owner_design_approved_at',
            'construction' => 'owner_build_approved_at',
            'interior' => 'owner_interior_approved_at',
            'legal' => 'owner_legal_approved_at',
            default => null
        };

        if ($checkField && !$project->{$checkField}) {
            $this->verifyPhase($project, $phase, "Auto-verified by system due to next phase hiring activity.");
        }
    }

    private function logActivity(Project $project, string $action, string $details): void
    {
        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id() ?? $project->user_id, // Fallback to owner if system-triggered
            'action' => $action,
            'details' => $details,
        ]);
    }
    private function notifyProfessionalsOfVerification(Project $project, string $phase): void
    {
        $userId = null;
        if ($phase === 'design' && $project->arsitek) {
            $userId = $project->arsitek->user_id;
        } elseif ($phase === 'construction' && $project->kontraktor) {
            $userId = $project->kontraktor->user_id;
        } elseif ($phase === 'interior' && $project->interior) {
            $userId = $project->interior->user_id;
        } elseif ($phase === 'legal' && $project->notaris) {
            $userId = $project->notaris->user_id;
        }

        if ($userId) {
            Notification::create([
                'user_id' => $userId,
                'type' => 'phase_verified',
                'title' => "Phase Approved!",
                'body' => "The " . ucfirst($phase) . " phase of project \"{$project->title}\" has been officially verified and locked.",
                'data' => ['project_id' => $project->id],
            ]);
        }
    }

    public function finalizeProject(Project $project): bool
    {
        return DB::transaction(function () use ($project) {
            // SLF is only strictly required for new builds
            if ($project->project_category === 'new_build' && !$project->slf_verified_at) {
                return false;
            }

            // Phase Check
            $needed = $project->needed_phases ?? [];
            $completed = $project->completed_phases ?? [];
            sort($needed);
            sort($completed);
            if ($needed !== $completed) {
                return false;
            }

            $project->update([
                'status' => 'completed',
                'completed_at' => now(),
                'owner_accepted_at' => now(),
                'walkthrough_status' => 'completed',
                'warranty_start_at' => now(),
                'warranty_end_at' => now()->addDays(180), // Standard 6-month maintenance
            ]);

            $this->logActivity($project, 'project_finalized', 'Project officially completed and handed over.');
            
            return true;
        });
    }

    private function triggerPaymentForPhase(Project $project, string $phase): void
    {
        $role = match($phase) {
            'design' => 'arsitek',
            'construction' => 'kontraktor',
            'interior' => 'interior',
            'legal' => 'notaris',
            default => null
        };

        if (!$role) return;

        // Find the first locked termin for this role and unblock it
        $termin = $project->paymentTermins()
            ->where('role_type', $role)
            ->where('status', 'locked')
            ->orderBy('id', 'asc')
            ->first();

        if ($termin) {
            $termin->update(['status' => 'pending']);
            $this->logActivity($project, 'payment_unblocked', "Payment Termin \"{$termin->label}\" automatically unblocked after phase verification.");
        }
    }
}
