<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectAddendum;
use App\Models\MaterialOrder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use App\Models\Notification;
use Exception;

class PaymentVerificationService
{
    /**
     * Handles the secure upload of a payment receipt.
     */
    public function uploadProof(Project $project, string $type, int $id, UploadedFile $file, $user)
    {
        $isOwner = $project->user_id === $user->id;
        $isAssignedPM = $project->pm_id === $user->id;

        // R1: Security - Only the project owner or assigned PM can upload proofs.
        if (!$isOwner && !$isAssignedPM) {
            throw new Exception("Unauthorized. Only the Project Owner or assigned Project Manager can upload payment proofs.", 403);
        }

        return DB::transaction(function () use ($project, $type, $id, $file) {
            $model = $this->getModel($type, $id, $project->id);

            if ($type === 'termin') {
                $isSubProfessional = ($model->milestone && $model->milestone->type === 'sub_professional') 
                    || !in_array($model->role_type, ['arsitek', 'kontraktor', 'notaris', 'interior', 'project_manager']);

                if (!$isSubProfessional) {
                    $unpaidPrevious = ProjectPaymentTermin::where('project_id', $project->id)
                        ->where('role_type', $model->role_type)
                        ->where('id', '<', $model->id)
                        ->whereNotIn('status', ['paid', 'verifying'])
                        ->where(function($q) use ($model) {
                            // COs (percentage 0) should not be blocked by LATER regular termins
                            if ($model->percentage == 0) {
                                if ($model->milestone_id) {
                                    $q->where(function($sq) use ($model) {
                                        $sq->where('milestone_id', '<=', $model->milestone_id)
                                           ->orWhereNull('milestone_id');
                                    });
                                }
                            }
                        })
                        ->exists();
                    
                    if ($unpaidPrevious) {
                        throw new Exception("Please complete the previous payment milestones (e.g. Down Payment) before paying for this one.", 422);
                    }
                }
            }

            // Store file securely
            $path = $file->store('receipts', 'public');

            if ($model->payment_proof_path && Storage::disk('public')->exists($model->payment_proof_path)) {
                Storage::disk('public')->delete($model->payment_proof_path);
            }

            $model->payment_proof_path = $path;
            
            // For bids, we use payment_status. For termins, we use status.
            if (isset($model->payment_status)) {
                $model->payment_status = 'verifying';
            } elseif (isset($model->status)) {
                $model->status = 'verifying';
            }
            
            $model->save();

            return $model;
        });
    }

