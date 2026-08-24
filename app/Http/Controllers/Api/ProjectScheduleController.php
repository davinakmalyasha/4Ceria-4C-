<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectSchedule;
use App\Services\ProjectScheduleService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

class ProjectScheduleController extends Controller
{
    use AuthorizesRequests;

    protected $scheduleService;

    public function __construct(ProjectScheduleService $scheduleService)
    {
        $this->scheduleService = $scheduleService;
    }

    /**
     * Get project timeline and summary.
     */
    public function index(Project $project)
    {
        // R1: Security & Authorization
        if ((int)$project->pm_id !== (int)Auth::id() && (int)$project->user_id !== (int)Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $timeline = $this->scheduleService->getProjectTimeline($project);
        return response()->json($timeline);
    }

    /**
     * Update a phase in the timeline.
     */
    public function update(Request $request, Project $project, ProjectSchedule $schedule)
    {
        // R1: Security & Authorization (PM or project owner, same as index)
        if ((int)$project->pm_id !== (int)Auth::id() && (int)$project->user_id !== (int)Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Scope binding: the schedule must belong to this project
        if ((int)$schedule->project_id !== (int)$project->id) {
            return response()->json(['message' => 'Phase not found in this project.'], 404);
        }

        $validator = Validator::make($request->all(), [
            'target_start_date' => 'nullable|date',
            'target_end_date' => ($request->filled('target_start_date') ? 'nullable|date|after_or_equal:target_start_date' : 'nullable|date'),
            'status' => 'nullable|string|in:pending,active,completed,delayed',
            'progress_percentage' => 'nullable|integer|min:0|max:100',
            'notes' => 'nullable|string|max:5000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $schedule->update($request->only(['target_start_date', 'target_end_date', 'status', 'progress_percentage', 'notes']));

        return response()->json([
            'message' => 'Phase updated successfully.',
            'phase' => $schedule
        ]);
    }

    /**
     * Log a delay for a phase.
     */
    public function logDelay(Request $request, Project $project)
    {
        if ((int)$project->pm_id !== (int)Auth::id()) {
            return response()->json(['message' => 'Only the PM can log delays.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'phase_slug' => 'required|string',
            'days' => 'required|integer|min:1',
            'reason' => 'required|string',
            'category' => 'required|string',
            'logged_at' => 'nullable|date'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $delay = $this->scheduleService->logDelay($project, $request->all());
        return response()->json([
            'message' => 'Delay logged and stakeholders notified.',
            'delay' => $delay
        ]);
    }
}
