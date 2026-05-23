<?php

namespace App\Http\Middleware;

use Closure;
use App\Models\Project;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class FreezeWorkspaceIfTerminationPending
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $project = $request->route('project');

        // Resolve Project if it's passed as ID or route parameter string
        if ($project && !$project instanceof Project) {
            $project = Project::find($project);
        }

        if ($project && $project->status === 'termination_pending') {
            // Block all mutating requests (POST, PUT, PATCH, DELETE)
            if (in_array(strtoupper($request->method()), ['POST', 'PUT', 'PATCH', 'DELETE'])) {
                // Allow mutual termination respond/escalate actions to pass through
                $currentUri = $request->getRequestUri();
                if (!str_contains($currentUri, 'mutual-termination')) {
                    return response()->json([
                        'message' => 'Proyek sedang dalam proses pengajuan pembatalan bersama. Seluruh aktivitas workspace dibekukan sementara.'
                    ], 422);
                }
            }
        }

        return $next($request);
    }
}
