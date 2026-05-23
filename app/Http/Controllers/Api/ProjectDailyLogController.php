<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectDailyLog;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectDailyLogController extends Controller
{
    public function index(Project $project)
    {
        $logs = $project->dailyLogs()->with('user')->orderBy('log_date', 'desc')->get();
        return response()->json(['data' => $logs]);
    }

    public function store(Request $request, Project $project)
    {
        $user = Auth::user();
        
        // Authorization: Only the hired contractor, PM, or active sub-professional can log site activity
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;
        $isSubPro = DB::table('project_sub_professionals')
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();

        if (!$isHiredKontraktor && !$isHiredPM && !$isSubPro) {
            return response()->json(['message' => 'Unauthorized. Only the hired contractor, PM, or active sub-professionals can log site activity.'], 403);
        }

        // PBG Gate: Only applies to new_build and renovation categories during physical build/construction phase
        $needsPBG = in_array($project->project_category, ['new_build', 'renovation']);
        if ($needsPBG) {
            $isPBGApproved = $project->pbg_verified_at !== null || $project->milestones()
                ->where('approval_status', 'approved')
                ->where(function($q) {
                    $q->where('title', 'like', '%PBG%')
                      ->orWhere('title', 'like', '%IMB%');
                })
                ->exists();
                
            if (!$isPBGApproved) {
                return response()->json(['message' => 'Physical site work is locked. PBG permit is missing or unverified.'], 403);
            }
        }

        $validated = $request->validate([
            'log_date' => 'required|date',
            'weather' => 'required|string|max:50',
            'worker_count' => 'required|integer|min:0',
            'activities' => 'required|string',
            'issues' => 'nullable|string',
            'photos' => 'nullable|array|max:4',
            'photos.*' => 'image|max:5120',
        ]);

        return DB::transaction(function () use ($project, $validated, $user) {
            $photos = [];
            if (isset($validated['photos'])) {
                foreach ($validated['photos'] as $photo) {
                    $photos[] = $photo->store('daily_logs', 'public');
                }
            }

            $log = $project->dailyLogs()->create([
                'user_id' => $user->id,
                'log_date' => $validated['log_date'],
                'weather' => $validated['weather'],
                'worker_count' => $validated['worker_count'],
                'activities' => $validated['activities'],
                'issues' => $validated['issues'],
                'photos' => $photos,
            ]);

            $this->logActivity($project, 'daily_log_added', "Added site log for {$validated['log_date']}");

            return response()->json(['data' => $log->load('user')]);
        });
    }

    public function destroy(Project $project, ProjectDailyLog $dailyLog)
    {
        if ($dailyLog->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $dailyLog->delete();
        $this->logActivity($project, 'daily_log_deleted', "Removed site log for {$dailyLog->log_date}");

        return response()->json(['message' => 'Log entry deleted.']);
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
