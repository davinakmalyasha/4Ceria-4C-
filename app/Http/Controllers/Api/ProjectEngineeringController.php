<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\ProjectActivityLog;
use App\Http\Resources\ProjectResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Traits\HandlesProjectAuthorization;

class ProjectEngineeringController extends Controller
{
    use HandlesProjectAuthorization;

    protected $engineeringService;

    public function __construct(\App\Services\ProjectEngineeringService $engineeringService)
    {
        $this->engineeringService = $engineeringService;
    }

    public function requestEngineeringRole(Request $request, Project $project)
    {
        $user = Auth::user();
        $request->validate([
            'role_type' => 'required|in:structural,mep',
            'suggested_fee' => 'nullable|numeric|min:0',
            'description' => 'required|string|max:1000',
        ]);

        $isArchitect = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isArchitect && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only the Architect or PM can request engineering roles.'], 403);
        }

        $addendum = $project->addendums()->create([
            'user_id' => $user->id,
            'role_type' => $request->role_type,
            'title' => "[Role Request] " . strtoupper($request->role_type) . " Specialist",
            'description' => $request->description,
            'amount' => $request->suggested_fee ?? 0,
            'status' => 'pending_approval'
        ]);

        $this->logActivity($project, 'engineering_requested', "Architect requested hiring of a " . strtoupper($request->role_type) . " specialist.");

        // Notify Reviewers
        $this->notifyReviewers($project, "Engineering Resource Requested", "The Architect has requested a " . strtoupper($request->role_type) . " specialist for this project.");

        return response()->json(['data' => $addendum]);
    }

    public function verifyEngineeringRequest(Request $request, Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        $isOwner = $user->id === $project->user_id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isPM && !$isOwner) {
            return response()->json(['message' => 'Unauthorized. Only the PM (or Owner as fallback) can authorize engineering roles.'], 403);
        }

        $request->validate(['status' => 'required|in:approved,rejected']);

        $dbStatus = $request->status === 'approved' ? 'approved_unpaid' : 'rejected';
        $addendum->update(['status' => $dbStatus]);

        if ($request->status === 'approved') {
            $roles = $project->published_bidding_roles ?? [];
            if (!in_array($addendum->role_type, $roles)) {
                $roles[] = $addendum->role_type;
            }

            $updateData = ['published_bidding_roles' => $roles];
            if ($addendum->role_type === 'structural') $updateData['requires_structural'] = true;
            if ($addendum->role_type === 'mep') $updateData['requires_mep'] = true;

            $project->update($updateData);
        }

        $this->logActivity($project, 'engineering_request_verified', "{$request->status} hiring request for " . strtoupper($addendum->role_type));

        return response()->json(['data' => $addendum]);
    }

    public function approveEngineeringHire(Request $request, Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        if (!$this->isProjectOwner($project, $user)) {
            return response()->json(['message' => 'Unauthorized. Only the Project Owner can authorize budget commitments.'], 403);
        }

        if ($addendum->status !== 'pending_approval') {
            return response()->json(['message' => 'This request is not pending approval.'], 400);
        }

        $success = $this->engineeringService->finalizeHiring($project, $addendum);

        if (!$success) {
            return response()->json(['message' => 'Insufficient project budget or hiring failure.'], 400);
        }

        $this->logActivity($project, 'engineering_hired', "Owner authorized hiring of " . strtoupper($addendum->recommended_bid_type) . " specialist.");

        return response()->json(['data' => $addendum]);
    }

    public function rejectEngineeringHire(Request $request, Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        $isOwner = $user->id === $project->user_id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $addendum->update(['status' => 'rejected']);

        $this->logActivity($project, 'engineering_hire_rejected', "Hiring request for " . strtoupper($addendum->role_type) . " was rejected.");

        return response()->json(['data' => $addendum]);
    }

    public function approveEngineeringIntegration(Request $request, Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'arsitek' || $project->selected_arsitek_id !== optional($user->arsitek)->id) {
            return response()->json(['message' => 'Only the hired architect can approve engineering integration.'], 403);
        }

        $validated = $request->validate([
            'role_type' => 'required|in:structural,mep',
        ]);

        $roleType = $validated['role_type'];

        if ($roleType === 'structural' && !$project->structural_id) {
            return response()->json(['message' => 'No structural engineer is assigned.'], 422);
        }
        if ($roleType === 'mep' && !$project->mep_id) {
            return response()->json(['message' => 'No MEP engineer is assigned.'], 422);
        }

        $field = $roleType === 'structural' ? 'structural_approved_at' : 'mep_approved_at';

        if ($project->{$field}) {
            return response()->json(['message' => ucfirst($roleType) . ' integration already approved.'], 422);
        }

        DB::beginTransaction();
        try {
            $project->update([$field => now()]);
            $this->logActivity($project, 'engineering_approved', "Architect approved {$roleType} engineering integration.");
            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to approve integration.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function requestEngineeringRevision(Request $request, Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'arsitek' || $project->selected_arsitek_id !== optional($user->arsitek)->id) {
            return response()->json(['message' => 'Only the hired architect can request revisions.'], 403);
        }

        $validated = $request->validate([
            'role_type' => 'required|in:structural,mep',
            'note' => 'required|string|max:1000',
        ]);

        $roleType = $validated['role_type'];

        // Reset approval if previously approved
        $field = $roleType === 'structural' ? 'structural_approved_at' : 'mep_approved_at';
        $project->update([$field => null]);

        // Mark all engineer documents as needing revision
        $project->documents()
            ->where('category', $roleType === 'structural' ? 'structural_calc' : 'mep_layout')
            ->update(['status' => 'revision_requested']);

        $this->logActivity($project, 'engineering_revision', "Architect requested {$roleType} revision: {$validated['note']}");

        return new ProjectResource($this->loadFullProject($project));
    }

    private function loadFullProject(Project $project)
    {
        $project->load([
            'user', 'arsitek', 'kontraktor', 'interior', 'notaris', 'projectManager',
            'bids', 'milestones', 'documents', 'comments', 'addendums'
        ]);
        return $project;
    }

    private function logActivity(Project $project, string $action, string $details): void
    {
        \App\Models\ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }

    private function notifyReviewers(Project $project, string $title, string $body): void
    {
        $reviewers = array_filter([$project->user_id, $project->pm_id]);
        foreach ($reviewers as $userId) {
            \App\Models\Notification::create([
                'user_id' => $userId,
                'type' => 'verification_required',
                'title' => $title,
                'body' => $body,
                'data' => ['project_id' => $project->id],
            ]);
        }
    }
}
