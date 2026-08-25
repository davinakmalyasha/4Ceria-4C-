<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\BidStructural;
use App\Models\BidMep;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class EngineeringProcurementController extends Controller
{
    /**
     * Architect submits technical interview notes and recommends a bid.
     */
    public function submitInterview(Request $request, Project $project)
    {
        return DB::transaction(function () use ($request, $project) {
            $user = Auth::user();

            // Only Architect can interview and recommend
            $isArchitect = $project->selected_arsitek_id && 
                          $user->role_type === 'arsitek' && 
                          (int) $project->selected_arsitek_id === (int) $user->arsitek?->id;
            
            if (!$isArchitect) {
                return response()->json(['message' => 'Unauthorized. Only the Project Architect can interview specialized engineers.'], 403);
            }

            $validated = $request->validate([
                'bid_id' => 'required|integer',
                'bid_type' => 'required|in:structural,mep',
                'interview_notes' => 'required|string',
                'is_recommended' => 'required|boolean',
            ]);

            $bid = null;
            if ($validated['bid_type'] === 'structural') {
                $bid = BidStructural::where('id', $validated['bid_id'])->where('project_id', $project->id)->firstOrFail();
            } else {
                $bid = BidMep::where('id', $validated['bid_id'])->where('project_id', $project->id)->firstOrFail();
            }

            $bid->update([
                'interview_notes' => $validated['interview_notes'],
                'is_recommended' => $validated['is_recommended'],
                'status' => $validated['is_recommended'] ? 'recommended' : $bid->status,
            ]);

            // Notify the Owner directly (FIDIC/AIA: Architect → Owner)
            if ($validated['is_recommended']) {
                \App\Models\Notification::create([
                    'user_id' => $project->user_id,
                    'type' => 'specialist_recommendation',
                    'title' => 'Architect Specialist Recommendation',
                    'body' => "Your architect has recommended a {$validated['bid_type']} engineer for \"{$project->title}\". Please review and authorize.",
                    'data' => [
                        'project_id' => $project->id,
                        'bid_id' => $bid->id,
                        'bid_type' => $validated['bid_type'],
                    ],
                ]);
            }

            return response()->json([
                'message' => 'Interview notes saved and recommendation updated.',
                'data' => $bid
            ]);
        });
    }
}
