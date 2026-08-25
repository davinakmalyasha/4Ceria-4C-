<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ArsitekRating;
use App\Models\KontraktorRating;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Traits\HandlesProjectAuthorization;

class ProjectActivityController extends Controller
{
    use HandlesProjectAuthorization;



    public function getActivity(Project $project)
    {
        // SECURITY: activity logs contain financial/lifecycle events —
        // participants only (trait was previously imported but unused).
        if (! $this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $logs = $project->activityLogs()->with('user')->limit(50)->get();

        return response()->json(['data' => $logs]);
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
