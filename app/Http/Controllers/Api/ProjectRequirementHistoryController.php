<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectRequirement;
use App\Models\ProjectRequirementHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectRequirementHistoryController extends Controller
{
    public function index(Project $project, ProjectRequirement $requirement)
    {
        if (!$this->isAuthorizedPro($project, Auth::user())) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $history = $requirement->histories()
            ->with(['user'])
            ->latest()
            ->get();

        return response()->json(['data' => $history]);
    }

    public function restock(Request $request, Project $project, ProjectRequirement $requirement)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user, ['kontraktor', 'project_manager', 'user'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'quantity' => 'required|numeric|min:0.01',
            'notes' => 'nullable|string|max:1000',
        ]);

        return DB::transaction(function () use ($requirement, $validated, $project, $user) {
            $requirement = ProjectRequirement::where('id', $requirement->id)->lockForUpdate()->first();
            
            $requirement->increment('quantity_on_site', $validated['quantity']);
            
            $history = ProjectRequirementHistory::create([
                'project_requirement_id' => $requirement->id,
                'user_id' => $user->id,
                'type' => 'restock',
                'quantity' => $validated['quantity'],
                'notes' => $validated['notes'] ?? 'Manual stock addition.',
            ]);

            $this->logActivity($project, 'external_procurement', "Restocked {$validated['quantity']} {$requirement->unit} of {$requirement->name}");

            return response()->json([
                'message' => 'Material successfully restocked.',
                'requirement' => $requirement,
                'history' => $history->load('user')
            ]);
        });
    }

    public function use(Request $request, Project $project, ProjectRequirement $requirement)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user, ['kontraktor', 'project_manager', 'user'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'quantity' => 'required|numeric|min:0.01',
            'notes' => 'nullable|string|max:1000',
        ]);

        return DB::transaction(function () use ($requirement, $validated, $project, $user) {
            $requirement = ProjectRequirement::where('id', $requirement->id)->lockForUpdate()->first();

            if ($requirement->quantity_on_site < $validated['quantity']) {
                return response()->json(['message' => 'Insufficient stock on site.'], 422);
            }

            $requirement->decrement('quantity_on_site', $validated['quantity']);
            $requirement->increment('quantity_used', $validated['quantity']);

            $history = ProjectRequirementHistory::create([
                'project_requirement_id' => $requirement->id,
                'user_id' => $user->id,
                'type' => 'use',
                'quantity' => $validated['quantity'],
                'notes' => $validated['notes'] ?? 'Logged material usage.',
            ]);

            $this->logActivity($project, 'material_used', "Used {$validated['quantity']} {$requirement->unit} of {$requirement->name}");

            return response()->json([
                'message' => 'Material usage logged.',
                'requirement' => $requirement,
                'history' => $history->load('user')
            ]);
        });
    }

    private function isAuthorizedPro(Project $project, $user, array $allowedRoles = [])
    {
        if (empty($allowedRoles)) {
            $allowedRoles = ['arsitek', 'kontraktor', 'mep', 'structural', 'project_manager', 'user', 'interior'];
        }
        
        $isOwner = $project->user_id === $user->id && in_array('user', $allowedRoles);
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id && in_array('arsitek', $allowedRoles);
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id && in_array('kontraktor', $allowedRoles);
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id && in_array('project_manager', $allowedRoles);
        $isInterior = $user->role_type === 'interior' && in_array('interior', $allowedRoles);

        return $isOwner || $isHiredArsitek || $isHiredKontraktor || $isHiredPM || $isInterior;
    }

    private function logActivity(Project $project, string $action, string $details): void
    {
        \App\Models\ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }
}
