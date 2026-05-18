<?php

namespace App\Traits;

use App\Models\Project;
use Illuminate\Support\Facades\Auth;

trait HandlesProjectAuthorization
{
    /**
     * Check if the given user is the owner of the project.
     */
    protected function isProjectOwner(Project $project, $user = null): bool
    {
        $user = $user ?? Auth::user();
        if (!$user) return false;
        return (int)$project->user_id === (int)$user->id;
    }

    /**
     * Check if the given user is a hired professional on the project.
     */
    protected function isHiredProfessional(Project $project, $user = null): bool
    {
        $user = $user ?? Auth::user();
        if (!$user) return false;

        $role = $user->role_type;

        return match ($role) {
            'arsitek' => (int)$project->selected_arsitek_id === (int)$user->arsitek?->id,
            'kontraktor' => (int)$project->selected_kontraktor_id === (int)$user->kontraktor?->id,
            'interior' => (int)$project->selected_interior_id === (int)$user->interior_profile?->id,
            'notaris' => (int)$project->selected_notaris_id === (int)$user->notaris_profile?->id,
            'project_manager' => (int)$project->pm_id === (int)$user->id,
            'structural' => (int)$project->structural_id === (int)($user->structural_engineer?->id),
            'mep' => (int)$project->mep_id === (int)($user->mep_engineer?->id),
            default => false,
        };
    }

    /**
     * Check if the user is authorized for general project feature management.
     * (Owner or Hired Pro)
     */
    protected function authorizeProjectAccess(Project $project, $user = null): bool
    {
        return $this->isProjectOwner($project, $user) || $this->isHiredProfessional($project, $user);
    }
}
