<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectComment;
use App\Models\ProjectDocument;
use App\Models\ProjectActivityLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ProjectFeatureController extends Controller
{
    // --- MILESTONES ---
    public function getMilestones(Project $project)
    {
        return response()->json(['data' => $project->milestones]);
    }

    public function storeMilestone(Request $request, Project $project)
    {
        $request->validate(['title' => 'required|string|max:255']);
        $milestone = $project->milestones()->create([
            'title' => $request->title,
            'is_completed' => false
        ]);
        $this->logActivity($project, 'milestone_added', "Added milestone: {$request->title}");
        return response()->json(['data' => $milestone]);
    }

    public function updateMilestone(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $request->validate(['is_completed' => 'required|boolean']);
        $milestone->update(['is_completed' => $request->is_completed]);
        $status = $request->is_completed ? 'completed' : 'reopened';
        $this->logActivity($project, "milestone_{$status}", "Milestone {$status}: {$milestone->title}");
        return response()->json(['data' => $milestone]);
    }

    public function deleteMilestone(Project $project, ProjectMilestone $milestone)
    {
        $title = $milestone->title;
        $milestone->delete();
        $this->logActivity($project, 'milestone_deleted', "Removed milestone: {$title}");
        return response()->json(['message' => 'Deleted']);
    }

    // --- COMMENTS ---
    public function getComments(Project $project)
    {
        return response()->json(['data' => $project->comments()->with('user')->get()]);
    }

    public function storeComment(Request $request, Project $project)
    {
        $request->validate(['message' => 'required|string|max:1000']);
        $comment = $project->comments()->create([
            'user_id' => Auth::id(),
            'message' => $request->message
        ]);
        $comment->load('user');
        $this->logActivity($project, 'comment_posted', "Posted a comment");
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
}

