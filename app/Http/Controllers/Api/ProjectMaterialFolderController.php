<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectMaterialFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProjectMaterialFolderController extends Controller
{
    public function index(Project $project)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json(['data' => $project->materialFolders()->with('creator')->get()]);
    }

    public function store(Request $request, Project $project)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'bom_type' => 'nullable|string|in:raw,finishing',
        ]);

        $folder = $project->materialFolders()->create([
            'name' => $validated['name'],
            'created_by' => $user->id,
            'bom_type' => $validated['bom_type'] ?? 'raw',
        ]);

        return response()->json(['data' => $folder->load('creator')], 201);
    }

    public function update(Request $request, Project $project, ProjectMaterialFolder $folder)
    {
        $user = Auth::user();

        // Binding check: the folder must belong to THIS project.
        if ((int) $folder->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $folder->update($validated);

        return response()->json(['data' => $folder->load('creator')]);
    }

    public function destroy(Project $project, ProjectMaterialFolder $folder)
    {
        $user = Auth::user();

        // Binding check: the folder must belong to THIS project.
        if ((int) $folder->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Set folder_id to null for requirements in this folder
        $folder->requirements()->update(['folder_id' => null]);
        
        $folder->delete();

        return response()->json(['message' => 'Folder deleted successfully.']);
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
        // SECURITY: interior designers must be HIRED on this project — an
        // unscoped role check previously let ANY interior user edit folders.
        $isInterior = $user->role_type === 'interior' && (int) $project->selected_interior_id === (int) $user->interior_profile?->id && in_array('interior', $allowedRoles);
        $isHiredStructural = $user->role_type === 'structural' && $project->structural_id === $user->structural_engineer?->id && in_array('structural', $allowedRoles);
        $isHiredMEP = $user->role_type === 'mep' && $project->mep_id === $user->mep_engineer?->id && in_array('mep', $allowedRoles);

        return $isOwner || $isHiredArsitek || $isHiredKontraktor || $isHiredPM || $isInterior || $isHiredStructural || $isHiredMEP;
    }
}
