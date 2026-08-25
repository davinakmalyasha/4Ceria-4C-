<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\ProjectReport;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class ProjectReportPolicy
{
    /**
     * Determine whether the user can list reports for a project.
     */
    public function viewAny(User $user, Project $project): bool
    {
        return (int)$user->id === (int)$project->user_id ||
               (int)$user->id === (int)$project->pm_id;
    }

    /**
     * Determine whether the user can view the report.
     */
    public function view(User $user, ProjectReport $projectReport): bool
    {
        return (int)$user->id === (int)$projectReport->project->user_id || 
               (int)$user->id === (int)$projectReport->project->pm_id;
    }

    /**
     * Determine whether the user can create reports.
     */
    public function create(User $user, $project): bool
    {
        return (int)$user->id === (int)$project->pm_id || (int)$user->id === (int)$project->user_id;
    }

    /**
     * Determine whether the user can update the report.
     */
    public function update(User $user, ProjectReport $projectReport): bool
    {
        return (int)$user->id === (int)$projectReport->created_by || 
               (int)$user->id === (int)$projectReport->project->user_id;
    }

    /**
     * Determine whether the user can delete the report.
     */
    public function delete(User $user, ProjectReport $projectReport): bool
    {
        return (int)$user->id === (int)$projectReport->created_by || 
               (int)$user->id === (int)$projectReport->project->user_id;
    }
}