    /**
     * Handles the verification of a payment receipt by a Professional or PM.
     */
    public function verifyProof(Project $project, string $type, int $id, $user, string $action = 'accept', ?string $notes = null)
    {
        return DB::transaction(function () use ($project, $type, $id, $user, $action, $notes) {
            $model = $this->getModel($type, $id, $project->id);

            // R1: Security - Only assigned pros or PM can verify.
            $isAuthorized = false;
            
            $bidTypes = ['arsitek_bid', 'kontraktor_bid', 'notaris_bid', 'interior_bid', 'pm_bid', 'structural_bid', 'mep_bid'];
            
            if (in_array($type, $bidTypes)) {
                $proUserId = $this->getBidderUserId($model, $type);
                if ($user->id === $proUserId) {
                    $isAuthorized = true;
                }
            } elseif ($user->role_type === 'project_manager' && $project->pm_id === $user->id) {
                $isAuthorized = true;
            } elseif ($type === 'addendum') {
                // If it is a specialist request / assignment addendum, only the assigned specialist or the PM can verify it!
                if (in_array($model->type, ['specialist_assignment', 'specialist_request']) && ($model->team_member_id || $model->assigned_user_id)) {
                    if ($model->assigned_user_id && (int) $user->id === (int) $model->assigned_user_id) {
                        $isAuthorized = true;
                    } elseif ($user->role_type === 'project_manager' && $project->pm_id === $user->id) {
                        $isAuthorized = true;
                    }
                } else {
                    // Standard addendums: any professional (like lead architect / contractor) or PM who is not the owner
                    if ($user->id !== $project->user_id) {
                        $isAuthorized = true;
                    }
                }
            } elseif ($type === 'termin') {
                if ($user->id !== $project->user_id) {
                    $isAuthorized = true; 
                }
            } elseif ($type === 'material') {
                $isAuthorized = true;
            }

            if (!$isAuthorized) {
                throw new Exception("Unauthorized. You do not have permission to verify this payment.", 403);
            }

            // --- HANDLE REJECTION ---
            if ($action === 'reject') {
                // Save rejection feedback
                $model->verification_notes = $notes;
                
                // Reset status so owner can re-upload
                if (isset($model->payment_status)) {
                    $model->payment_status = 'pending';
                }
                
                if (isset($model->status)) {
                    // For termins, we might want to go back to 'pending' or 'awaiting_payment'
                    $model->status = $type === 'addendum' ? 'approved_unpaid' : 'pending';
                }

                $model->save();

                // Notify Project Owner
                Notification::create([
                    'user_id' => $project->user_id,
                    'type' => 'payment_rejected',
                    'title' => 'Payment Proof Rejected',
                    'body' => "The professional has rejected your payment proof for \"" . ($model->label ?? $model->title ?? 'a payment stage') . "\". Reason: " . ($notes ?: 'No specific reason provided.'),
                    'data' => [
                        'project_id' => $project->id,
                        'payment_type' => $type,
                        'payment_id' => $id,
                        'notes' => $notes
                    ]
                ]);

                return $model;
            }

            // --- HANDLE ACCEPTANCE (EXISTING LOGIC) ---
            if (isset($model->payment_status)) {
                $model->payment_status = 'paid';
            }
            
            if (in_array($type, $bidTypes)) {
                $model->status = 'active';
                $model->paid_at = now();
                $model->verification_notes = null; // Clear old rejection notes on success

                // Deduct budget
                $financialService = app(\App\Services\ProjectFinancialService::class);
                $bidderName = $this->getBidderName($model, $type);
                $refModel = $this->getRefModelName($type);
                
                // CRITICAL FIX: Use calculated_total if it exists (for negotiated/percentage bids)
                $amount = (float)($model->calculated_total ?? $model->price);
                
                $financialService->deductBudget($project, $amount, 'payment', "Professional Fee: {$bidderName}", $refModel, $model->id);
                
                // Transition Project Status
                $this->transitionProjectStatus($project, $type);
            }

            if ($type === 'termin' || $type === 'addendum' || $type === 'material') {
                $model->status = 'paid';
                $model->verification_notes = null; // Clear old rejection notes on success
                
                if ($type === 'termin') {
                    $this->checkAndActivateBid($project, $model);
                }
                
                // CRITICAL FIX: Record transaction in budget ledger for termins/addendums
                $financialService = app(\App\Services\ProjectFinancialService::class);
                $amount = (float)$model->amount;
                $title = match($type) {
                    'termin' => "Payment: {$model->label} ({$model->role_type})",
                    'addendum' => "Payment: {$model->title}",
                    'material' => "Payment: Material Procurement",
                };
                $refModel = match($type) {
                    'termin' => 'ProjectPaymentTermin',
                    'addendum' => 'ProjectAddendum',
                    'material' => 'MaterialOrder',
                };
                
                // For Addendums of type specialist_assignment, we must finalize the assignment here
                if ($type === 'addendum' && in_array($model->type, ['specialist_assignment', 'specialist_request']) && ($model->team_member_id || $model->assigned_user_id)) {
                    $subRole = $model->specialist_type ?: $model->role_type; // 'structural', 'mep' or 'interior'
                    $specialistUserId = null;
                    $specialistName = '';

                    if ($model->assigned_user_id) {
                        $user = \App\Models\User::find($model->assigned_user_id);
                        if ($user) {
                            $specialistUserId = $user->id;
                            $specialistName = $user->name;
                        }
                    } else {
                        $teamMember = \App\Models\TeamMember::find($model->team_member_id);
                        if ($teamMember) {
                            $specialistName = $teamMember->name;
                        }
                    }

                    if ($specialistName || $specialistUserId) {
                        // Check if a record already exists
                        $existingSub = \App\Models\ProjectSubProfessional::where('project_id', $project->id)
                            ->where('sub_role', $subRole)
                            ->first();

                        // When payment is verified and paid, they are officially active/hired!
                        $newStatus = 'active';
                        $hiredAt = now();

                        // Create or Update SubProfessional record
                        $sub = \App\Models\ProjectSubProfessional::updateOrCreate(
                            [
                                'project_id' => $project->id,
                                'sub_role' => $subRole,
                            ],
                            [
                                'user_id' => $specialistUserId,
                                'parent_role' => ($model->user?->role_type === 'kontraktor') ? 'kontraktor' : 'arsitek',
                                'assigned_by' => $model->user_id,
                                'status' => $newStatus,
                                'rate' => $model->amount,
                                'lead_pro_notes' => "Assigned via Paid Addendum: {$specialistName}",
                                'hired_at' => $hiredAt,
                                'accepted_at' => ($existingSub && $existingSub->accepted_at) ? $existingSub->accepted_at : now(),
                            ]
                        );

                        // Link to project main fields
                        if ($subRole === 'structural') {
                            $struc = $specialistUserId ? \App\Models\StructuralEngineer::where('user_id', $specialistUserId)->first() : null;
                            if ($struc) $project->update(['structural_id' => $struc->id]);
                        } elseif ($subRole === 'mep') {
                            $mep = $specialistUserId ? \App\Models\MepEngineer::where('user_id', $specialistUserId)->first() : null;
                            if ($mep) $project->update(['mep_id' => $mep->id]);
                        } elseif ($subRole === 'interior') {
                            $interior = $specialistUserId ? \App\Models\InteriorProfile::where('user_id', $specialistUserId)->first() : null;
                            if ($interior) $project->update(['selected_interior_id' => $interior->id]);
                        }

                        if ($specialistUserId) {
                            \App\Models\Notification::create([
                                'user_id' => $specialistUserId,
                                'type' => 'sub_professional_invite',
                                'title' => 'New Sub-Professional Invitation',
                                'body' => "You have been invited as a {$subRole} for \"{$project->title}\".",
                                'data' => [
                                    'project_id' => $project->id,
                                    'sub_professional_id' => $sub->id,
                                ],
                            ]);
                        }
                    }
                }

                $financialService->recordTransaction($project, $amount, 'payment', $title, $refModel, $model->id);
            }

            if (isset($model->paid_at)) {
                $model->paid_at = now();
            }
            $model->save();

            return $model;
        });
    }

