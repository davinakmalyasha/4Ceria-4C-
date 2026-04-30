<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectDocument;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectMilestoneController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $query = $project->milestones()->with(['arsitek.user', 'kontraktor.user', 'notaris.user', 'interior.user', 'pm.user', 'linkedTermin']);
        if ($request->has('phase_context')) {
            $query->where('phase_context', $request->phase_context);
        }
        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        
        if ($user->role_type === 'user' && !$isOwner) {
            return response()->json(['message' => 'Only hired professionals or the Project Owner can add milestones.'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string',
            'type' => 'nullable|string|max:100',
            'sort_order' => 'nullable|integer|min:0',
            'phase_context' => 'nullable|string',
            'content' => 'nullable|string', // JSON string from frontend
            'target_notaris_id' => 'nullable|exists:notaris_profiles,id',
            'target_arsitek_id' => 'nullable|exists:arsiteks,id',
            'target_kontraktor_id' => 'nullable|exists:kontraktors,id',
            'target_interior_id' => 'nullable|exists:interior_profiles,id',
        ]);

        $content = $request->has('content') ? json_decode($request->content, true) : [];
        
        // Handle file uploads
        if ($request->hasFile('gallery')) {
            $gallery = $content['gallery'] ?? [];
            foreach ($request->file('gallery') as $file) {
                $gallery[] = $file->store('milestone_files', 'public');
            }
            $content['gallery'] = $gallery;
        }

        $data = [
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'start_date' => $validated['start_date'] ?? null,
            'due_date' => $validated['due_date'] ?? null,
            'type' => $validated['type'] ?? null,
            'sort_order' => $validated['sort_order'] ?? 0,
            'phase_context' => $validated['phase_context'] ?? null,
            'content' => $content,
            'is_completed' => false,
            'approval_status' => 'pending',
        ];

        // Role-based ownership or targeted ownership
        if ($request->target_notaris_id) $data['notaris_id'] = $request->target_notaris_id;
        elseif ($request->target_arsitek_id) $data['arsitek_id'] = $request->target_arsitek_id;
        elseif ($request->target_kontraktor_id) $data['kontraktor_id'] = $request->target_kontraktor_id;
        elseif ($request->target_interior_id) $data['interior_id'] = $request->target_interior_id;
        else {
            if ($user->role_type === 'arsitek') $data['arsitek_id'] = $user->arsitek->id;
            elseif ($user->role_type === 'kontraktor') $data['kontraktor_id'] = $user->kontraktor->id;
            elseif ($user->role_type === 'project_manager') $data['pm_id'] = $user->project_manager->id;
            elseif ($user->role_type === 'notaris') $data['notaris_id'] = $user->notaris_profile->id;
            elseif ($user->role_type === 'interior') $data['interior_id'] = $user->interior_profile->id;
        }

        $milestone = $project->milestones()->create($data);
        $this->logActivity($project, 'milestone_added', "Added: {$validated['title']}");

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user', 'notaris.user', 'interior.user'])]);
    }

    public function update(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();
        if (!$this->canModifyMilestone($project, $milestone, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'is_completed' => 'nullable|boolean',
            'approval_status' => 'nullable|string|in:in_progress,pending,approved,revision',
            'revision_notes' => 'nullable|string',
            'content' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($milestone, $validated, $project, $request) {
            $updateData = $validated;
            
            // Re-decode existing content or use new one
            $content = $request->has('content') ? json_decode($request->content, true) : $milestone->content;
            if (!is_array($content)) $content = [];

            // Handle file uploads (append to gallery)
            if ($request->hasFile('gallery')) {
                $gallery = $content['gallery'] ?? [];
                foreach ($request->file('gallery') as $file) {
                    $gallery[] = $file->store('milestone_files', 'public');
                }
                $content['gallery'] = $gallery;
            }
            
            $updateData['content'] = $content;
            
            if (isset($validated['approval_status']) && $validated['approval_status'] === 'approved') {
                $updateData['pm_verified_at'] = now();
                $updateData['is_completed'] = true;
                $this->unlockLinkedTermin($milestone);
                $this->logActivity($project, 'milestone_approved', "Approved: {$milestone->title}");
            }

            $milestone->update($updateData);

            return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user', 'notaris.user', 'interior.user'])]);
        });
    }

    public function approve(Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();
        $isPM = ($user->role_type === 'project_manager' && $project->pm_id === $user->id);
        $isOwner = ($project->user_id === $user->id);

        if (!$isPM && !$isOwner) return response()->json(['message' => 'Unauthorized'], 403);

        return DB::transaction(function () use ($milestone, $project, $isPM) {
            $milestone->update([
                'is_completed' => true,
                'approval_status' => 'approved',
                'pm_verified_at' => $isPM ? now() : $milestone->pm_verified_at,
            ]);
            $this->unlockLinkedTermin($milestone);
            $this->logActivity($project, 'milestone_approved', "Approved: {$milestone->title}");
            return response()->json(['data' => $milestone]);
        });
    }

    private function unlockLinkedTermin(ProjectMilestone $milestone)
    {
        ProjectPaymentTermin::where('milestone_id', $milestone->id)
            ->where('status', 'locked')
            ->update(['status' => 'pending']);
    }

    private function canModifyMilestone(Project $project, ProjectMilestone $milestone, $user)
    {
        if ($project->user_id === $user->id) return true; // Owner can upload/modify
        if ($user->role_type === 'project_manager' && $project->pm_id === $user->id) return true;
        if ($milestone->arsitek_id === $user->arsitek?->id) return true;
        if ($milestone->kontraktor_id === $user->kontraktor?->id) return true;
        if ($milestone->notaris_id === $user->notaris_profile?->id) return true;
        if ($milestone->interior_id === $user->interior_profile?->id) return true;
        if ($milestone->pm_id === $user->project_manager?->id) return true;
        return false;
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
