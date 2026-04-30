<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Http\Resources\ProjectResource;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Traits\HandlesProjectAuthorization;

class ProjectPhaseController extends Controller
{
    use HandlesProjectAuthorization;

    protected $lifecycleService;

    public function __construct(\App\Services\ProjectLifecycleService $lifecycleService)
    {
        $this->lifecycleService = $lifecycleService;
    }

    public function sealDesign(Project $project)
    {
        $user = Auth::user();

        // Security: only the assigned architect can seal the design
        if ($user->role_type !== 'arsitek' || $project->selected_arsitek_id !== optional($user->arsitek)->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired architect can seal the design.'], 403);
        }

        if ($project->requires_structural && !$project->structural_id) {
            return response()->json(['message' => 'A Structural Engineer is legally required but has not been hired yet.'], 422);
        }

        // Gate: structural must be approved if hired
        if ($project->structural_id && !$project->structural_approved_at) {
            return response()->json(['message' => 'Structural engineering integration must be approved before sealing the design.'], 422);
        }

        // Gate: MEP must be approved if hired
        if ($project->mep_id && !$project->mep_approved_at) {
            return response()->json(['message' => 'MEP engineering integration must be approved before sealing the design.'], 422);
        }

        // Check if all technical design milestones are completed (ignoring legal/contracts vault)
        $incomplete = $project->milestones()
            ->where('phase_context', '!=', 'legal')
            ->where(function($query) {
                $query->where('is_completed', false)
                      ->orWhere('approval_status', '!=', 'approved');
            })
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All technical design milestones must be completed and approved before sealing the design.'], 422);
        }

        DB::beginTransaction();
        try {
            $project->update([
                'design_handover_submitted_at' => now(),
                'design_handover_notes' => null
            ]);

            $this->logActivity($project, 'design_handover_submitted', "Architect submitted design package for PM verification.");

            // Notify PM and Owner
            $this->notifyReviewers($project, 'Design Handover', "The Architect has submitted the design package for your verification.");

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to submit design handover.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function sealConstruction(Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired contractor can seal construction.'], 403);
        }

        // Check all contractor milestones are completed
        $incomplete = $project->milestones()
            ->where('phase_context', 'construction')
            ->where(function($query) {
                $query->where('is_completed', false)
                      ->orWhere('approval_status', '!=', 'approved');
            })
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All construction milestones must be completed before sealing.'], 422);
        }

        DB::beginTransaction();
        try {
            $project->update([
                'construction_handover_submitted_at' => now(),
                'construction_handover_notes' => null
            ]);

            $this->logActivity($project, 'construction_handover_submitted', "Contractor submitted construction handover for PM verification.");

            // Notify PM and Owner
            $this->notifyReviewers($project, 'Construction Handover', "The Contractor has submitted the construction handover for your verification.");

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to submit construction handover.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function sealInterior(Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'interior' || $project->selected_interior_id !== optional($user->interior_profile)->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired interior designer can seal.'], 403);
        }

        // Check all interior milestones are completed
        $incomplete = $project->milestones()
            ->where('phase_context', 'interior')
            ->where(function($query) {
                $query->where('is_completed', false)
                      ->orWhere('approval_status', '!=', 'approved');
            })
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All interior design milestones must be completed and approved before sealing.'], 422);
        }

        DB::beginTransaction();
        try {
            $project->update([
                'interior_handover_submitted_at' => now(),
                'interior_handover_notes' => null
            ]);

            $this->logActivity($project, 'interior_handover_submitted', "Interior designer submitted handover for PM verification.");

            // Notify PM and Owner
            $this->notifyReviewers($project, 'Interior Handover', "The Interior Designer has submitted the interior handover for your verification.");

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to submit interior handover.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function verifyDesign(Project $project)
    {
        if (!$this->isProjectOwner($project, Auth::user()) && !$this->isProjectManager($project, Auth::user())) {
            return response()->json(['message' => 'Only the Project Owner or PM can verify the design phase.'], 403);
        }

        if (!$project->design_handover_submitted_at) {
            return response()->json(['message' => 'Design package has not been submitted for verification yet.'], 422);
        }

        $this->lifecycleService->verifyPhase($project, 'design');
        return new ProjectResource($this->loadFullProject($project));
    }

    public function verifyConstruction(Project $project)
    {
        if (!$this->isProjectOwner($project, Auth::user()) && !$this->isProjectManager($project, Auth::user())) {
            return response()->json(['message' => 'Only the Project Owner or PM can verify the construction phase.'], 403);
        }

        if (!$project->construction_handover_submitted_at) {
            return response()->json(['message' => 'Construction handover has not been submitted for verification yet.'], 422);
        }

        $this->lifecycleService->verifyPhase($project, 'construction');
        return new ProjectResource($this->loadFullProject($project));
    }

    public function verifyInterior(Project $project)
    {
        if (!$this->isProjectOwner($project, Auth::user()) && !$this->isProjectManager($project, Auth::user())) {
            return response()->json(['message' => 'Only the Project Owner or PM can verify the interior phase.'], 403);
        }

        if (!$project->interior_handover_submitted_at) {
            return response()->json(['message' => 'Interior handover has not been submitted for verification yet.'], 422);
        }

        $this->lifecycleService->verifyPhase($project, 'interior');
        return new ProjectResource($this->loadFullProject($project));
    }

    public function verifyLegal(Project $project)
    {
        if (!$this->isProjectOwner($project, Auth::user()) && !$this->isProjectManager($project, Auth::user())) {
            return response()->json(['message' => 'Only the Project Owner or PM can verify the legal phase.'], 403);
        }

        $this->lifecycleService->verifyPhase($project, 'legal');
        return new ProjectResource($this->loadFullProject($project));
    }

    private function isProjectManager(Project $project, $user): bool
    {
        return $user->role_type === 'project_manager' && $project->pm_id === $user->id;
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
