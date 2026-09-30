<?php

namespace App\Support;

use App\Models\Project;
use App\Models\User;

/**
 * "Is this user the hired professional for this role on this project?"
 *
 * ONE implementation, callable statically, so every authorization check in the
 * codebase can share it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The check was copy-pasted into roughly sixty places across sixteen
 * controllers, written seven different ways in `HandlesProjectAuthorization`
 * and again inline everywhere else. Six of those spellings are VULNERABLE, and
 * the vulnerability is quiet:
 *
 *     (int) $project->selected_arsitek_id === (int) $user->arsitek?->id
 *
 * With no architect on the project and no profile on the user, that is
 * `(int)null === (int)null`, which in PHP is `true`:
 *
 *     var_dump((int)null === (int)null);   // bool(true)
 *     var_dump((int)null === (int)0);     // bool(true)
 *
 * So a user whose `role_type` is `arsitek` but who has no `arsiteks` row reads
 * as the hired architect of EVERY project that has no architect. That state is
 * reachable through `AdminUserController::updateRole`, which changes
 * `role_type` with no profile side-effect.
 *
 * The reachable set was not small: minting a payment stage on a foreign
 * project, reading another project's stages, reading a dispute thread and
 * downloading its EVIDENCE FILES from the private disk, the private document
 * vault, phase sealing, BOM writes, warranty closure, and termination.
 *
 * THE RULE, IN ONE PLACE
 * ----------------------
 * Both sides must be present, and the caller must ask about a role the user
 * actually holds:
 *
 *   1. `$user->role_type` must be one of the seven licensed roles;
 *   2. the user must have a PROFILE row for it (or be the PM, compared by user
 *      id because `projects.pm_id` stores a user id);
 *   3. the project's column for that role must be non-null;
 *   4. the two ids must match.
 *
 * Drop step 2 or 3 and the comparison silently succeeds on nulls. Every prior
 * copy-paste got at least one of them wrong.
 */
final class Hire
{
    /**
     * User relation name per role. NOT derivable from the role key:
     * `interior` -> interior_profile, `notaris` -> notaris_profile.
     *
     * Declared rather than guessed, because a wrong guess yields null — and a
     * null compared against a null column is precisely the bug.
     *
     * @var array<string, string>
     */
    private const RELATIONS = [
        'arsitek' => 'arsitek',
        'kontraktor' => 'kontraktor',
        'interior' => 'interior_profile',
        'notaris' => 'notaris_profile',
        'structural' => 'structural_engineer',
        'mep' => 'mep_engineer',
    ];

    /**
     * The seven licensed roles, read from the registry rather than restated.
     *
     * @return list<string>
     */
    public static function knownRoles(): array
    {
        return array_keys(config('bids', []));
    }

    /**
     * The user's profile id for a role, or null when they have none.
     */
    public static function profileIdFor(string $role, ?User $user): ?int
    {
        if (! $user) {
            return null;
        }

        if ($role === 'project_manager') {
            // `projects.pm_id` stores the PM's USER id, not a profile id.
            return (int) $user->id;
        }

        $relation = self::RELATIONS[$role] ?? null;

        if ($relation === null || ! method_exists($user, $relation)) {
            return null;
        }

        return $user->{$relation}?->id;
    }

    /**
     * Is `$user` the hired professional for `$role` on `$project`?
     *
     * False whenever EITHER side is absent. That is the entire point.
     */
    public static function matches(Project $project, ?User $user, string $role): bool
    {
        if (! $user) {
            return false;
        }

        // 1. The user must actually hold the role they are claiming.
        if ($user->role_type !== $role) {
            return false;
        }

        $column = config("bids.{$role}.project_profile_column");

        if ($column === null) {
            return false; // not one of the seven licensed roles
        }

        // 2. The user must have a profile for it.
        $subjectId = self::profileIdFor($role, $user);

        if ($subjectId === null) {
            return false;
        }

        // 3. The project must actually have that professional.
        $projectId = $project->{$column};

        if ($projectId === null) {
            return false;
        }

        // 4. And they must be the same person.
        return (int) $projectId === (int) $subjectId;
    }

    /**
     * The user is the owner, the assigned PM, or the hired professional.
     */
    public static function canAccess(Project $project, ?User $user): bool
    {
        if (! $user) {
            return false;
        }

        if ((int) $project->user_id === (int) $user->id) {
            return true;
        }

        return self::matches($project, $user, (string) $user->role_type);
    }

    /**
     * The user is the owner or the ASSIGNED project manager — and nothing else.
     *
     * For lifecycle actions that are the client's or the PM's decision, not any
     * participant's. The security audit found a family of these (specialist
     * hiring, engineering approvals, phase sealing, warranty closure) gated on
     * mere participation, which let every hired professional and every active
     * sub-professional drive them.
     */
    public static function isOwnerOrAssignedPm(Project $project, ?User $user): bool
    {
        if (! $user) {
            return false;
        }

        if ((int) $project->user_id === (int) $user->id) {
            return true;
        }

        return $user->role_type === 'project_manager'
            && $project->pm_id !== null
            && (int) $project->pm_id === (int) $user->id;
    }
}