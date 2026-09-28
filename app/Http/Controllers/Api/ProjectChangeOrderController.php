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
            // A negative cost impact was accepted and then folded into budget
            // math as a credit, inflating the owner's remaining budget.
            'cost_impact' => 'required|numeric|min:0|max:99999999999999',
            'time_impact_days' => 'nullable|integer|min:0|max:3650',
            'milestone_id' => 'nullable|integer|exists:project_milestones,id',
        ]);

        // SECURITY: the milestone must belong to THIS project.
        if (! empty($validated['milestone_id'])) {
            $ownsMilestone = $project->milestones()->whereKey($validated['milestone_id'])->exists();
            if (! $ownsMilestone) {
                return response()->json(['message' => 'Not found.'], 404);
            }
        }

        // DISPUTE FREEZE: no new financial commitments while a dispute is open.
        app(\App\Services\DisputeService::class)->assertNoOpenDispute($project);

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
            \Log::error('Change-order submit failed: '.$e->getMessage(), [
                'project_id' => $project->id,
                'exception' => $e,
            ]);
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

        // STATE MACHINE: a decided change order cannot be re-reviewed (this
        // method had no status guard, so a rejected order could be pushed back
        // to pm_reviewed and re-approved, minting another payable stage).
        if ($changeOrder->status !== 'proposed') {
            return response()->json([
                'message' => 'This change order has already been reviewed (status: '.$changeOrder->status.').',
            ], 422);
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
            \Log::error('Change-order review failed: '.$e->getMessage(), ['exception' => $e]);
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

        // STATE MACHINE (money-critical): previously ANY action was accepted at
        // any status, so approve → reject → approve minted a SECOND payable
        // payment stage for the same change order. Each stage is an ordinary
        // termin with its own reference, so the ledger dedupe could not catch
        // it and the owner was charged twice for one change.
        if (! in_array($changeOrder->status, ['proposed', 'pm_reviewed'], true)) {
            return response()->json([
                'message' => 'This change order has already been decided (status: '.$changeOrder->status.').',
            ], 422);
        }

        app(\App\Services\DisputeService::class)->assertNoOpenDispute($project);

        DB::beginTransaction();
        try {
            $updates = ['owner_notes' => $validated['owner_notes'] ?? null];
            if ($validated['action'] === 'approve') {
                $updates['status'] = 'owner_approved';
                $updates['approved_at'] = now();

                // Financial Synchronization: exactly ONE payment stage for the
                // approved extra cost. `change_order_id` carries a UNIQUE index
                // (payment_termin_change_order_unique), so a duplicate is now
                // impossible at the database level rather than by convention.
                if ($changeOrder->cost_impact > 0) {
                    $milestone = $changeOrder->milestone;
                    $status = 'locked';

                    // If the milestone is already approved, the payment should be ready for the user to pay
                    if ($milestone && $milestone->approval_status === 'approved') {
                        $status = 'pending'; // 'pending' in this system means awaiting payment proof
                    }

                    // Refuse to promise more than the escrow can ever pay.
                    $financial = app(\App\Services\ProjectFinancialService::class);
                    $available = $financial->available($project);

                    if ((float) $changeOrder->cost_impact > $available + 0.01) {
                        throw new \Exception(
                            'This change order costs Rp '.number_format((float) $changeOrder->cost_impact, 0, ',', '.')
                            .' but only Rp '.number_format($available, 0, ',', '.').' of escrow remains. '
                            .'Increase the project budget before approving.',
                            422
                        );
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
                        'change_order_id' => $changeOrder->id,
                    ]);
                }
            } else {
                $updates['status'] = 'rejected';
            }
            $changeOrder->update($updates);
            // owner_approved change orders count toward budget math — touch
            // the project so the cached calculateBudgetSummary invalidates.
            if ($updates['status'] === 'owner_approved') {
                $project->touch();
            }
            DB::commit();
            return response()->json(['message' => 'Change order decided.', 'data' => $changeOrder->fresh()]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
            DB::rollBack();
            // The one-stage-per-change-order guarantee fired.
            return response()->json([
                'message' => 'A payment stage already exists for this change order.',
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Change-order decision failed: '.$e->getMessage(), [
                'project_id' => $project->id,
                'change_order_id' => $changeOrder->id,
                'exception' => $e,
            ]);

            // 422-class business rules (e.g. insufficient escrow) must reach the
            // client verbatim; anything else is logged and generic.
            $code = (int) $e->getCode();
            if ($code >= 400 && $code < 600) {
                return response()->json(['message' => $e->getMessage()], $code);
            }

            return response()->json(['message' => 'Decision failed. Please try again.'], 500);
        }
    }
}
