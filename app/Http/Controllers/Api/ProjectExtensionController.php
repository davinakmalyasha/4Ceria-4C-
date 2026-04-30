<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectTimelineExtension;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectExtensionController extends Controller
{
    public function index(Project $project)
    {
        return response()->json([
            'data' => $project->timelineExtensions()->with('requester')->get()
        ]);
    }

    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'reason' => 'required|string|max:255',
            'description' => 'nullable|string',
            'days_requested' => 'required|integer|min:1',
        ]);

        $extension = $project->timelineExtensions()->create([
            'requester_id' => $request->user()->id,
            'reason' => $validated['reason'],
            'description' => $validated['description'],
            'days_requested' => $validated['days_requested'],
            'original_deadline' => $project->deadline,
            'status' => 'proposed',
        ]);

        return response()->json(['message' => 'Extension requested', 'data' => $extension]);
    }

    public function pmReview(Request $request, Project $project, ProjectTimelineExtension $extension)
    {
        $validated = $request->validate([
            'status' => 'required|in:pm_reviewed,rejected',
            'pm_notes' => 'nullable|string',
        ]);

        $extension->update([
            'status' => $validated['status'],
            'pm_notes' => $validated['pm_notes'],
        ]);

        return response()->json(['message' => 'Review submitted', 'data' => $extension]);
    }

    public function ownerDecide(Request $request, Project $project, ProjectTimelineExtension $extension)
    {
        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'owner_notes' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $extension->update([
                'status' => $validated['status'],
                'owner_notes' => $validated['owner_notes'],
                'new_deadline_date' => $validated['status'] === 'approved' 
                    ? \Carbon\Carbon::parse($project->deadline)->addDays($extension->days_requested)
                    : null
            ]);

            if ($validated['status'] === 'approved') {
                $project->update([
                    'deadline' => $extension->new_deadline_date
                ]);
            }

            DB::commit();
            return response()->json(['message' => 'Decision recorded', 'data' => $extension]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to process decision'], 500);
        }
    }
}
