<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectComment;
use App\Models\ProjectDocument;
use App\Models\ProjectActivityLog;
use App\Models\Notification;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ProjectFeatureController extends Controller
{
    // --- MILESTONES ---
    public function getMilestones(Project $project)
    {
        $milestones = $project->milestones()->with(['arsitek.user', 'kontraktor.user'])->get();
        return response()->json(['data' => $milestones]);
    }

    public function storeMilestone(Request $request, Project $project)
    {
        $user = Auth::user();
        $request->validate([
            'title' => 'required|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string'
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
            'is_completed' => false
        ];

        // Assign professional ownership strictly based on role
        if ($user->role_type === 'arsitek' && $user->arsitek) {
            $data['arsitek_id'] = $user->arsitek->id;
        } elseif ($user->role_type === 'kontraktor' && $user->kontraktor) {
            $data['kontraktor_id'] = $user->kontraktor->id;
        } else {
            return response()->json(['message' => 'Unauthorized professional role.'], 403);
        }

        $milestone = $project->milestones()->create($data);
        
        $roleName = $user->role_type === 'arsitek' ? 'Architect' : ($user->role_type === 'kontraktor' ? 'Contractor' : 'Owner');
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

        $request->validate([
            'is_completed' => 'nullable|boolean',
            'title' => 'nullable|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string'
        ]);

        $milestone->update($request->only(['is_completed', 'title', 'start_date', 'due_date', 'description']));
        
        if ($request->has('is_completed')) {
            $status = $request->is_completed ? 'completed' : 'reopened';
            $this->logActivity($project, "milestone_{$status}", "Milestone {$status}: {$milestone->title}");
        }
        
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
            'parent_id' => 'nullable|exists:project_comments,id'
        ]);
        $comment = $project->comments()->create([
            'user_id' => Auth::id(),
            'message' => $request->message,
            'parent_id' => $request->parent_id
        ]);
        $comment->load(['user', 'parent.user']);
        $this->logActivity($project, 'comment_posted', "Posted a comment");

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
                'body' => Auth::user()->name . ' posted a message on project "' . $project->title . '".',
                'data' => ['project_id' => $project->id]
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
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,png|max:10240'
        ]);

        $file = $request->file('file');
        $path = $file->store('project_documents', 'public');

        $document = $project->documents()->create([
            'uploader_id' => Auth::id(),
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $path,
            'file_type' => $file->extension(),
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
        $request->validate([
            'name' => 'required|string|max:255',
            'quantity_required' => 'required|numeric|min:0',
            'unit' => 'required|string|max:50',
            'notes' => 'nullable|string'
        ]);

        $requirement = $project->requirements()->create([
            'name' => $request->name,
            'quantity_required' => $request->quantity_required,
            'unit' => $request->unit,
            'notes' => $request->notes,
            'quantity_on_site' => 0,
            'quantity_used' => 0
        ]);

        $this->logActivity($project, 'requirement_added', "Added material requirement: {$request->name} ({$request->quantity_required} {$request->unit})");
        return response()->json(['data' => $requirement]);
    }

    public function updateRequirement(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $request->validate([
            'name' => 'nullable|string|max:255',
            'quantity_required' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
            'notes' => 'nullable|string'
        ]);

        $requirement->update($request->only(['name', 'quantity_required', 'unit', 'notes']));
        return response()->json(['data' => $requirement]);
    }

    public function deleteRequirement(Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $name = $requirement->name;
        $requirement->delete();
        $this->logActivity($project, 'requirement_deleted', "Removed material requirement: {$name}");
        return response()->json(['message' => 'Deleted']);
    }

    public function logRequirementUsage(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $request->validate([
            'quantity' => 'required|numeric|min:0.01'
        ]);

        if ($requirement->quantity_on_site < $request->quantity) {
            return response()->json(['message' => 'Insufficient stock on site.'], 422);
        }

        $requirement->increment('quantity_used', $request->quantity);
        $requirement->decrement('quantity_on_site', $request->quantity);

        $this->logActivity($project, 'material_used', "Used {$request->quantity} {$requirement->unit} of {$requirement->name}");
        return response()->json(['data' => $requirement]);
    }
}

