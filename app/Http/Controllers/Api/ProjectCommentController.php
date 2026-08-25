<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\Notification;
use App\Models\ProjectActivityLog;
use App\Traits\HandlesProjectAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProjectCommentController extends Controller
{
    use HandlesProjectAuthorization;

    public function index(Project $project)
    {
        // SECURITY: project Q&A is workspace-private; commenter emails must
        // not leak to outsiders.
        if (! $this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $comments = $project->comments()->with(['user', 'parent.user'])->get();

        return response()->json(['data' => $this->sanitize($comments)]);
    }

    public function store(Request $request, Project $project)
    {
        if (! $this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'message' => 'required|string|max:1000',
            'parent_id' => 'nullable|exists:project_comments,id',
        ]);

        // SECURITY: a reply must belong to THIS project's thread.
        if ($request->parent_id) {
            $parentInProject = $project->comments()->where('id', $request->parent_id)->exists();
            if (! $parentInProject) {
                return response()->json(['message' => 'Invalid parent comment.'], 422);
            }
        }

        $comment = $project->comments()->create([
            'user_id' => Auth::id(),
            'message' => $request->message,
            'parent_id' => $request->parent_id,
        ]);

        $this->notifyParticipants($project, $comment);
        $this->logActivity($project, 'comment_posted', 'Posted a comment');

        return response()->json(['data' => $this->sanitize(collect([$comment->load(['user', 'parent.user'])]))]);
    }

    public function update(Request $request, Project $project, ProjectComment $comment)
    {
        // Binding check: comment must belong to THIS project.
        if ((int) $comment->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($comment->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate(['message' => 'required|string|max:1000']);
        $comment->update(['message' => $request->message]);

        return response()->json(['data' => $comment]);
    }

    public function destroy(Project $project, ProjectComment $comment)
    {
        // Binding check: comment must belong to THIS project.
        if ((int) $comment->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($comment->user_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $comment->delete();
        return response()->json(['message' => 'Comment deleted']);
    }

    /**
     * Strip auth-sensitive attributes from nested author objects
     * (email is not in User::$hidden).
     */
    private function sanitize($comments)
    {
        $sensitive = ['email', 'email_verified_at', 'google_id', 'two_factor_secret', 'two_factor_recovery_codes', 'bank_name', 'bank_account_number', 'bank_account_name', 'unique_code'];

        $comments->each(function (ProjectComment $c) use ($sensitive) {
            $c->user?->makeHidden($sensitive);
            $c->parent?->user?->makeHidden($sensitive);
        });

        return $comments;
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