    private function getBidderUserId($bid, $type)
    {
        return match ($type) {
            'arsitek_bid' => $bid->arsitek->user_id,
            'kontraktor_bid' => $bid->kontraktor->user_id,
            'notaris_bid' => $bid->notaris->user_id,
            'interior_bid' => $bid->interior->user_id,
            'pm_bid' => $bid->pm->user_id,
            'structural_bid' => $bid->structuralEngineer->user_id,
            'mep_bid' => $bid->mepEngineer->user_id,
        };
    }

    private function getBidderName($bid, $type)
    {
        return match ($type) {
            'arsitek_bid' => $bid->arsitek->nama ?? $bid->arsitek->user->name,
            'kontraktor_bid' => $bid->kontraktor->nama ?? $bid->kontraktor->user->name,
            'notaris_bid' => $bid->notaris->nama ?? $bid->notaris->user->name,
            'interior_bid' => $bid->interior->nama ?? $bid->interior->user->name,
            'pm_bid' => $bid->pm->nama ?? $bid->pm->user->name,
            'structural_bid' => $bid->structuralEngineer->nama ?? $bid->structuralEngineer->user->name,
            'mep_bid' => $bid->mepEngineer->nama ?? $bid->mepEngineer->user->name,
        };
    }

    private function getRefModelName($type)
    {
        return match ($type) {
            'arsitek_bid' => 'BidArsitek',
            'kontraktor_bid' => 'BidKontraktor',
            'notaris_bid' => 'BidNotaris',
            'interior_bid' => 'BidInterior',
            'pm_bid' => 'BidProjectManager',
            'structural_bid' => 'BidStructural',
            'mep_bid' => 'BidMep',
        };
    }

