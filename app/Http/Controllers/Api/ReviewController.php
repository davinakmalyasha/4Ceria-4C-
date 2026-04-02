<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ArsitekRating;
use App\Models\KontraktorRating;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ReviewController extends Controller
{
    public function store(Request $request, Project $project)
    {
        $user = Auth::user();

        // 1. Authorization: Only the project owner can leave a review
        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Only the project owner can leave a review.'], 403);
        }

        // 2. Validation: Ensure the project has a hired professional
        if (!$project->selected_arsitek_id && !$project->selected_kontraktor_id) {
            return response()->json(['message' => 'You can only review a professional once they are hired for the project.'], 422);
        }

        $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
        ]);

        // 3. Handle Architect Review
        if ($project->selected_arsitek_id) {
            $existing = ArsitekRating::where('project_id', $project->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already reviewed the architect for this project.'], 422);
            }

            ArsitekRating::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'arsitek_id' => $project->selected_arsitek_id,
                'rating' => $request->rating,
                'komentar' => $request->comment,
            ]);
        }

        // 4. Handle Contractor Review
        if ($project->selected_kontraktor_id) {
            $existing = KontraktorRating::where('project_id', $project->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already reviewed the contractor for this project.'], 422);
            }

            KontraktorRating::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'kontraktor_id' => $project->selected_kontraktor_id,
                'rating' => $request->rating,
                'komentar' => $request->comment,
            ]);
        }

        return response()->json(['message' => 'Thank you for your feedback!'], 201);
    }
}
