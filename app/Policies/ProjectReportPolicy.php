<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\ProjectReport;
use App\Models\User;
use Illuminate\Auth\Access\Response;
use App\Support\Hire;

class ProjectReportPolicy
{
    /**
     * Determine whether the user can list reports for a project.
     */
    public function viewAny(User $user, Project $project): bool
    {
        // `projects.pm_id` holds the PM's PROFILE id — comparing it with the
        // user id locked the assigned PM out of the report list.
        return (int)$user->id === (int)$project->user_id || Hire::isAssignedPm($project, $user);
    }

    /**
     * Determine whether the user can view the report.
     */
    public function view(User $user, ProjectReport $projectReport): bool
    {
        $projectReport->loadMissing('project');
        return (int)$user->id === (int)$projectReport->project->user_id ||
               Hire::isAssignedPm($projectReport->project, $user);
    }

    /**
     * Determine whether the user can create reports.
     */
    public function create(User $user, $project): bool
    {
        return Hire::isAssignedPm($project, $user) || (int)$user->id === (int)$project->user_id;
    }

    /**
     * Determine whether the user can update the report.
     */
    public function update(User $user, ProjectReport $projectReport): bool
    {
        $projectReport->loadMissing('project');
        return (int)$user->id === (int)$projectReport->created_by ||
               (int)$user->id === (int)$projectReport->project->user_id;
    }

    /**
     * Determine whether the user can delete the report.
     */
    public function delete(User $user, ProjectReport $projectReport): bool
    {
        $projectReport->loadMissing('project');
        return (int)$user->id === (int)$projectReport->created_by ||
               (int)$user->id === (int)$projectReport->project->user_id;
    }
}