    private function transitionProjectStatus(Project $project, string $type)
    {
        if ($type === 'arsitek_bid' && $project->status === 'open') {
            $project->update(['status' => 'accepted_arsitek']);
        } elseif ($type === 'kontraktor_bid') {
             if ($project->status === 'accepted_arsitek' || $project->target_role === 'kontraktor') {
                 $project->update(['status' => 'in_progress']);
             } else {
                 $project->update(['status' => 'accepted_kontraktor']);
             }
        }
    }

    private function checkAndActivateBid(Project $project, ProjectPaymentTermin $termin)
    {
        $bidModel = match ($termin->role_type) {
            'arsitek' => \App\Models\BidArsitek::class,
            'kontraktor' => \App\Models\BidKontraktor::class,
            'notaris' => \App\Models\BidNotaris::class,
            'interior' => \App\Models\BidInterior::class,
            'project_manager' => \App\Models\BidProjectManager::class,
            'structural' => \App\Models\BidStructural::class,
            'mep' => \App\Models\BidMep::class,
            default => null,
        };

        if (!$bidModel) return;

        $bid = $bidModel::where('project_id', $project->id)
            ->where('status', 'awaiting_payment')
            ->first();

        if ($bid) {
            $bid->update(['status' => 'accepted']);
            
            if ($termin->role_type === 'arsitek') $project->update(['selected_arsitek_id' => $bid->arsitek_id]);
            if ($termin->role_type === 'kontraktor') $project->update(['selected_kontraktor_id' => $bid->kontraktor_id]);
            if ($termin->role_type === 'project_manager') $project->update(['pm_id' => $bid->pm->user_id]);
            if ($termin->role_type === 'notaris') $project->update(['selected_notaris_id' => $bid->notaris_id]);
            if ($termin->role_type === 'interior') $project->update(['selected_interior_id' => $bid->interior_id]);
        }
    }

    /**
     * Helper to resolve the correct model.
     */
    private function getModel(string $type, int $id, int $projectId)
    {
        switch ($type) {
            case 'termin':
                $model = ProjectPaymentTermin::where('id', $id)->where('project_id', $projectId)->first();
                break;
            case 'addendum':
                $model = ProjectAddendum::where('id', $id)->where('project_id', $projectId)->first();
                break;
            case 'material':
                $model = MaterialOrder::where('id', $id)->where('project_id', $projectId)->first();
                break;
            case 'arsitek_bid': $model = \App\Models\BidArsitek::with(['arsitek.user'])->where('id', $id)->where('project_id', $projectId)->first(); break;
            case 'kontraktor_bid': $model = \App\Models\BidKontraktor::with(['kontraktor.user'])->where('id', $id)->where('project_id', $projectId)->first(); break;
            case 'notaris_bid': $model = \App\Models\BidNotaris::with(['notaris.user'])->where('id', $id)->where('project_id', $projectId)->first(); break;
            case 'interior_bid': $model = \App\Models\BidInterior::with(['interior.user'])->where('id', $id)->where('project_id', $projectId)->first(); break;
            case 'pm_bid': $model = \App\Models\BidProjectManager::with(['pm.user'])->where('id', $id)->where('project_id', $projectId)->first(); break;
            case 'structural_bid': $model = \App\Models\BidStructural::with(['structuralEngineer.user'])->where('id', $id)->where('project_id', $projectId)->first(); break;
            case 'mep_bid': $model = \App\Models\BidMep::with(['mepEngineer.user'])->where('id', $id)->where('project_id', $projectId)->first(); break;
            default:
                throw new Exception("Invalid payment type: {$type}", 400);
        }

        if (!$model) {
            throw new Exception("Payment record not found.", 404);
        }

        return $model;
    }
}
