<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ArsitekRating;
use App\Models\KontraktorRating;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Traits\HandlesProjectAuthorization;

class ProjectActivityController extends Controller
{
    use HandlesProjectAuthorization;

    public function rateProject(Request $request, Project $project)
    {
        $user = Auth::user();

        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Only the project owner can leave a rating.'], 403);
        }

        if ($project->status !== 'completed') {
            return response()->json(['message' => 'Project must be completed before rating.'], 422);
        }

        $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'komentar' => 'nullable|string|max:1000',
            'target_type' => 'required|in:arsitek,kontraktor',
        ]);

        if ($request->target_type === 'arsitek' && $project->selected_arsitek_id) {
            $existing = ArsitekRating::where('project_id', $project->id)
                ->where('user_id', $user->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already rated the architect for this project.'], 422);
            }

            ArsitekRating::create([
                'user_id' => $user->id,
                'arsitek_id' => $project->selected_arsitek_id,
                'project_id' => $project->id,
                'rating' => $request->rating,
                'komentar' => $request->komentar ?? '',
            ]);
            $this->logActivity($project, 'rating_given', "Rated architect {$request->rating}/5 stars");
        } elseif ($request->target_type === 'kontraktor' && $project->selected_kontraktor_id) {
            $existing = KontraktorRating::where('project_id', $project->id)
                ->where('user_id', $user->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already rated the contractor for this project.'], 422);
            }

            KontraktorRating::create([
                'user_id' => $user->id,
                'kontraktor_id' => $project->selected_kontraktor_id,
                'project_id' => $project->id,
                'rating' => $request->rating,
                'komentar' => $request->komentar ?? '',
            ]);
            $this->logActivity($project, 'rating_given', "Rated contractor {$request->rating}/5 stars");
        } else {
            return response()->json(['message' => 'No professional assigned for this type.'], 422);
        }

        return response()->json(['message' => 'Rating submitted successfully!']);
    }

    public function getActivity(Project $project)
    {
        $logs = $project->activityLogs()->with('user')->limit(50)->get();

        return response()->json(['data' => $logs]);
    }

    public function getPendingActions(Project $project)
    {
        $user = Auth::user();
        if ($project->user_id !== $user->id && $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $actions = [];

        // Handover/Verification Actions
        if ($project->design_handover_submitted_at && !$project->owner_design_approved_at) {
            $actions[] = ['type' => 'verification', 'phase' => 'design', 'label' => 'Verify Design Handover'];
        }
        if ($project->construction_handover_submitted_at && !$project->owner_build_approved_at) {
            $actions[] = ['type' => 'verification', 'phase' => 'construction', 'label' => 'Verify Construction Handover'];
        }
        if ($project->interior_handover_submitted_at && !$project->owner_interior_approved_at) {
            $actions[] = ['type' => 'verification', 'phase' => 'interior', 'label' => 'Verify Interior Handover'];
        }
        if ($project->legal_handover_submitted_at && !$project->owner_legal_approved_at) {
            $actions[] = ['type' => 'verification', 'phase' => 'legal', 'label' => 'Verify Legal Handover'];
        }

        // Financial Actions
        $pendingAddendums = $project->addendums()->where('status', 'pending_approval')->count();
        if ($pendingAddendums > 0) {
            $actions[] = ['type' => 'addendum', 'count' => $pendingAddendums, 'label' => "Approve {$pendingAddendums} Pending Addendums"];
        }

        // Procurement Actions
        $pendingProcurements = \App\Models\ProjectProcurementRequest::where('project_id', $project->id)
            ->where('status', 'pending')->count();
        if ($pendingProcurements > 0) {
            $actions[] = ['type' => 'procurement', 'count' => $pendingProcurements, 'label' => "Review {$pendingProcurements} Material Requests"];
        }

        return response()->json(['data' => $actions]);
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
