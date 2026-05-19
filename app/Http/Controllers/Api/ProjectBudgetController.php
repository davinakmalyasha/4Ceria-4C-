<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectBudgetSandbox;
use App\Models\ProjectAddendum;
use App\Models\ProjectProcurementRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ProjectBudgetController extends Controller
{
    public function getDashboard(Project $project)
    {
        try {
            $userId = Auth::id();
            $isOwner = $project->user_id == $userId;
            $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id == $project->pm_id;

            if (!$isOwner && !$isPM) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $project->load([
                'budgetTransactions', 
                'budgetSandboxItems', 
                'addendums.user',
                'addendums.teamMember',
                'addendums.assignedUser',
                'bidsArsitek' => fn($q) => $q->where('status', 'accepted')->with('arsitek.user'),
                'bidsKontraktor' => fn($q) => $q->where('status', 'accepted')->with('kontraktor.user'),
                'bidsNotaris' => fn($q) => $q->where('status', 'accepted')->with('notaris.user'),
                'bidsInterior' => fn($q) => $q->where('status', 'accepted')->with('interior.user'),
                'paymentTermins',
                'projectManager.user'
            ]);

            Log::info('Budget Dashboard Loaded', [
                'project_id' => $project->id,
                'budget_value' => $project->budget,
                'transaction_count' => $project->budgetTransactions->count()
            ]);

            return response()->json([
                'project_budget' => (string) $project->budget,
                'transactions' => $project->budgetTransactions->map(function($t) {
                    $t->amount = (string) $t->amount;
                    return $t;
                }),
                'sandbox_items' => $project->budgetSandboxItems->map(function($s) {
                    $s->estimated_amount = (string) $s->estimated_amount;
                    return $s;
                }),
                'addendums' => $project->addendums->map(function($a) {
                    $a->amount = (string) $a->amount;
                    return $a;
                }),
                'accepted_bids' => [
                    'project_manager' => ($project->pm_id && $project->projectManager) ? [
                        'id' => $project->pm_id,
                        'pm' => ['user' => ['name' => optional($project->projectManager->user)->name ?? 'Project Manager']],
                        'price' => (string) (($bid = $project->bidsProjectManager()->where('status', 'accepted')->orWhere('status', 'active')->first()) ? ($bid->calculated_total ?? $bid->price) : 10000000),
                        'payment_status' => 'paid',
                        'paid_at' => $project->created_at 
                    ] : null,
                    'arsitek' => $project->bidsArsitek->first() ? array_merge($project->bidsArsitek->first()->toArray(), ['price' => (string) $project->bidsArsitek->first()->price]) : null,
                    'kontraktor' => $project->bidsKontraktor->first() ? array_merge($project->bidsKontraktor->first()->toArray(), ['price' => (string) $project->bidsKontraktor->first()->price]) : null,
                    'notaris' => $project->bidsNotaris->first() ? array_merge($project->bidsNotaris->first()->toArray(), ['price' => (string) $project->bidsNotaris->first()->price]) : null,
                    'interior' => $project->bidsInterior->first() ? array_merge($project->bidsInterior->first()->toArray(), ['price' => (string) $project->bidsInterior->first()->price]) : null,
                ],
                'payment_termins' => $project->paymentTermins->map(function($pt) {
                    $pt->amount = (string) $pt->amount;
                    return $pt;
                }),
            ]);
        } catch (\Exception $e) {
            Log::error('Budget Dashboard Error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['message' => 'Dashboard error', 'error' => $e->getMessage()], 500);
        }
    }

    public function addTransaction(Request $request, Project $project)
    {
        try {
            $userId = Auth::id();
            $isOwner = $project->user_id === $userId;
            $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

            if (!$isOwner) {
                return response()->json(['message' => 'Unauthorized. Only the project owner can adjust the total balance.'], 403);
            }

            $request->validate([
                'transaction_type' => 'required|in:deposit,adjustment_down',
                'amount' => 'required|numeric|min:1',
                'title' => 'required|string|max:255',
            ]);

            $transaction = ProjectBudgetTransaction::create([
                'project_id' => $project->id,
                'transaction_type' => $request->transaction_type,
                'amount' => $request->amount,
                'title' => $request->title,
                'transaction_date' => now(),
            ]);

            Log::info('Transaction Recorded', ['id' => $transaction->id]);

            return response()->json(['message' => 'Transaction recorded successfully', 'transaction' => $transaction]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['message' => 'Validation error', 'errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('Budget Transaction Error: ' . $e->getMessage(), [
                'input' => $request->all(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['message' => 'Transaction failed: ' . $e->getMessage()], 500);
        }
    }

    public function addSandboxItem(Request $request, Project $project)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'estimated_amount' => 'required|numeric|min:1',
        ]);

        $item = ProjectBudgetSandbox::create([
            'project_id' => $project->id,
            'title' => $request->title,
            'estimated_amount' => $request->estimated_amount,
            'is_active' => true,
        ]);

        return response()->json(['item' => $item]);
    }

    public function toggleSandboxItem(Request $request, Project $project, $itemId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = ProjectBudgetSandbox::where('project_id', $project->id)->findOrFail($itemId);
        $item->update(['is_active' => !$item->is_active]);

        return response()->json(['item' => $item]);
    }

    public function updateSandboxItem(Request $request, Project $project, $itemId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'estimated_amount' => 'required|numeric|min:1',
        ]);

        $item = ProjectBudgetSandbox::where('project_id', $project->id)->findOrFail($itemId);
        $item->update([
            'title' => $request->title,
            'estimated_amount' => $request->estimated_amount,
        ]);

        return response()->json(['item' => $item]);
    }

    public function deleteSandboxItem(Project $project, $itemId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = ProjectBudgetSandbox::where('project_id', $project->id)->findOrFail($itemId);
        $item->delete();

        return response()->json(['message' => 'Sandbox item deleted successfully']);
    }

    public function markPaid(Request $request, Project $project)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner) {
            return response()->json(['message' => 'Unauthorized. Only the project owner can confirm payments.'], 403);
        }

        $request->validate([
            'type' => 'required|in:bid_arsitek,bid_notaris,bid_interior,bid_structural,bid_mep,addendum,termin',
            'id' => 'required|integer'
        ]);

        DB::beginTransaction();
        try {
            $amount = 0;
            $title = '';
            $referenceModel = '';

            if ($request->type === 'bid_arsitek') {
                $bid = \App\Models\BidArsitek::where('project_id', $project->id)->findOrFail($request->id);
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->price;
                $title = 'Paid Architect Base Fee';
                $referenceModel = 'App\Models\BidArsitek';
            } elseif ($request->type === 'bid_notaris') {
                $bid = \App\Models\BidNotaris::where('project_id', $project->id)->findOrFail($request->id);
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->price;
                $title = 'Paid Notaris Base Fee';
                $referenceModel = 'App\Models\BidNotaris';
            } elseif ($request->type === 'bid_interior') {
                $bid = \App\Models\BidInterior::where('project_id', $project->id)->findOrFail($request->id);
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->price;
                $title = 'Paid Interior Designer Base Fee';
                $referenceModel = 'App\Models\BidInterior';
            } elseif ($request->type === 'bid_structural') {
                $bid = \App\Models\BidStructural::where('project_id', $project->id)->findOrFail($request->id);
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid Structural Engineer Resource';
                $referenceModel = 'App\Models\BidStructural';
                $project->update(['structural_id' => $bid->structural_id]);
            } elseif ($request->type === 'bid_mep') {
                $bid = \App\Models\BidMep::where('project_id', $project->id)->findOrFail($request->id);
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid MEP Engineer Resource';
                $referenceModel = 'App\Models\BidMep';
                $project->update(['mep_id' => $bid->mep_id]);
            } elseif ($request->type === 'addendum') {
                $addendum = ProjectAddendum::where('project_id', $project->id)->findOrFail($request->id);
                $addendum->update(['status' => 'paid', 'paid_at' => now()]);
                $amount = $addendum->amount;
                $title = 'Paid Addendum: ' . $addendum->title;
                $referenceModel = 'App\Models\ProjectAddendum';

                if ($addendum->procurement_request_id) {
                    $procReq = ProjectProcurementRequest::find($addendum->procurement_request_id);
                    if ($procReq) {
                        $procReq->update(['status' => 'authorized']);
                    }
                }

                // Finalize specialist assignment if this was a specialist hiring addendum
                if (in_array($addendum->type, ['specialist_assignment', 'specialist_request']) && ($addendum->team_member_id || $addendum->assigned_user_id)) {
                    $subRole = $addendum->specialist_type ?: $addendum->role_type;
                    $specialistUserId = null;
                    $specialistName = '';

                    if ($addendum->assigned_user_id) {
                        $user = \App\Models\User::find($addendum->assigned_user_id);
                        if ($user) {
                            $specialistUserId = $user->id;
                            $specialistName = $user->name;
                        }
                    } else {
                        $teamMember = \App\Models\TeamMember::find($addendum->team_member_id);
                        if ($teamMember) {
                            $specialistName = $teamMember->name;
                        }
                    }

                    if ($specialistName || $specialistUserId) {
                        \App\Models\ProjectSubProfessional::updateOrCreate(
                            ['project_id' => $project->id, 'sub_role' => $subRole],
                            [
                                'user_id' => $specialistUserId,
                                'parent_role' => $addendum->role_type,
                                'assigned_by' => $addendum->user_id,
                                'status' => 'active',
                                'rate' => $addendum->amount,
                                'lead_pro_notes' => "Assigned via Paid Addendum: {$specialistName}",
                                'hired_at' => now(),
                            ]
                        );

                        if ($subRole === 'structural') {
                            $struc = $specialistUserId ? \App\Models\StructuralEngineer::where('user_id', $specialistUserId)->first() : null;
                            $project->update(['structural_id' => $struc ? $struc->id : null]);
                        } elseif ($subRole === 'mep') {
                            $mep = $specialistUserId ? \App\Models\MepEngineer::where('user_id', $specialistUserId)->first() : null;
                            $project->update(['mep_id' => $mep ? $mep->id : null]);
                        } elseif ($subRole === 'interior') {
                            $interior = $specialistUserId ? \App\Models\InteriorProfile::where('user_id', $specialistUserId)->first() : null;
                            $project->update(['selected_interior_id' => $interior ? $interior->id : null]);
                        }
                    }
                }

                // Also handle 4C Specialist hiring addendums
                if ($addendum->recommended_bid_id && $addendum->recommended_bid_type) {
                    if ($addendum->recommended_bid_type === 'structural') {
                        $bid = \App\Models\BidStructural::find($addendum->recommended_bid_id);
                        if ($bid) {
                            $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                            $project->update(['structural_id' => $bid->structural_id]);
                        }
                    } elseif ($addendum->recommended_bid_type === 'mep') {
                        $bid = \App\Models\BidMep::find($addendum->recommended_bid_id);
                        if ($bid) {
                            $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                            $project->update(['mep_id' => $bid->mep_id]);
                        }
                    }
                }
            } elseif ($request->type === 'termin') {
                $termin = \App\Models\ProjectPaymentTermin::where('project_id', $project->id)->findOrFail($request->id);
                $termin->update(['status' => 'paid', 'paid_at' => now()]);
                $amount = $termin->amount;
                
                // CRITICAL FIX: Include role in title so it's not always "Contractor"
                $roleLabel = match($termin->role_type) {
                    'notaris' => 'Notary',
                    'project_manager', 'pm' => 'Project Manager',
                    'arsitek' => 'Architect',
                    'interior' => 'Interior',
                    default => 'Contractor',
                };
                
                $title = "Paid {$roleLabel} Termin: " . $termin->label;
                $referenceModel = 'App\Models\ProjectPaymentTermin';
            }

            // Create Transaction
            ProjectBudgetTransaction::create([
                'project_id' => $project->id,
                'transaction_type' => 'payment',
                'amount' => $amount,
                'title' => $title,
                'reference_model' => $referenceModel,
                'reference_id' => $request->id,
                'transaction_date' => now(),
            ]);

            DB::commit();
            return response()->json(['message' => 'Successfully marked as paid and deducted from budget.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to process payment tracking.', 'error' => $e->getMessage()], 500);
        }
    }

    // Professional endpoints for Addendums
    public function createAddendum(Request $request, Project $project)
    {
        // Only hired professionals can create addendums
        $userId = Auth::id();
        $roleType = Auth::user()->role_type;
        
        $isHired = false;
        if ($roleType === 'arsitek' && $project->selected_arsitek_id == optional(Auth::user()->arsitek)->id) $isHired = true;
        if ($roleType === 'kontraktor' && $project->selected_kontraktor_id == optional(Auth::user()->kontraktor)->id) $isHired = true;
        if ($roleType === 'notaris' && $project->selected_notaris_id == optional(Auth::user()->notaris_profile)->id) $isHired = true;
        if ($roleType === 'interior' && $project->selected_interior_id == optional(Auth::user()->interior_profile)->id) $isHired = true;
        if ($roleType === 'project_manager' && Auth::user()->id === $project->pm_id) $isHired = true;

        if (!$isHired) {
            return response()->json(['message' => 'Unauthorized. Must be hired professional.'], 403);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'amount' => 'required|numeric|min:1',
            'description' => 'nullable|string',
            'type' => 'nullable|string|in:extra_fee,specialist_assignment',
            'team_member_id' => 'nullable|exists:team_members,id',
            'assigned_user_id' => 'nullable|exists:users,id',
            'specialist_type' => 'nullable|string|in:structural,mep',
            'attachment' => 'nullable|file|max:10240', // 10MB limit
        ]);

        $attachmentPath = null;
        if ($request->hasFile('attachment')) {
            $attachmentPath = $request->file('attachment')->store('addendums', 'public');
        }

        $addendum = ProjectAddendum::create([
            'project_id' => $project->id,
            'role_type' => $roleType,
            'user_id' => $userId,
            'title' => $request->title,
            'amount' => $request->amount,
            'description' => $request->description,
            'type' => $request->type ?? 'extra_fee',
            'team_member_id' => $request->team_member_id,
            'assigned_user_id' => $request->assigned_user_id,
            'specialist_type' => $request->specialist_type,
            'attachment_path' => $attachmentPath,
            'status' => 'pending_approval',
        ]);

        return response()->json(['message' => 'Addendum submitted for client approval.', 'addendum' => $addendum]);
    }

    public function handleAddendumStatus(Request $request, Project $project, $addendumId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        // Define if user is the proposing professional
        $addendum = ProjectAddendum::where('project_id', $project->id)->find($addendumId);
        $isPro = $addendum && $addendum->user_id == $userId;

        // Both Owner and PM can authorize/manage budget items for tracking
        // Professionals can only interact if it's their addendum and it's in negotiating state
        if (!$isOwner && !$isPM && !($isPro && $addendum && $addendum->status === 'negotiating')) {
            return response()->json(['message' => 'Unauthorized. Only the project owner, manager, or proposing professional (during negotiation) can manage this.'], 403);
        }

        $request->validate([
            'status' => 'required|in:approved_unpaid,rejected,negotiating,pending_approval,accepted_by_pro',
            'amount' => 'nullable|numeric|min:0',
            'counter_offer_amount' => 'nullable|numeric|min:0',
            'negotiation_note' => 'nullable|string',
        ]);

        if (!$addendum) {
            return response()->json(['message' => 'Addendum not found.'], 404);
        }

        if ($addendum->status !== 'pending_approval' && $addendum->status !== 'negotiating' && $addendum->status !== 'accepted_by_pro') {
            return response()->json(['message' => 'This item has already been processed or is not in a negotiable state.'], 422);
        }

        return DB::transaction(function () use ($request, $project, $addendum) {
            $financialService = app(\App\Services\ProjectFinancialService::class);
            
            // Update amount if provided (e.g. refining an estimate)
            if ($request->has('amount')) {
                $addendum->amount = $request->amount;
            }
            
                $addendum->update(['status' => $request->status]);
    
                if ($request->status === 'approved_unpaid') {
                    $roleLabel = Auth::user()->role_type === 'project_manager' ? 'Project Manager' : 'Owner';

                    // Notify relevant parties - Owner needs to know it's time to pay
                    $notificationTitle = "Budget Authorized by {$roleLabel}";
                    $notificationBody = "The {$roleLabel} has approved the budget of Rp " . number_format($addendum->amount, 0, ',', '.') . " for \"{$addendum->title}\". Please proceed with the payment.";

                    // If PM authorized, notify Owner. If Owner authorized, notify PM.
                    $notifyId = (Auth::user()->role_type === 'project_manager') ? $project->user_id : $project->pm_id;

                    if ($notifyId) {
                        \App\Models\Notification::create([
                            'user_id' => $notifyId,
                            'type' => 'budget_approved',
                            'title' => $notificationTitle,
                            'body' => $notificationBody,
                            'data' => ['project_id' => $project->id],
                        ]);
                    }

                    \App\Models\ProjectActivityLog::create([
                        'project_id' => $project->id,
                        'user_id' => Auth::id(),
                        'action' => 'budget_authorized',
                        'details' => "{$roleLabel} authorized budget: {$addendum->title} (Rp " . number_format($addendum->amount, 0, ',', '.') . ") - Awaiting Payment",
                    ]);

                    return response()->json(['message' => 'Budget authorized successfully. Awaiting payment from the Project Owner.']);
                }

            if ($request->status === 'negotiating') {
                $roleLabel = Auth::user()->role_type === 'project_manager' ? 'Project Manager' : 'Owner';
                
                $addendum->update([
                    'status' => 'negotiating',
                    'counter_offer_amount' => $request->counter_offer_amount,
                    'negotiation_note' => $request->negotiation_note
                ]);

                // Notify the professional who proposed it
                if ($addendum->user_id) {
                    \App\Models\Notification::create([
                        'user_id' => $addendum->user_id,
                        'type' => 'budget_negotiation',
                        'title' => 'Fee Negotiation Requested',
                        'body' => "The {$roleLabel} has requested a fee negotiation for \"{$addendum->title}\". Counter-offer: Rp " . number_format($request->counter_offer_amount, 0, ',', '.'),
                        'data' => ['project_id' => $project->id],
                    ]);
                }

                \App\Models\ProjectActivityLog::create([
                    'project_id' => $project->id,
                    'user_id' => Auth::id(),
                    'action' => 'budget_negotiating',
                    'details' => "{$roleLabel} requested fee negotiation for: {$addendum->title} (Counter-offer: Rp " . number_format($request->counter_offer_amount, 0, ',', '.') . ")",
                ]);

                return response()->json(['message' => 'Negotiation request sent.']);
            }

            // Rejected — professional stays assigned but no money is deducted
            $roleLabel = Auth::user()->role_type === 'project_manager' ? 'Project Manager' : 'Owner';
            $notifyId = (Auth::user()->role_type === 'project_manager') ? $project->user_id : $project->pm_id;

            if ($notifyId) {
                \App\Models\Notification::create([
                    'user_id' => $notifyId,
                    'type' => 'budget_rejected',
                    'title' => "Budget Authorization Rejected by {$roleLabel}",
                    'body' => "The {$roleLabel} has rejected the budget for \"{$addendum->title}\". Please discuss with the {$roleLabel}.",
                    'data' => ['project_id' => $project->id],
                ]);
            }

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'budget_rejected',
                'details' => "{$roleLabel} rejected budget: {$addendum->title}",
            ]);

            return response()->json(['message' => 'Budget authorization rejected.']);
        });
    }
}
