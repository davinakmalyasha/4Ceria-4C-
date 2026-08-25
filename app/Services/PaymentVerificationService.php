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

            // SECURITY: never regress a settled payment. Re-uploading a proof
            // after 'paid' would flip the record back to 'verifying' and let
            // the payee re-verify (state churn / duplicate notification loop).
            $currentStatus = isset($model->payment_status) ? $model->payment_status : ($model->status ?? null);
            if ($currentStatus === 'paid') {
                throw new Exception("This payment is already marked as paid and cannot be modified.", 422);
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
                    // Standard addendums: only actual project participants (hired
                    // professionals) who are not the owner may verify.
                    if ($user->id !== $project->user_id && $this->isHiredProForAnyRole($project, $user)) {
                        $isAuthorized = true;
                    }
                }
            } elseif ($type === 'termin') {
                // Only the payee (termin recipient) may confirm receipt; PM is already
                // authorized above as a neutral party.
                if ($model->recipient_id) {
                    if ((int) $model->recipient_id === (int) $user->id) {
                        $isAuthorized = true;
                    }
                } else {
                    // Legacy termins without an explicit recipient: fall back to the
                    // hired professional for this role.
                    $isAuthorized = $this->isHiredProForRole($project, $model->role_type, $user);
                }
            } elseif ($type === 'material') {
                // Only the supplier receiving the money or the assigned PM may confirm receipt.
                $supplierUserId = $model->supplier?->user_id;
                if ($supplierUserId && (int) $supplierUserId === (int) $user->id) {
                    $isAuthorized = true;
                } elseif ($user->role_type === 'project_manager' && (int) $project->pm_id === (int) $user->id) {
                    $isAuthorized = true;
                }
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

                $deducted = $financialService->deductBudget($project, $amount, 'payment', "Professional Fee: {$bidderName}", $refModel, $model->id);
                if (!$deducted) {
                    // BUGFIX: the boolean was previously ignored — bids became
                    // "paid" without any ledger entry. Fail loudly instead.
                    throw new Exception(
                        "Project budget is insufficient for this payment (" . number_format((float) $amount) . "). Please increase the project budget first.",
                        422
                    );
                }

                // Budget math counts active bids — touch the project so the
                // cached calculateBudgetSummary invalidates immediately
                // (transitionProjectStatus only touches for arsitek/kontraktor).
                $project->touch();

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

                        // SECURITY (consent): paying for an assignment must not
                        // graft an unwilling user onto the project workspace.
                        // The specialist activates ONLY after they explicitly
                        // accept (ProjectAddendumController creates the record
                        // as 'invited'; SubProfessionalController@accept flips
                        // it and links the project slots). Until then the
                        // record stays 'invited'.
                        $wasAccepted = $existingSub
                            && ($existingSub->status === 'active' || $existingSub->status === 'accepted' || $existingSub->accepted_at);

                        if ($wasAccepted) {
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
                                ]
                            );
                        } elseif (!$existingSub) {
                            // No invitation exists yet (legacy addendum path) —
                            // create it in the consent-pending state instead of
                            // force-activating.
                            $sub = \App\Models\ProjectSubProfessional::create([
                                'project_id' => $project->id,
                                'sub_role' => $subRole,
                                'user_id' => $specialistUserId,
                                'parent_role' => ($model->user?->role_type === 'kontraktor') ? 'kontraktor' : 'arsitek',
                                'assigned_by' => $model->user_id,
                                'status' => 'invited',
                                'rate' => $model->amount,
                                'lead_pro_notes' => "Assigned via Paid Addendum: {$specialistName}",
                                'hired_at' => null,
                            ]);
                        }

                        if ($wasAccepted) {
                            // Consent already given — link to project main fields.
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
                        } elseif ($specialistUserId && isset($sub)) {
                            // Still pending consent — (re)notify the specialist.
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

                // Budget math counts termins/addendums/material payments —
                // touch the project so the cached calculateBudgetSummary
                // (keyed on updated_at) invalidates immediately. Bid types
                // already touch via transitionProjectStatus for the lead
                // roles; these three never did.
                $project->touch();
            }

            if (isset($model->paid_at)) {
                $model->paid_at = now();
            }
            $model->save();

            $this->notifyPaymentVerified($project, $type, $id, $model);

            return $model;
        });
    }

    /**
     * Notify both parties that a payment cleared, and email the payer a
     * receipt. Previously verification was completely silent — the owner
     * never learned their payment unlocked work.
     */
    private function notifyPaymentVerified(Project $project, string $type, int $id, $model): void
    {
        try {
            $label = $model->label ?? $model->title ?? ucfirst(str_replace('_', ' ', $type));
            $amount = (float) ($model->calculated_total ?? $model->price ?? $model->amount ?? 0);
            $formatted = 'Rp ' . number_format($amount, 0, ',', '.');

            // Payee = whoever verified (already authorized); payer = project owner
            $payeeId = auth()->id();
            $payerId = $project->user_id;

            Notification::create([
                'user_id' => $payerId,
                'type' => 'payment_verified',
                'title' => 'Payment Verified',
                "body" => "Your {$formatted} payment for \"{$label}\" on \"{$project->title}\" has been verified.",
                'data' => ['project_id' => $project->id, 'payment_type' => $type, 'payment_id' => $id],
            ]);

            if ($payeeId && (int) $payeeId !== (int) $payerId) {
                Notification::create([
                    'user_id' => $payeeId,
                    'type' => 'payment_verified',
                    'title' => 'Payment Confirmed',
                    'body' => "The {$formatted} payment for \"{$label}\" has been confirmed by the payer.",
                    'data' => ['project_id' => $project->id, 'payment_type' => $type, 'payment_id' => $id],
                ]);
            }

            // Email receipt to the payer (queued; failures never block the API)
            if ($project->user?->email) {
                \Mail::to($project->user->email)->queue(
                    new \App\Mail\PaymentReceiptMail($project, $label, $formatted, $type)
                );
            }
        } catch (\Throwable $e) {
            \Log::warning('Payment-verified notification failed: ' . $e->getMessage());
        }
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

            // Auto-activate all sub-professionals for this parent role
            $subs = \App\Models\ProjectSubProfessional::where('project_id', $project->id)
                ->where('parent_role', $termin->role_type)
                ->whereIn('status', ['invited', 'accepted'])
                ->get();

            foreach ($subs as $sub) {
                $sub->update([
                    'status' => 'active',
                    'accepted_at' => $sub->accepted_at ?? now(),
                    'hired_at' => now(),
                ]);

                // Create a notification to let them know they are active
                \App\Models\Notification::create([
                    'user_id' => $sub->user_id,
                    'type' => 'sub_professional_activated',
                    'title' => 'Project Assignment Active',
                    'body' => "The first payment has been verified! You are now active on project \"{$project->title}\" as a " . ($sub->sub_role) . ".",
                    'data' => [
                        'project_id' => $project->id,
                        'sub_professional_id' => $sub->id,
                    ],
                ]);
            }
        }
    }

    /**
     * Resolve whether the user is the hired professional for a specific role on the project.
     * Note: projects.pm_id stores the PM's USER id, while selected_* columns store PROFILE ids.
     */
    private function isHiredProForRole(Project $project, ?string $roleType, $user): bool
    {
        $proUserId = match ($roleType) {
            'arsitek' => $project->selected_arsitek_id ? (\App\Models\Arsitek::find($project->selected_arsitek_id)?->user_id) : null,
            'kontraktor' => $project->selected_kontraktor_id ? (\App\Models\Kontraktor::find($project->selected_kontraktor_id)?->user_id) : null,
            'notaris' => $project->selected_notaris_id ? (\App\Models\NotarisProfile::find($project->selected_notaris_id)?->user_id) : null,
            'interior' => $project->selected_interior_id ? (\App\Models\InteriorProfile::find($project->selected_interior_id)?->user_id) : null,
            'structural' => $project->structural_id ? (\App\Models\StructuralEngineer::find($project->structural_id)?->user_id) : null,
            'mep' => $project->mep_id ? (\App\Models\MepEngineer::find($project->mep_id)?->user_id) : null,
            'project_manager' => $project->pm_id,
            default => null,
        };

        return $proUserId !== null && (int) $proUserId === (int) $user->id;
    }

    /**
     * Resolve whether the user is hired on the project under any role.
     */
    private function isHiredProForAnyRole(Project $project, $user): bool
    {
        foreach (['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager'] as $roleType) {
            if ($this->isHiredProForRole($project, $roleType, $user)) {
                return true;
            }
        }

        return false;
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
