<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\Notification;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProjectCommentController extends Controller
{
    public function index(Project $project)
    {
        return response()->json(['data' => $project->comments()->with(['user', 'parent.user'])->get()]);
    }

    public function store(Request $request, Project $project)
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

        $this->notifyParticipants($project, $comment);
        $this->logActivity($project, 'comment_posted', 'Posted a comment');

        return response()->json(['data' => $comment->load(['user', 'parent.user'])]);
    }

    public function update(Request $request, Project $project, ProjectComment $comment)
    {
        if ($comment->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate(['message' => 'required|string|max:1000']);
        $comment->update(['message' => $request->message]);

        return response()->json(['data' => $comment]);
    }

    public function destroy(Project $project, ProjectComment $comment)
    {
        if ($comment->user_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $comment->delete();
        return response()->json(['message' => 'Comment deleted']);
    }

    private function notifyParticipants(Project $project, ProjectComment $comment)
    {
        $targetUserId = null;
        if ($comment->parent_id && $comment->parent) {
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
