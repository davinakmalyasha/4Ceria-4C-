<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Models\ProjectSnagItem;
use App\Services\BASTService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Traits\HandlesProjectAuthorization;

class ProjectHandoverController extends Controller
{
    use HandlesProjectAuthorization;

    protected $lifecycleService;

    public function __construct(\App\Services\ProjectLifecycleService $lifecycleService)
    {
        $this->lifecycleService = $lifecycleService;
    }

    public function getBASTData(Project $project, BASTService $bastService)
    {
        $user = Auth::user();
        if (!$user || !$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json([
            'data' => $bastService->compileData($project)
        ]);
    }

    public function getSnagItems(Project $project)
    {
        $user = Auth::user();
        if (!$user || !$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $items = $project->snagItems()->with('reporter:id,name')->get();
        return response()->json(['data' => $items]);
    }

    public function storeSnagItem(Request $request, Project $project)
    {
        $user = Auth::user();
        if ($user->id !== $project->user_id && $user->id !== $project->pm_id) {
            return response()->json(['message' => 'Only the Owner or PM can report defects.'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'location' => 'nullable|string|max:255',
            'severity' => 'required|in:minor,major,critical',
            'assigned_role' => 'nullable|string|in:kontraktor,interior',
            'photos' => 'nullable|array|max:5',
            'photos.*' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        DB::beginTransaction();
        try {
            $photoPaths = [];
            if ($request->hasFile('photos')) {
                foreach ($request->file('photos') as $photo) {
                    $photoPaths[] = $photo->store("projects/{$project->id}/snags", 'public');
                }
            }

            $snag = $project->snagItems()->create([
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'location' => $validated['location'] ?? null,
                'severity' => $validated['severity'],
                'assigned_role' => $validated['assigned_role'] ?? null,
                'reported_by' => $user->id,
                'photos' => $photoPaths,
            ]);

            DB::commit();
            return response()->json(['message' => 'Defect reported.', 'data' => $snag], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to report defect.'], 500);
        }
    }

    public function updateSnagItemStatus(Request $request, Project $project, ProjectSnagItem $snagItem)
    {
        $user = Auth::user();

        // Binding check: the snag item must belong to THIS project.
        if ((int) $snagItem->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // Only the assigned contractor (or interior designer for interior snags)
        // may progress/resolve their own defects — never an unrelated user.
        $isAssignedContractor = $user->role_type === 'kontraktor'
            && (int) $project->selected_kontraktor_id === (int) optional($user->kontraktor)->id
            && in_array($snagItem->assigned_role, ['kontraktor', null]);
        $isAssignedInterior = $user->role_type === 'interior'
            && (int) $project->selected_interior_id === (int) optional($user->interior_profile)->id
            && $snagItem->assigned_role === 'interior';

        if (!$isAssignedContractor && !$isAssignedInterior) {
            return response()->json(['message' => 'Only the assigned professional can update this defect.'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:in_progress,resolved',
            'resolution_note' => 'nullable|string|max:2000',
            'resolution_photos' => 'nullable|array|max:3',
            'resolution_photos.*' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        DB::beginTransaction();
        try {
            $updates = ['status' => $validated['status']];
            if ($validated['status'] === 'resolved') {
                $updates['resolved_at'] = now();
                $updates['resolution_note'] = $validated['resolution_note'] ?? null;
                
                if ($request->hasFile('resolution_photos')) {
                    $photoPaths = [];
                    foreach ($request->file('resolution_photos') as $photo) {
                        $photoPaths[] = $photo->store("projects/{$project->id}/snags/resolutions", 'public');
                    }
                    $updates['resolution_photos'] = $photoPaths;
                }
            }
            $snagItem->update($updates);
            DB::commit();
            return response()->json(['message' => 'Snag item updated.', 'data' => $snagItem->fresh()]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Update failed.'], 500);
        }
    }

    public function acceptSnagResolution(Project $project, ProjectSnagItem $snagItem)
    {
        $user = Auth::user();

        // Binding check: the snag item must belong to THIS project.
        if ((int) $snagItem->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($user->id !== $project->user_id && $user->id !== $project->pm_id) {
            return response()->json(['message' => 'Only the Owner or PM can accept resolutions.'], 403);
        }

        // State guard: only RESOLVED work may be accepted — otherwise the
        // finalization QA gate could be bypassed by accepting open defects.
        if ($snagItem->status !== 'resolved') {
            return response()->json(['message' => 'Only resolved defect items can be accepted.'], 422);
        }

        $snagItem->update(['status' => 'accepted']);
        return response()->json(['message' => 'Resolution accepted.']);
    }



    public function approveHandover(Request $request, Project $project)
    {
        $user = Auth::user();
        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the assigned PM can approve handovers.'], 403);
        }

        $phase = $request->input('phase'); // design, build, interior
        
        $success = $this->lifecycleService->verifyPhase($project, $phase);

        if (!$success) {
            return response()->json(['message' => 'Phase verification failed.'], 422);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function requestHandoverRevision(Request $request, Project $project)
    {
        $user = Auth::user();
        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
             return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'phase' => 'required|string|in:design,build,interior,legal',
            'notes' => 'required|string|max:1000'
        ]);

        $phase = $request->phase;
        $column = "{$phase}_handover_submitted_at";
        $notesColumn = "{$phase}_handover_notes";

        $project->update([
            $column => null,
            $notesColumn => $request->notes
        ]);

        $this->logActivity($project, "{$phase}_handover_revision", "PM requested revisions for {$phase} handover: {$request->notes}");

        return new ProjectResource($this->loadFullProject($project));
    }

    public function initiateWalkthrough(Project $project)
    {
        $user = Auth::user();
        if ($user->role_type !== 'project_manager' || !$this->isHiredProfessional($project, $user)) {
            return response()->json(['message' => 'Only the assigned PM can initiate the final walkthrough.'], 403);
        }

        $project->update([
            'status' => 'completed_build',
            'walkthrough_status' => 'pending'
        ]);

        $this->logActivity($project, 'walkthrough_initiated', "PM initiated the final project walkthrough.");

        return response()->json(['message' => 'Final walkthrough initiated.']);
    }

    public function ownerAcceptProject(Request $request, Project $project)
    {
        $user = Auth::user();
        if (!$this->isProjectOwner($project, $user)) {
            return response()->json(['message' => 'Only the project Owner can accept the building.'], 403);
        }

        $request->validate([
            'rating' => 'nullable|integer|min:1|max:5',
            'review' => 'nullable|string|max:1000',
        ]);

        return DB::transaction(function () use ($project, $user, $request) {
            // Unresolved snag checking logic remains the same
            $unresolvedSnags = $project->snagItems()->where('status', '!=', 'accepted')->count();
            if ($unresolvedSnags > 0) {
                return response()->json(['message' => 'Cannot accept project with unaccepted snag items.'], 422);
            }

            // Use ProjectLifecycleService for the transition
            $success = $this->lifecycleService->finalizeProject($project);

            if (!$success) {
                return response()->json(['message' => 'Failed to finalize project. Check SLF and Phase requirements.'], 500);
            }

            if ($request->rating) {
                $project->ratings()->create([
                    'user_id' => $user->id,
                    'rating' => $request->rating,
                    'review' => $request->review,
                ]);
            }

            $project->load(['ratings', 'user', 'projectManager.user']);
            return new ProjectResource($project);
        });
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
}
