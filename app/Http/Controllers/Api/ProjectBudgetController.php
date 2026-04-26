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
            $isOwner = $project->user_id === $userId;
            $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

            if (!$isOwner && !$isPM) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $project->load([
                'budgetTransactions', 
                'budgetSandboxItems', 
                'addendums.user',
                'bidsArsitek' => fn($q) => $q->where('status', 'accepted')->with('arsitek.user'),
                'bidsKontraktor' => fn($q) => $q->where('status', 'accepted')->with('kontraktor.user'),
                'bidsNotaris' => fn($q) => $q->where('status', 'accepted')->with('notaris.user'),
                'bidsInterior' => fn($q) => $q->where('status', 'accepted')->with('interior.user'),
                'paymentTermins'
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
            'type' => 'required|in:bid_arsitek,bid_notaris,bid_interior,addendum,termin',
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
            } elseif ($request->type === 'addendum') {
                $addendum = ProjectAddendum::where('project_id', $project->id)->findOrFail($request->id);
                $addendum->update(['status' => 'paid', 'paid_at' => now()]);
                $amount = $addendum->amount;
                $title = 'Paid Addendum: ' . $addendum->title;
                $referenceModel = 'App\Models\ProjectAddendum';
            } elseif ($request->type === 'termin') {
                $termin = \App\Models\ProjectPaymentTermin::where('project_id', $project->id)->findOrFail($request->id);
                $termin->update(['status' => 'paid', 'paid_at' => now()]);
                $amount = $termin->amount;
                $title = 'Paid Contractor Termin: ' . $termin->label;
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
        ]);

        $addendum = ProjectAddendum::create([
            'project_id' => $project->id,
            'role_type' => $roleType,
            'user_id' => $userId,
            'title' => $request->title,
            'amount' => $request->amount,
            'description' => $request->description,
            'status' => 'pending_approval',
        ]);

        return response()->json(['message' => 'Addendum submitted for client approval.', 'addendum' => $addendum]);
    }

    public function handleAddendumStatus(Request $request, Project $project, $addendumId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;

        // Only the Owner can authorize budget — not the PM
        if (!$isOwner) {
            return response()->json(['message' => 'Unauthorized. Only the project owner can authorize budget allocations.'], 403);
        }

        $request->validate([
            'status' => 'required|in:approved_unpaid,rejected',
        ]);

        $addendum = ProjectAddendum::where('project_id', $project->id)->findOrFail($addendumId);

        if ($addendum->status !== 'pending_approval') {
            return response()->json(['message' => 'This addendum has already been processed.'], 422);
        }

        return DB::transaction(function () use ($request, $project, $addendum) {
            $addendum->update(['status' => $request->status]);

            if ($request->status === 'approved_unpaid') {
                // Budget Safety Check
                if ($project->budget < $addendum->amount) {
                    return response()->json([
                        'message' => 'Insufficient project budget. Cost (Rp ' .
                            number_format($addendum->amount, 0, ',', '.') . ') exceeds available budget (Rp ' .
                            number_format($project->budget, 0, ',', '.') . ').'
                    ], 400);
                }

                // Deduct budget
                $project->update(['budget' => $project->budget - $addendum->amount]);

                // Log Financial Transaction
                ProjectBudgetTransaction::create([
                    'project_id' => $project->id,
                    'transaction_type' => 'adjustment_down',
                    'amount' => $addendum->amount,
                    'title' => 'Owner Authorized: ' . $addendum->title,
                    'reference_model' => 'App\\Models\\ProjectAddendum',
                    'reference_id' => $addendum->id,
                    'transaction_date' => now(),
                ]);

                // Notify PM that budget was approved
                if ($project->pm_id) {
                    \App\Models\Notification::create([
                        'user_id' => $project->pm_id,
                        'type' => 'budget_approved',
                        'title' => 'Budget Authorized by Owner',
                        'body' => "The owner has approved the budget of Rp " . number_format($addendum->amount, 0, ',', '.') . " for \"{$addendum->title}\".",
                        'data' => ['project_id' => $project->id],
                    ]);
                }

                \App\Models\ProjectActivityLog::create([
                    'project_id' => $project->id,
                    'user_id' => Auth::id(),
                    'action' => 'budget_authorized',
                    'details' => "Owner authorized budget: {$addendum->title} (Rp " . number_format($addendum->amount, 0, ',', '.') . ")",
                ]);

                return response()->json(['message' => 'Budget authorized successfully. Funds have been allocated.']);
            }

            // Rejected — professional stays assigned but no money is deducted
            if ($project->pm_id) {
                \App\Models\Notification::create([
                    'user_id' => $project->pm_id,
                    'type' => 'budget_rejected',
                    'title' => 'Budget Authorization Rejected',
                    'body' => "The owner has rejected the budget for \"{$addendum->title}\". Please discuss with the owner.",
                    'data' => ['project_id' => $project->id],
                ]);
            }

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'budget_rejected',
                'details' => "Owner rejected budget: {$addendum->title}",
            ]);

            return response()->json(['message' => 'Budget authorization rejected.']);
        });
    }
}
