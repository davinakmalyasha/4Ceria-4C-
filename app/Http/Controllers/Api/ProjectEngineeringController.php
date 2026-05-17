<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectMilestone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProjectEngineeringController extends Controller
{
    /**
     * Store a manual technical log for a specific role (structural/mep).
     */
    public function storeLog(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $request->validate([
            'role_type' => 'required|in:structural,mep',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'files' => 'nullable|array',
            'files.*' => 'file|max:10240', // 10MB
        ]);

        return DB::transaction(function () use ($request, $project) {
            $gallery = [];
            if ($request->hasFile('files')) {
                foreach ($request->file('files') as $file) {
                    $path = $file->store('milestones/gallery', 'public');
                    $gallery[] = $path;
                }
            }

            $milestone = ProjectMilestone::create([
                'project_id' => $project->id,
                'phase_context' => $request->role_type,
                'title' => $request->title,
                'description' => $request->description,
                'type' => 'generic',
                'status' => 'active',
                'approval_status' => 'approved', // Internal logs are auto-approved
                'pm_verified_at' => now(),
                'content' => [
                    'checklist' => [],
                    'gallery' => $gallery,
                    'is_manual_log' => true,
                    'added_by' => Auth::id(),
                ],
                'sort_order' => $project->milestones()->where('phase_context', $request->role_type)->count() + 1,
            ]);

            return response()->json([
                'message' => 'Log recorded successfully',
                'data' => $milestone
            ]);
        });
    }

    /**
     * Delete a manual log.
     */
    public function deleteLog(Project $project, ProjectMilestone $milestone)
    {
        $this->authorize('update', $project);

        if ($milestone->project_id !== $project->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $milestone->delete();
        return response()->json(['message' => 'Log removed']);
    }

    /**
     * Authorize a specialist hiring request (Addendum).
     */
    public function authorizeSpecialist(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $request->validate([
            'role_type' => 'required|in:structural,mep',
            'addendum_id' => 'required|integer|exists:project_addendums,id'
        ]);

        $addendum = \App\Models\ProjectAddendum::where('id', $request->addendum_id)
            ->where('project_id', $project->id)
            ->firstOrFail();

        return DB::transaction(function () use ($addendum, $project, $request) {
            $addendum->update([
                'status' => 'authorized'
            ]);

            // If it's a platform-hired specialist, we should ensure the bid is also updated
            if ($addendum->specialist_type === 'platform_hired' && $addendum->recommended_bid_id) {
                $bidModel = $request->role_type === 'structural' ? \App\Models\BidStructural::class : \App\Models\BidMep::class;
                $bid = $bidModel::find($addendum->recommended_bid_id);
                if ($bid) {
                    $bid->update(['status' => 'awaiting_payment']);
                }
            }

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'specialist_authorized',
                'details' => "Authorized hiring of " . ucfirst($request->role_type) . " specialist: {$addendum->title}",
            ]);

            return response()->json(['message' => 'Specialist hiring authorized. Awaiting payment.']);
        });
    }

    /**
     * Reject a specialist hiring request.
     */
    public function rejectSpecialist(Request $request, Project $project)
    {
        $this->authorize('update', $project);

        $request->validate([
            'role_type' => 'required|in:structural,mep',
            'addendum_id' => 'required|integer|exists:project_addendums,id',
            'reason' => 'nullable|string'
        ]);

        $addendum = \App\Models\ProjectAddendum::where('id', $request->addendum_id)
            ->where('project_id', $project->id)
            ->firstOrFail();

        return DB::transaction(function () use ($addendum, $project, $request) {
            $addendum->update([
                'status' => 'rejected',
                'negotiation_note' => $request->reason
            ]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'specialist_rejected',
                'details' => "Rejected hiring of " . ucfirst($request->role_type) . " specialist. Reason: " . ($request->reason ?? 'No reason provided'),
            ]);

            return response()->json(['message' => 'Specialist hiring rejected.']);
        });
    }

    /**
     * Verify an engineering request from an architect.
     */
    public function verifyEngineeringRequest(Request $request, Project $project, \App\Models\ProjectAddendum $addendum)
    {
        $this->authorize('update', $project);
        
        $request->validate(['status' => 'required|in:approved,rejected']);

        return DB::transaction(function () use ($request, $project, $addendum) {
            $status = $request->status === 'approved' ? 'authorized' : 'rejected';
            $addendum->update(['status' => $status]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'engineering_request_verified',
                'details' => "PM " . $request->status . " engineering request for: " . ($addendum->role_type ?? $addendum->specialist_type),
            ]);

            return response()->json(['message' => "Request " . $request->status]);
        });
    }

    /**
     * Owner approves the hiring of a specialist recommended by PM/Architect.
     */
    public function approveEngineeringHire(Project $project, \App\Models\ProjectAddendum $addendum)
    {
        $this->authorize('update', $project);

        return DB::transaction(function () use ($project, $addendum) {
            $addendum->update(['status' => 'authorized']); // Assuming authorized means ready for payment or approved

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'engineering_hire_approved',
                'details' => "Owner approved hiring for " . ($addendum->role_type ?? $addendum->specialist_type),
            ]);

            return response()->json(['message' => 'Hiring approved. Awaiting payment.']);
        });
    }

    /**
     * Owner rejects the hiring of a specialist.
     */
    public function rejectEngineeringHire(Project $project, \App\Models\ProjectAddendum $addendum)
    {
        $this->authorize('update', $project);

        return DB::transaction(function () use ($project, $addendum) {
            $addendum->update(['status' => 'rejected']);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'engineering_hire_rejected',
                'details' => "Owner rejected hiring for " . ($addendum->role_type ?? $addendum->specialist_type),
            ]);

            return response()->json(['message' => 'Hiring rejected.']);
        });
    }

    /**
     * Approve the final engineering integration.
     */
    public function approveEngineeringIntegration(Request $request, Project $project)
    {
        $this->authorize('update', $project);
        $request->validate(['role_type' => 'required|in:structural,mep']);

        return DB::transaction(function () use ($request, $project) {
            if ($request->role_type === 'structural') {
                $project->update(['structural_approved_at' => now()]);
            } else {
                $project->update(['mep_approved_at' => now()]);
            }

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'engineering_integrated',
                'details' => "Formally approved " . ucfirst($request->role_type) . " integration.",
            ]);

            return response()->json(['message' => 'Integration approved.']);
        });
    }
}
