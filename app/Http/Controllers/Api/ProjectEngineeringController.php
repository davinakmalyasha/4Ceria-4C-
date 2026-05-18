<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectMilestone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Traits\HandlesProjectAuthorization;

class ProjectEngineeringController extends Controller
{
    use HandlesProjectAuthorization;
    /**
     * Request an engineering or specialist role (structural, mep, or interior).
     */
    public function requestEngineeringRole(Request $request, Project $project)
    {
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'role_type' => 'required|in:structural,mep,interior',
            'description' => 'required|string',
            'suggested_fee' => 'nullable|numeric|min:0',
            'assigned_user_id' => 'nullable|integer|exists:users,id',
            'team_member_id' => 'nullable|integer|exists:team_members,id'
        ]);

        return DB::transaction(function () use ($request, $project) {
            $roleType = $request->role_type;
            
            // Create a pending approval Addendum for this role request
            $addendum = \App\Models\ProjectAddendum::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'role_type' => $roleType,
                'type' => 'specialist_request',
                'title' => 'Request Specialist: ' . ucfirst($roleType),
                'description' => $request->description,
                'amount' => $request->suggested_fee ?? 0,
                'status' => 'pending_approval',
                'assigned_user_id' => $request->assigned_user_id,
                'team_member_id' => $request->team_member_id
            ]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'specialist_requested',
                'details' => "Architect requested specialist coordination for: " . ucfirst($roleType) . ". Description: " . $request->description,
            ]);

            return response()->json([
                'message' => 'Specialist coordination request submitted successfully.',
                'data' => $addendum
            ]);
        });
    }
    /**
     * Store a manual technical log for a specific role (structural/mep).
     */
    public function storeLog(Request $request, Project $project)
    {
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

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
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

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
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'role_type' => 'required|in:structural,mep,interior',
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
                $bidModel = match ($request->role_type) {
                    'structural' => \App\Models\BidStructural::class,
                    'mep' => \App\Models\BidMep::class,
                    'interior' => \App\Models\BidInterior::class,
                };
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
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'role_type' => 'required|in:structural,mep,interior',
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
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        
        $request->validate(['status' => 'required|in:approved,rejected']);

        return DB::transaction(function () use ($request, $project, $addendum) {
            $status = 'rejected';
            if ($request->status === 'approved') {
                if ($addendum->assigned_user_id || $addendum->team_member_id) {
                    $status = 'approved_unpaid'; // Direct team hire: awaiting client payment
                } else {
                    $status = 'authorized'; // Open bidding: unlocked for platform experts
                }
            }
            $addendum->update(['status' => $status]);

            // Update project requirement flag when approved
            if ($request->status === 'approved') {
                $role = $addendum->role_type;
                if ($role === 'structural') {
                    $project->update(['requires_structural' => true]);
                } elseif ($role === 'mep') {
                    $project->update(['requires_mep' => true]);
                } elseif ($role === 'interior') {
                    $project->update(['requires_interior' => true]);
                }
            }

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'engineering_request_verified',
                'details' => "PM " . $request->status . " specialist request for: " . ucfirst($addendum->role_type ?? $addendum->specialist_type),
            ]);

            return response()->json(['message' => "Request " . $request->status]);
        });
    }

    /**
     * Owner approves the hiring of a specialist recommended by PM/Architect.
     */
    public function approveEngineeringHire(Project $project, \App\Models\ProjectAddendum $addendum)
    {
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

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
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

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
        if (!$this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        $request->validate(['role_type' => 'required|in:structural,mep,interior']);

        return DB::transaction(function () use ($request, $project) {
            if ($request->role_type === 'structural') {
                $project->update(['structural_approved_at' => now()]);
            } elseif ($request->role_type === 'mep') {
                $project->update(['mep_approved_at' => now()]);
            } elseif ($request->role_type === 'interior') {
                $project->update(['interior_completed_at' => now()]);
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
