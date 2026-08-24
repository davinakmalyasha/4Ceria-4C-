<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectActivityLog;
use App\Models\ProjectProcurementRequest;
use App\Traits\HandlesProjectAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProjectFeatureController extends Controller
{
    use HandlesProjectAuthorization;

    /**
     * Gate 2: PM verifies technical necessity and forwards to Owner with estimated cost.
     */
    public function pmVerifyProcurement(Request $request, Project $project, ProjectProcurementRequest $procurementRequest)
    {
        $user = Auth::user();

        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the assigned PM can verify procurement requests.'], 403);
        }

        $request->validate([
            'estimated_cost' => 'required|numeric|min:0',
            'pm_note' => 'nullable|string|max:500',
        ]);

        if ($procurementRequest->status !== 'pending_pm') {
            return response()->json(['message' => 'Request is not in a verifiable state'], 422);
        }

        \DB::beginTransaction();
        try {
            $procurementRequest->update([
                'estimated_cost' => $request->estimated_cost,
                'pm_note' => $request->pm_note,
                'status' => 'pending_owner',
            ]);

            $requirement = $procurementRequest->requirement;

            // Create a Budget Addendum for the Owner to approve
            $addendum = ProjectAddendum::create([
                'project_id' => $project->id,
                'role_type' => 'pm_material',
                'user_id' => $user->id,
                'title' => "Material Procurement: {$requirement->name}",
                'description' => "Request for {$procurementRequest->quantity_needed} {$requirement->unit} of {$requirement->name}. PM Note: " . ($request->pm_note ?? 'Verified by PM'),
                'amount' => $request->estimated_cost,
                'status' => 'pending_approval',
                'procurement_request_id' => $procurementRequest->id,
            ]);

            // Notify Owner
            \App\Models\Notification::create([
                'user_id' => $project->user_id,
                'type' => 'budget_approval_needed',
                'title' => 'Budget Authorization Needed',
                'body' => "PM has verified a procurement request for {$requirement->name}. Authorize Rp " . number_format($request->estimated_cost, 0, ',', '.') . " to proceed.",
                'data' => [
                    'project_id' => $project->id,
                    'addendum_id' => $addendum->id,
                    'request_id' => $procurementRequest->id
                ],
            ]);

            $this->logActivity($project, 'procurement_verified', "PM verified procurement for {$requirement->name} with estimated cost Rp " . number_format($request->estimated_cost, 0, ',', '.'));

            \DB::commit();

            return response()->json(['message' => 'Request forwarded to Owner for budget approval.', 'data' => $procurementRequest]);
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Verification failed: ' . $e->getMessage()], 500);
        }
    }

    /**
     * PM rejects the procurement request.
     */
    public function pmRejectProcurement(Request $request, Project $project, ProjectProcurementRequest $procurementRequest)
    {
        $user = Auth::user();

        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate(['pm_note' => 'required|string|max:500']);

        $procurementRequest->update([
            'status' => 'rejected',
            'pm_note' => $request->pm_note,
        ]);

        // Notify Contractor
        \App\Models\Notification::create([
            'user_id' => $procurementRequest->requested_by,
            'type' => 'procurement_rejected',
            'title' => 'Procurement Request Rejected',
            'body' => "PM rejected your request for {$procurementRequest->requirement->name}. Note: {$request->pm_note}",
            'data' => ['project_id' => $project->id],
        ]);

        $this->logActivity($project, 'procurement_rejected', "PM rejected procurement for {$procurementRequest->requirement->name}.");

        return response()->json(['data' => $procurementRequest]);
    }

    private function logActivity(Project $project, string $action, string $details): void
    {
        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }
}
