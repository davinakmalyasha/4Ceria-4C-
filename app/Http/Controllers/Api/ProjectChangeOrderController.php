<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectChangeOrder;
use App\Traits\HandlesProjectAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectChangeOrderController extends Controller
{
    use HandlesProjectAuthorization;

    public function index(Project $project)
    {
        $user = Auth::user();
        if (!$user || !$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $orders = $project->changeOrders()->with('requester:id,name,role_type')->get()->map(function($order) {
            return [
                'id' => 'co-' . $order->id,
                'type' => 'change_order',
                'title' => $order->title,
                'description' => $order->description,
                'cost_impact' => $order->cost_impact,
                'status' => $order->status === 'owner_approved' ? 'owner_approved' : ($order->status === 'rejected' ? 'rejected' : 'proposed'),
                'requester' => $order->requester,
                'milestone_id' => $order->milestone_id,
                'created_at' => $order->created_at,
            ];
        });

        $addendums = $project->addendums()
            ->whereIn('status', ['approved_unpaid', 'paid', 'negotiating', 'accepted_by_pro'])
            ->with('user:id,name,role_type')
            ->get()
            ->map(function($a) {
                return [
                    'id' => 'add-' . $a->id,
                    'type' => 'addendum',
                    'title' => $a->title,
                    'description' => $a->description,
                    'cost_impact' => $a->amount,
                    'status' => $a->status === 'paid' ? 'owner_approved' : ($a->status === 'approved_unpaid' ? 'owner_approved' : 'proposed'),
                    'requester' => $a->user,
                    'milestone_id' => null,
                    'created_at' => $a->created_at,
                ];
            });

        $combined = $orders->concat($addendums)->sortByDesc('created_at')->values();

        return response()->json(['data' => $combined]);
    }

    public function store(Request $request, Project $project)
    {
        $user = Auth::user();

        // Only project participants may propose change orders.
        if (!$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized. Only project participants can submit change orders.'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string|max:2000',
            'cost_impact' => 'required|numeric',
            'time_impact_days' => 'nullable|integer|min:0',
            'milestone_id' => 'nullable|exists:project_milestones,id',
        ]);

        DB::beginTransaction();
        try {
            $order = $project->changeOrders()->create([
                'requested_by' => $user->id,
                'role_type' => $user->role_type,
                'milestone_id' => $validated['milestone_id'] ?? null,
                'title' => $validated['title'],
                'description' => $validated['description'],
                'cost_impact' => $validated['cost_impact'],
                'time_impact_days' => $validated['time_impact_days'] ?? 0,
                'status' => 'proposed',
            ]);
            DB::commit();
            return response()->json(['message' => 'Change order submitted.', 'data' => $order], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to submit change order.'], 500);
        }
    }

    public function pmReview(Request $request, Project $project, ProjectChangeOrder $changeOrder)
    {
        $user = Auth::user();

        // Binding check: the change order must belong to THIS project.
        if ((int) $changeOrder->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Only the assigned PM can review change orders.'], 403);
        }

        $validated = $request->validate([
            'pm_notes' => 'required|string|max:2000',
            'action' => 'required|in:approve,reject',
        ]);

        DB::beginTransaction();
        try {
            $updates = ['pm_notes' => $validated['pm_notes']];
            $updates['status'] = $validated['action'] === 'approve' ? 'pm_reviewed' : 'rejected';
            $changeOrder->update($updates);
            DB::commit();
            return response()->json(['message' => 'Change order reviewed.', 'data' => $changeOrder->fresh()]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Review failed.'], 500);
        }
    }

    public function ownerDecide(Request $request, Project $project, ProjectChangeOrder $changeOrder)
    {
        $user = Auth::user();

        // Binding check: the change order must belong to THIS project.
        if ((int) $changeOrder->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($user->id !== $project->user_id) {
            return response()->json(['message' => 'Only the project Owner can approve change orders.'], 403);
        }

        $validated = $request->validate([
            'action' => 'required|in:approve,reject',
            'owner_notes' => 'nullable|string|max:2000',
        ]);

        DB::beginTransaction();
        try {
            $updates = ['owner_notes' => $validated['owner_notes'] ?? null];
            if ($validated['action'] === 'approve') {
                $updates['status'] = 'owner_approved';
                $updates['approved_at'] = now();
                
                // Financial Synchronization: Auto-generate a Payment Termin for the approved extra cost
                if ($changeOrder->cost_impact > 0) {
                    $milestone = $changeOrder->milestone;
                    $status = 'locked';
                    
                    // If the milestone is already approved, the payment should be ready for the user to pay
                    if ($milestone && $milestone->approval_status === 'approved') {
                        $status = 'pending'; // 'pending' in this system means awaiting payment proof
                    }

                    $project->paymentTermins()->create([
                        'label' => 'Change Order: ' . $changeOrder->title,
                        'percentage' => 0, 
                        'amount' => $changeOrder->cost_impact,
                        'retention_amount' => 0,
                        'net_amount' => $changeOrder->cost_impact,
                        'trigger_description' => 'Completion of Change Order: ' . $changeOrder->title,
                        'notes' => 'Auto-generated from approved Change Order #' . $changeOrder->id,
                        'status' => $status,
                        'role_type' => $changeOrder->role_type ?? 'kontraktor', 
                        'milestone_id' => $changeOrder->milestone_id,
                    ]);
                }
            } else {
                $updates['status'] = 'rejected';
            }
            $changeOrder->update($updates);
            DB::commit();
            return response()->json(['message' => 'Change order decided.', 'data' => $changeOrder->fresh()]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Decision failed: ' . $e->getMessage()], 500);
        }
    }
}
