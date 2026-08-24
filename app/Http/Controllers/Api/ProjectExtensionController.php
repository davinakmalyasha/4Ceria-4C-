<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectTimelineExtension;
use App\Traits\HandlesProjectAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectExtensionController extends Controller
{
    use HandlesProjectAuthorization;

    public function index(Project $project)
    {
        $user = request()->user();
        if (!$user || !$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json([
            'data' => $project->timelineExtensions()->with('requester')->get()
        ]);
    }

    public function store(Request $request, Project $project)
    {
        $user = $request->user();
        if (!$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized. Only project participants can request extensions.'], 403);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:255',
            'description' => 'nullable|string',
            'days_requested' => 'required|integer|min:1',
        ]);

        $extension = $project->timelineExtensions()->create([
            'requester_id' => $user->id,
            'reason' => $validated['reason'],
            'description' => $validated['description'],
            'days_requested' => $validated['days_requested'],
            'original_deadline' => $project->deadline,
            'status' => 'proposed',
        ]);

        return response()->json(['message' => 'Extension requested', 'data' => $extension]);
    }

    public function pmReview(Request $request, Project $project, ProjectTimelineExtension $extension)
    {
        $user = $request->user();

        // Binding check: the extension must belong to THIS project.
        if ((int) $extension->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // Only the assigned PM may review (projects.pm_id stores the PM's USER id).
        if (!$user || (int) $project->pm_id !== (int) $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the assigned Project Manager can review extensions.'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:pm_reviewed,rejected',
            'pm_notes' => 'nullable|string',
        ]);

        $extension->update([
            'status' => $validated['status'],
            'pm_notes' => $validated['pm_notes'],
        ]);

        return response()->json(['message' => 'Review submitted', 'data' => $extension]);
    }

    public function ownerDecide(Request $request, Project $project, ProjectTimelineExtension $extension)
    {
        $user = $request->user();

        // Binding check: the extension must belong to THIS project.
        if ((int) $extension->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // Only the project owner may decide on extensions to their deadline.
        if (!$user || !$this->isProjectOwner($project, $user)) {
            return response()->json(['message' => 'Unauthorized. Only the project owner can approve or reject extensions.'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'owner_notes' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $extension->update([
                'status' => $validated['status'],
                'owner_notes' => $validated['owner_notes'],
                'new_deadline_date' => $validated['status'] === 'approved'
                    ? \Carbon\Carbon::parse($project->deadline ?? now())->addDays($extension->days_requested)
                    : null
            ]);

            if ($validated['status'] === 'approved') {
                $project->update([
                    'deadline' => $extension->new_deadline_date
                ]);
            }

            DB::commit();
            return response()->json(['message' => 'Decision recorded', 'data' => $extension]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to process decision'], 500);
        }
    }
}
