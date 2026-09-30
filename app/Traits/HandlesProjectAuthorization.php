<?php

namespace App\Traits;

use App\Models\Project;
use App\Support\Hire;
use Illuminate\Support\Facades\Auth;

/**
 * Project-level authorization, in one place.
 *
 * This trait is a thin, familiar wrapper over `App\Support\Hire`. It exists so
 * the twenty-odd controllers already using it keep working unchanged, while the
 * RULE itself — including the null-on-both-sides check that six copy-pasted
 * versions of this file got wrong — lives in exactly one class.
 *
 * THE BUG THIS FIXES
 * ------------------
 * `isHiredProfessional()` used to be seven inline arms of the form:
 *
 *     'arsitek' => (int)$project->selected_arsitek_id === (int)$user->arsitek?->id,
 *
 * With no architect on the project and no profile on the user, that is
 * `(int)null === (int)null` — which is TRUE in PHP:
 *
 *     var_dump((int)null === (int)null);   // bool(true)
 *     var_dump((int)null === (int)0);     // bool(true)
 *
 * So a user whose `role_type` is `arsitek` but who has no `arsiteks` row was
 * treated as the hired architect of EVERY project with no architect.
 *
 * Reachable state: `AdminUserController::updateRole` changes `role_type` with no
 * profile side-effect, so promoting a contractor to architect (or demoting any
 * professional) produces exactly the mismatched pair.
 *
 * BLAST RADIUS: `authorizeProjectAccess()` backs 20+ endpoints — minting a
 * payment stage on a foreign project, reading another project's stages, reading
 * a dispute thread and downloading its EVIDENCE FILES from the private disk,
 * termination, BOM writes, warranty closure. One trait, one bug, twenty doors.
 *
 * The same null-equals-null pattern had also been copy-pasted into sixteen
 * further controllers; those are now `Hire::matches()` calls.
 */
trait HandlesProjectAuthorization
{
    /**
     * Check if the given user is the owner of the project.
     */
    protected function isProjectOwner(Project $project, $user = null): bool
    {
        $user = $user ?? Auth::user();

        if (! $user) {
            return false;
        }

        return (int) $project->user_id === (int) $user->id;
    }

    /**
     * Check if the user is a hired professional on the project.
     *
     * False whenever either side is absent. See the class docblock.
     */
    protected function isHiredProfessional(Project $project, $user = null): bool
    {
        $user = $user ?? Auth::user();

        if (! $user) {
            return false;
        }

        return Hire::matches($project, $user, (string) $user->role_type);
    }

    /**
     * Check if the user is authorized for general project feature management.
     * (Owner or Hired Pro)
     */
    protected function authorizeProjectAccess(Project $project, $user = null): bool
    {
        return $this->isProjectOwner($project, $user) || $this->isHiredProfessional($project, $user);
    }

    /**
     * Owner OR the assigned project manager — and nothing else.
     *
     * A SEPARATE predicate on purpose. Many lifecycle actions (specialist
     * hiring, engineering approvals, phase sealing, warranty closure) are the
     * owner's or the PM's decision, not any participant's.
     */
    protected function isOwnerOrAssignedPm(Project $project, $user = null): bool
    {
        return Hire::isOwnerOrAssignedPm($project, $user ?? Auth::user());
    }
}