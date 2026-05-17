<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArsitekRating;
use App\Models\KontraktorRating;
use App\Models\InteriorRating;
use App\Models\NotarisRating;
use App\Models\PMRating;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ReviewController extends Controller
{
    public function store(Request $request, Project $project)
    {
        $user = Auth::user();

        // 1. Authorization: Only the project owner can leave a review
        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Only the project owner can leave a review.'], 403);
        }

        $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
            'target_role' => 'required|in:arsitek,kontraktor,interior,notaris,pm',
        ]);

        $role = $request->target_role;

        // 2. Lifecycle Gate: Ensure the project is completed OR the professional was terminated/resigned
        $modelClass = match ($role) {
            'arsitek' => \App\Models\BidArsitek::class,
            'kontraktor' => \App\Models\BidKontraktor::class,
            'interior' => \App\Models\BidInterior::class,
            'notaris' => \App\Models\BidNotaris::class,
            'pm' => \App\Models\BidProjectManager::class,
            default => null,
        };

        if (!$modelClass) {
            return response()->json(['message' => "Invalid role: {$role}"], 422);
        }

        $bid = $modelClass::where('project_id', $project->id)
            ->whereIn('status', ['accepted', 'terminated', 'resigned'])
            ->latest()
            ->first();

        if (!$bid) {
            return response()->json(['message' => "No professional assignment found for role: {$role}"], 422);
        }

        // Only allow review if project is completed OR the pro was terminated/resigned
        if ($project->status !== 'completed' && !in_array($bid->status, ['terminated', 'resigned'])) {
            return response()->json(['message' => 'You can only leave a review once the project is completed or the professional has left.'], 422);
        }

        return DB::transaction(function () use ($request, $project, $user, $role, $bid) {
            $result = null;
            $professionalIdColumn = match($role) {
                'arsitek' => 'arsitek_id',
                'kontraktor' => 'kontraktor_id',
                'interior' => 'interior_id',
                'notaris' => 'notaris_id',
                'pm' => 'pm_id',
            };

            $professionalId = $bid->$professionalIdColumn;

            // Update or Create the review
            if ($role === 'arsitek') {
                $result = ArsitekRating::updateOrCreate(
                    ['project_id' => $project->id, 'user_id' => $user->id, 'arsitek_id' => $professionalId],
                    ['rating' => $request->rating, 'komentar' => $request->comment]
                );
            } elseif ($role === 'kontraktor') {
                $result = KontraktorRating::updateOrCreate(
                    ['project_id' => $project->id, 'user_id' => $user->id, 'kontraktor_id' => $professionalId],
                    ['rating' => $request->rating, 'komentar' => $request->comment]
                );
            } elseif ($role === 'interior') {
                $result = InteriorRating::updateOrCreate(
                    ['project_id' => $project->id, 'user_id' => $user->id, 'interior_id' => $professionalId],
                    ['rating' => $request->rating, 'komentar' => $request->comment]
                );
            } elseif ($role === 'notaris') {
                $result = NotarisRating::updateOrCreate(
                    ['project_id' => $project->id, 'user_id' => $user->id, 'notaris_id' => $professionalId],
                    ['rating' => $request->rating, 'komentar' => $request->comment]
                );
            } elseif ($role === 'pm') {
                $result = PMRating::updateOrCreate(
                    ['project_id' => $project->id, 'user_id' => $user->id, 'pm_id' => $professionalId],
                    ['rating' => $request->rating, 'komentar' => $request->comment]
                );
            }

            // --- Real-Time Notification & Accountability ---
            
            // 1. Fetch the professional's User ID to send a notification
            $professionalProfile = match($role) {
                'arsitek' => $bid->arsitek,
                'kontraktor' => $bid->kontraktor,
                'interior' => $bid->interior,
                'notaris' => $bid->notaris,
                'pm' => $bid->projectManager,
            };

            if ($professionalProfile && $professionalProfile->user_id) {
                \App\Models\Notification::create([
                    'user_id' => $professionalProfile->user_id,
                    'type' => 'new_review',
                    'title' => 'New Review Received',
                    'body' => "Project Owner of \"{$project->title}\" has left you a {$request->rating}-star review.",
                    'data' => ['project_id' => $project->id, 'rating' => $request->rating],
                ]);
            }

            return response()->json(['message' => 'Thank you for your feedback!', 'data' => $result], 201);
        });
    }
}
