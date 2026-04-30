<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectChangeOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectChangeOrderController extends Controller
{
    public function index(Project $project)
    {
        $orders = $project->changeOrders()->with('requester:id,name,role_type')->get();
        return response()->json(['data' => $orders]);
    }

    public function store(Request $request, Project $project)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string|max:2000',
            'cost_impact' => 'required|numeric',
            'time_impact_days' => 'nullable|integer|min:0',
        ]);

        DB::beginTransaction();
        try {
            $order = $project->changeOrders()->create([
                'requested_by' => $user->id,
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
                    $project->paymentTermins()->create([
                        'label' => 'Change Order: ' . $changeOrder->title,
                        'percentage' => 0, // It's an absolute amount, not a % of base contract
                        'amount' => $changeOrder->cost_impact,
                        'retention_amount' => 0, // Typically COs don't have retention, or if they do it's handled separately
                        'net_amount' => $changeOrder->cost_impact,
                        'trigger_description' => 'Completion of Change Order: ' . $changeOrder->title,
                        'notes' => 'Auto-generated from approved Change Order #' . $changeOrder->id,
                        'status' => 'locked',
                        'role_type' => 'kontraktor', // Assuming COs are usually for contractors
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
