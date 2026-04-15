<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectComment;
use App\Models\ProjectDocument;
use App\Models\ProjectMilestone;
use App\Models\ProjectDailyLog;
use App\Models\ProjectPaymentTermin;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ProjectFeatureController extends Controller
{
    // --- MILESTONES ---
    public function getMilestones(Request $request, Project $project)
    {
        $query = $project->milestones()->with(['arsitek.user', 'kontraktor.user', 'pm.user']);

        // Filter by phase_context if provided (e.g. ?phase_context=interior)
        if ($request->has('phase_context')) {
            $query->where('phase_context', $request->phase_context);
        }

        $milestones = $query->get();

        return response()->json(['data' => $milestones]);
    }

    public function storeMilestone(Request $request, Project $project)
    {
        $user = Auth::user();
        $request->validate([
            'title' => 'required|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
            'type' => 'nullable|string|in:generic,schematic,development,construction',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        // Block owners from adding milestones
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Only hired professionals can add milestones.'], 403);
        }

        $data = [
            'title' => $request->title,
            'start_date' => $request->start_date,
            'due_date' => $request->due_date,
            'description' => $request->description,
            'type' => $request->type ?? 'generic',
            'content' => is_string($request->content) ? json_decode($request->content, true) : $request->content,
            'sort_order' => $request->sort_order ?? 0,
            'is_completed' => false,
            'approval_status' => 'in_progress',
            'phase_context' => $request->phase_context ?? 'build',
        ];

        // Handle image upload
        $content = $data['content'];
        if ($request->hasFile('gallery')) {
            $gallery = $content['gallery'] ?? [];
            foreach ($request->file('gallery') as $file) {
                if (count($gallery) >= 8) break;
                $gallery[] = $file->store('milestone_images', 'public');
            }
            $content['gallery'] = $gallery;
            $data['content'] = $content;
        }

        // Assign professional ownership strictly based on role
        if ($user->role_type === 'arsitek' && $user->arsitek) {
            $data['arsitek_id'] = $user->arsitek->id;
        } elseif ($user->role_type === 'kontraktor' && $user->kontraktor) {
            $data['kontraktor_id'] = $user->kontraktor->id;
        } elseif ($user->role_type === 'notaris') {
            $data['notaris_id'] = $user->id;
        } elseif ($user->role_type === 'project_manager' && $user->project_manager) {
            $data['pm_id'] = $user->project_manager->id;
        } elseif ($user->role_type === 'interior') {
            $data['interior_id'] = $user->id;
        } else {
            return response()->json(['message' => 'Unauthorized professional role.'], 403);
        }

        $milestone = $project->milestones()->create($data);

        $roleName = ucfirst($user->role_type);
        $this->logActivity($project, 'milestone_added', "{$roleName} added milestone: {$request->title}");

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
    }

    public function updateMilestone(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        // Block owners from updating milestones
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Owners cannot modify milestones. This is managed by professionals.'], 403);
        }

        // Security: Professional can only edit their own milestones
        if ($user->role_type === 'arsitek' && ($milestone->arsitek_id !== $user->arsitek?->id)) {
            return response()->json(['message' => 'Unauthorized. You can only edit architectural milestones.'], 403);
        }
        if ($user->role_type === 'kontraktor' && ($milestone->kontraktor_id !== $user->kontraktor?->id)) {
            return response()->json(['message' => 'Unauthorized. You can only edit contractor milestones.'], 403);
        }
        if ($user->role_type === 'notaris' && $milestone->notaris_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. You can only edit your own legal milestones.'], 403);
        }
        if ($user->role_type === 'interior' && $milestone->interior_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. You can only edit your own interior milestones.'], 403);
        }
        if ($user->role_type === 'project_manager' && $milestone->pm_id !== $user->project_manager?->id) {
            return response()->json(['message' => 'Unauthorized. You can only edit your own management milestones.'], 403);
        }

        $request->validate([
            'is_completed' => 'nullable|boolean',
            'title' => 'nullable|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
            'type' => 'nullable|string|in:generic,schematic,development,construction',
            'sort_order' => 'nullable|integer|min:0',
            'approval_status' => 'nullable|string|in:in_progress,pending,approved,revision',
            'gallery' => 'nullable|array|max:8',
            'gallery.*' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $updateData = $request->only(['is_completed', 'title', 'start_date', 'due_date', 'description', 'sort_order', 'type', 'approval_status']);

        if ($request->has('content')) {
            $updateData['content'] = is_string($request->content) ? json_decode($request->content, true) : $request->content;
        }

        // Handle image upload on update
        $currentContent = $updateData['content'] ?? $milestone->content ?? [];
        
        // Handle retaining existing gallery items
        if ($request->has('retained_gallery')) {
            $retained = json_decode($request->retained_gallery, true) ?? [];
            $existingGallery = $currentContent['gallery'] ?? [];
            $toDelete = array_diff($existingGallery, $retained);
            foreach ($toDelete as $path) {
                if ($path) \Illuminate\Support\Facades\Storage::disk('public')->delete($path);
            }
            $currentContent['gallery'] = $retained;
            $updateData['content'] = $currentContent;
        }

        // Handle adding new gallery items
        if ($request->hasFile('gallery')) {
            $gallery = $currentContent['gallery'] ?? [];
            foreach ($request->file('gallery') as $file) {
                if (count($gallery) >= 8) break;
                $gallery[] = $file->store('milestone_images', 'public');
            }
            $currentContent['gallery'] = $gallery;
            $updateData['content'] = $currentContent;
        }

        $milestone->update($updateData);

        if ($request->has('is_completed')) {
            $status = $request->is_completed ? 'completed' : 'reopened';
            $this->logActivity($project, "milestone_{$status}", "Milestone {$status}: {$milestone->title}");
        }

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
    }

    public function approveMilestone(Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        // Only owner can approve
        if ($user->role_type !== 'user' || $project->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the owner can approve phases.'], 403);
        }

        $milestone->update([
            'is_completed' => true,
            'approval_status' => 'approved',
            'revision_notes' => null, // Clear old notes
        ]);

        $this->logActivity($project, "milestone_approved", "Milestone Approved: {$milestone->title}");

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
    }

    public function requestMilestoneRevision(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        // Only owner can request revision
        if ($user->role_type !== 'user' || $project->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the owner can request revisions.'], 403);
        }

        $request->validate([
            'revision_notes' => 'required|string',
        ]);

        $content = $milestone->content ?? [];
        if ($milestone->revision_notes) {
            $history = $content['revision_history'] ?? [];
            $history[] = [
                'note' => $milestone->revision_notes,
                'date' => now()->toIso8601String(),
                'version' => count($history) + 1
            ];
            $content['revision_history'] = $history;
        }

        $milestone->update([
            'is_completed' => false,
            'approval_status' => 'revision',
            'revision_notes' => $request->revision_notes,
            'content' => $content,
        ]);

        $this->logActivity($project, "milestone_revision", "Revision requested for: {$milestone->title}");

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
    }

    public function deleteMilestone(Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        // Block owners from deleting milestones
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Security: Professional can only delete their own milestones
        if ($user->role_type === 'arsitek' && $milestone->arsitek_id !== $user->arsitek?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'kontraktor' && $milestone->kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'notaris' && $milestone->notaris_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'interior' && $milestone->interior_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'project_manager' && $milestone->pm_id !== $user->project_manager?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $title = $milestone->title;
        $milestone->delete();
        $this->logActivity($project, 'milestone_deleted', "Removed milestone: {$title}");

        return response()->json(['message' => 'Deleted']);
    }

    // --- COMMENTS ---
    public function getComments(Project $project)
    {
        return response()->json(['data' => $project->comments()->with(['user', 'parent.user'])->get()]);
    }

    public function storeComment(Request $request, Project $project)
    {
        $request->validate([
            'message' => 'required|string|max:1000',
            'parent_id' => 'nullable|exists:project_comments,id',
        ]);
        $comment = $project->comments()->create([
            'user_id' => Auth::id(),
            'message' => $request->message,
            'parent_id' => $request->parent_id,
        ]);
        $comment->load(['user', 'parent.user']);
        $this->logActivity($project, 'comment_posted', 'Posted a comment');

        // --- Notification Logic ---
        $targetUserId = null;
        if ($request->parent_id && $comment->parent) {
            if ($comment->parent->user_id !== Auth::id()) {
                $targetUserId = $comment->parent->user_id;
            }
        } elseif ($project->user_id !== Auth::id()) {
            $targetUserId = $project->user_id;
        }

        if ($targetUserId) {
            Notification::create([
                'user_id' => $targetUserId,
                'type' => 'project_message',
                'title' => 'New Project Q&A Message',
                'body' => Auth::user()->name.' posted a message on project "'.$project->title.'".',
                'data' => ['project_id' => $project->id],
            ]);
        }

        return response()->json(['data' => $comment]);
    }

    public function updateComment(Request $request, Project $project, ProjectComment $comment)
    {
        if ($comment->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized. You can only edit your own messages.'], 403);
        }

        $request->validate(['message' => 'required|string|max:1000']);
        $comment->update(['message' => $request->message]);

        return response()->json(['data' => $comment]);
    }

    public function deleteComment(Project $project, ProjectComment $comment)
    {
        // Only author or project owner can delete
        if ($comment->user_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $comment->delete();

        return response()->json(['message' => 'Comment deleted']);
    }

    // --- DOCUMENTS ---
    public function getDocuments(Project $project)
    {
        return response()->json(['data' => $project->documents()->with('uploader')->get()]);
    }

    public function storeDocument(Request $request, Project $project)
    {
        $request->validate([
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,png|max:10240',
            'category' => 'nullable|string|max:50',
            'status' => 'nullable|string|in:uploaded,under_review,awaiting_signature,legally_binding',
        ]);

        $file = $request->file('file');
        $path = $file->store('project_documents', 'public');

        $document = $project->documents()->create([
            'uploader_id' => Auth::id(),
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $path,
            'file_type' => $file->extension(),
            'category' => $request->category ?? 'general',
            'status' => $request->status ?? 'uploaded',
        ]);

        $document->load('uploader');
        $this->logActivity($project, 'document_uploaded', "Uploaded: {$file->getClientOriginalName()}");

        return response()->json(['data' => $document]);
    }

    public function deleteDocument(Project $project, ProjectDocument $document)
    {
        if ($document->uploader_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $name = $document->file_name;
        Storage::disk('public')->delete($document->file_path);
        $document->delete();
        $this->logActivity($project, 'document_deleted', "Removed: {$name}");

        return response()->json(['message' => 'Deleted']);
    }

    // --- RATINGS ---
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
            $existing = \App\Models\ArsitekRating::where('project_id', $project->id)
                ->where('user_id', $user->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already rated the architect for this project.'], 422);
            }

            \App\Models\ArsitekRating::create([
                'user_id' => $user->id,
                'arsitek_id' => $project->selected_arsitek_id,
                'project_id' => $project->id,
                'rating' => $request->rating,
                'komentar' => $request->komentar ?? '',
            ]);
            $this->logActivity($project, 'rating_given', "Rated architect {$request->rating}/5 stars");
        } elseif ($request->target_type === 'kontraktor' && $project->selected_kontraktor_id) {
            $existing = \App\Models\KontraktorRating::where('project_id', $project->id)
                ->where('user_id', $user->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already rated the contractor for this project.'], 422);
            }

            \App\Models\KontraktorRating::create([
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

    // --- ACTIVITY LOG ---
    public function getActivity(Project $project)
    {
        $logs = $project->activityLogs()->with('user')->limit(50)->get();

        return response()->json(['data' => $logs]);
    }

    // --- HELPER ---
    private function logActivity(Project $project, string $action, string $details): void
    {
        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }

    // --- REQUIREMENTS ---
    public function getRequirements(Project $project)
    {
        return response()->json(['data' => $project->requirements]);
    }

    public function storeRequirement(Request $request, Project $project)
    {
        $user = Auth::user();
        
        // Authorization: Owner or Hired Pros only
        $isOwner = $project->user_id === $user->id;
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredMep = $user->role_type === 'mep' && $project->mep_id === $user->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isHiredArsitek && !$isHiredKontraktor && !$isHiredMep && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner or hired professionals can manage requirements.'], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'quantity_required' => 'required|numeric|min:0',
            'unit' => 'required|string|max:50',
            'quality_level' => 'nullable|string|in:standard,premium,luxury',
            'notes' => 'nullable|string',
        ]);

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('requirements', 'public');
        }

        $requirement = $project->requirements()->create([
            'name' => $request->name,
            'quantity_required' => $request->quantity_required,
            'unit' => $request->unit,
            'quality_level' => $request->quality_level ?? 'standard',
            'notes' => $request->notes,
            'image_path' => $imagePath,
            'quantity_on_site' => 0,
            'quantity_used' => 0,
        ]);

        $this->logActivity($project, 'requirement_added', "Added material requirement: {$request->name} ({$request->quantity_required} {$request->unit})");

        return response()->json(['data' => $requirement]);
    }

    public function updateRequirement(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $user = Auth::user();
        
        // Authorization: Owner or Hired Pros only
        $isOwner = $project->user_id === $user->id;
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredMep = $user->role_type === 'mep' && $project->mep_id === $user->id;

        if (!$isOwner && !$isHiredArsitek && !$isHiredKontraktor && !$isHiredMep) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'name' => 'nullable|string|max:255',
            'quantity_required' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
            'quality_level' => 'nullable|string|in:standard,premium,luxury',
            'notes' => 'nullable|string',
        ]);

        $requirement->update($request->only(['name', 'quantity_required', 'unit', 'quality_level', 'notes']));

        return response()->json(['data' => $requirement]);
    }

    public function deleteRequirement(Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $user = Auth::user();
        
        // Authorization: Owner or Hired Pros only
        $isOwner = $project->user_id === $user->id;
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredMep = $user->role_type === 'mep' && $project->mep_id === $user->id;

        if (!$isOwner && !$isHiredArsitek && !$isHiredKontraktor && !$isHiredMep) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $name = $requirement->name;
        $requirement->delete();
        $this->logActivity($project, 'requirement_deleted', "Removed material requirement: {$name}");

        return response()->json(['message' => 'Deleted']);
    }

    public function logExternalProcurement(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $user = Auth::user();
        
        // Authorization: Only the owner or the hired contractor can log external procurement
        $isOwner = $project->user_id === $user->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isHiredKontraktor && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner, hired contractor, or Project Manager can log manual supplies.'], 403);
        }

        $request->validate([
            'quantity' => 'required|numeric|min:0.01',
            'unit_cost' => 'nullable|numeric|min:0',
        ]);

        $totalCost = ($request->unit_cost ?? 0) * $request->quantity;

        $requirement->increment('quantity_procured_externally', $request->quantity);
        $requirement->increment('quantity_on_site', $request->quantity);
        $requirement->increment('external_cost', $totalCost);

        $this->logActivity($project, 'external_procurement', "Manually registered {$request->quantity} {$requirement->unit} of {$requirement->name} (Cost: Rp " . number_format($totalCost, 0, ',', '.') . ")");

        return response()->json(['data' => $requirement]);
    }

    public function logRequirementUsage(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $request->validate([
            'quantity' => 'required|numeric|min:0.01',
        ]);

        if ($requirement->quantity_on_site < $request->quantity) {
            return response()->json(['message' => 'Insufficient stock on site.'], 422);
        }

        $requirement->increment('quantity_used', $request->quantity);
        $requirement->decrement('quantity_on_site', $request->quantity);

        $this->logActivity($project, 'material_used', "Used {$request->quantity} {$requirement->unit} of {$requirement->name}");

        return response()->json(['data' => $requirement]);
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

        // Optional: Check if all milestones are completed
        $incomplete = $project->milestones()->where('is_completed', false)->exists();
        if ($incomplete) {
            return response()->json(['message' => 'All milestones must be completed and approved before sealing the design.'], 422);
        }

        $project->update([
            'design_completed_at' => now(),
            'status' => 'procurement' // Transition to procurement phase
        ]);

        $this->logActivity($project, 'design_sealed', "Architect formally sealed and handed over the design package.");

        return response()->json([
            'message' => 'Design package successfully sealed and handed over!',
            'data' => $project
        ]);
    }

    // --- DAILY SITE LOGS ---
    public function getDailyLogs(Project $project)
    {
        $logs = $project->dailyLogs()->with('user')->get();
        return response()->json(['data' => $logs]);
    }

    public function storeDailyLog(Request $request, Project $project)
    {
        $user = Auth::user();

        // Only hired contractor can add logs
        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Only the hired contractor can add daily logs.'], 403);
        }

        $request->validate([
            'log_date' => 'required|date',
            'weather' => 'required|string|in:sunny,cloudy,rainy,stormy',
            'worker_count' => 'required|integer|min:0',
            'activities' => 'required|string|max:2000',
            'issues' => 'nullable|string|max:1000',
            'photos' => 'nullable|array|max:4',
            'photos.*' => 'image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $photoPaths = [];
        if ($request->hasFile('photos')) {
            foreach ($request->file('photos') as $photo) {
                $photoPaths[] = $photo->store('daily_logs', 'public');
            }
        }

        $log = $project->dailyLogs()->create([
            'user_id' => $user->id,
            'log_date' => $request->log_date,
            'weather' => $request->weather,
            'worker_count' => $request->worker_count,
            'activities' => $request->activities,
            'issues' => $request->issues,
            'photos' => $photoPaths,
        ]);

        $this->logActivity($project, 'daily_log_added', "Daily site log for " . $request->log_date);

        return response()->json(['data' => $log->load('user')]);
    }

    public function deleteDailyLog(Project $project, ProjectDailyLog $dailyLog)
    {
        $user = Auth::user();
        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Delete photos from storage
        if ($dailyLog->photos) {
            foreach ($dailyLog->photos as $path) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($path);
            }
        }

        $dailyLog->delete();
        return response()->json(['message' => 'Log deleted']);
    }

    // --- PAYMENT TERMINS ---
    public function getPaymentTermins(Project $project)
    {
        return response()->json(['data' => $project->paymentTermins()->with('milestone')->get()]);
    }

    public function storePaymentTermin(Request $request, Project $project)
    {
        $user = Auth::user();

        // Only hired contractor can create termins
        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Only the hired contractor can manage payment termins.'], 403);
        }

        $request->validate([
            'label' => 'required|string|max:255',
            'percentage' => 'required|numeric|min:0|max:100',
            'amount' => 'required|integer|min:0',
            'trigger_description' => 'nullable|string|max:255',
            'status' => 'nullable|string|in:locked,pending,invoice_sent,paid',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
        ]);

        $termin = $project->paymentTermins()->create([
            'label' => $request->label,
            'percentage' => $request->percentage,
            'amount' => $request->amount,
            'trigger_description' => $request->trigger_description,
            'status' => $request->status ?? 'locked',
            'milestone_id' => $request->milestone_id,
            'notes' => $request->notes,
        ]);

        $this->logActivity($project, 'termin_added', "Payment termin added: {$request->label}");

        return response()->json(['data' => $termin->load('milestone')]);
    }

    public function updatePaymentTermin(Request $request, Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();
        $isContractor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isOwner = $project->user_id === $user->id;

        if (!$isContractor && !$isOwner) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'label' => 'nullable|string|max:255',
            'percentage' => 'nullable|numeric|min:0|max:100',
            'amount' => 'nullable|integer|min:0',
            'trigger_description' => 'nullable|string|max:255',
            'status' => 'nullable|string|in:locked,pending,invoice_sent,paid',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
        ]);

        $updateData = $request->only(['label', 'percentage', 'amount', 'trigger_description', 'status', 'milestone_id', 'notes']);

        // If status changes to 'paid', record the timestamp
        if (isset($updateData['status']) && $updateData['status'] === 'paid' && $termin->status !== 'paid') {
            $updateData['paid_at'] = now();
        }

        $termin->update($updateData);

        return response()->json(['data' => $termin->load('milestone')]);
    }

    public function deletePaymentTermin(Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();
        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $termin->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function sealConstruction(Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired contractor can seal construction.'], 403);
        }

        // Check all contractor milestones are completed
        $incomplete = $project->milestones()
            ->where('is_completed', false)
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All construction milestones must be completed before sealing.'], 422);
        }

        $project->update([
            'construction_completed_at' => now(),
            'status' => 'construction'
        ]);

        $this->logActivity($project, 'construction_sealed', "Contractor formally sealed the construction package.");

        return response()->json([
            'message' => 'Construction sealed and handed over!',
            'data' => $project
        ]);
    }

    public function sealInterior(Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'interior' || $project->selected_interior_id != $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired interior designer can seal.'], 403);
        }

        // Check all interior milestones are completed
        $incomplete = $project->milestones()
            ->where('phase_context', 'interior')
            ->where('is_completed', false)
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All interior design milestones must be completed and approved before sealing.'], 422);
        }

        $project->update([
            'interior_completed_at' => now(),
        ]);

        $this->logActivity($project, 'interior_sealed', "Interior designer formally sealed the interior design package.");

        return response()->json([
            'message' => 'Interior design sealed and handed over!',
            'data' => $project
        ]);
    }
}
