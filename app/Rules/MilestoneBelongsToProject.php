<?php

namespace App\Rules;

use App\Models\ProjectMilestone;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Route;

/**
 * A `milestone_id` must name a milestone that belongs to THIS project.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every site that accepted a `milestone_id` validated it as
 *
 *     'exists:project_milestones,id'
 *
 * which only proves the row exists SOMEWHERE. So a payment stage -- the thing
 * that gates real money -- could be linked to a milestone belonging to a
 * different, unrelated project:
 *
 *     $request->validate(['milestone_id' => 'required|exists:project_milestones,id']);
 *     $termin->update(['milestone_id' => $request->milestone_id]);
 *
 * The link then works in the attacker's favour:
 * `ProjectMilestoneController::unlockLinkedTermin()` flips every termin whose
 * `milestone_id` points at an approved milestone from `locked` to `pending`. So
 * when the VICTIM project's owner or PM approved their own milestone, the
 * attacker's payment stage was unlocked with none of the attacker's own work
 * done -- and the attacker had authorised their own fee's release.
 *
 * The project is taken from the constructor when the caller has it, and
 * otherwise from the route, so the same rule works in a controller (where
 * `$project` is bound) and in a FormRequest (where it is not).
 */
class MilestoneBelongsToProject implements ValidationRule
{
    /**
     * @param  int|null  $projectId  the project the milestone must belong to
     */
    public function __construct(private ?int $projectId = null)
    {
    }

    /**
     * @param  string  $attribute
     */
    public function validate($attribute, $value, Closure $fail): void
    {
        if ($value === null || $value === '') {
            return; // nullable, handled by the `nullable` rule
        }

        $projectId = $this->projectId ?? $this->projectIdFromRoute();

        if ($projectId === null) {
            // Cannot prove ownership without a project. Refusing is the safe
            // default: silently passing would reintroduce the exact bug.
            $fail("The {$attribute} could not be verified against a project.");

            return;
        }

        $exists = ProjectMilestone::where('id', $value)
            ->where('project_id', $projectId)
            ->exists();

        if (! $exists) {
            $fail("The selected work phase does not belong to this project.");
        }
    }

    private function projectIdFromRoute(): ?int
    {
        $project = Route::current()?->parameter('project');

        return is_object($project) ? (int) $project->id : (is_numeric($project) ? (int) $project : null);
    }
}