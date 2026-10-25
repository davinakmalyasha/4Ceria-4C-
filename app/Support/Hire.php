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
        'project_manager' => 'project_manager',
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
     * The column on `projects` that identifies the hired professional.
     *
     * Null when the role is not one of the seven licensed roles.
     */
    public static function projectColumnFor(string $role): ?string
    {
        $column = config("bids.{$role}.project_id_column");

        return is_string($column) && $column !== '' ? $column : null;
    }

    /**
     * WHICH id space the project's column for this role is in.
     *
     * ALWAYS 'profile'. `projects.pm_id` used to be the exception — it held
     * the PM's USER id — and the pm_id resolution migration removed it, so
     * every `selected_*` column on `projects` holds a profile id now.
     *
     * The method is kept because it is a useful thing to ASK, and because the
     * Go port asserts the same invariant in `identity.RoleSpec` — but it can
     * only ever return one value, so a caller that branches on it has nothing
     * left to branch on.
     */
    public static function projectIdKind(string $role): string
    {
        return 'profile';
    }

    /**
     * The user's PROFILE MODEL for a role, or null when they have none.
     *
     * THE vocabulary split lives here, once, and there are deliberately TWO accessors
     * because the two callers need different things:
     *
     *   profileIdFor()  the id to compare against a PROJECT COLUMN. Since the
     *                  pm_id resolution migration, that is a PROFILE id for all
     *                  seven roles.
     *   profile()       the ROW itself, for anything reading a column on the
     *                  profile -- verification status, reliability score, licences.
     *
     * @return \Illuminate\Database\Eloquent\Model|null
     */
    public static function profile(string $role, ?User $user)
    {
        if (! $user) {
            return null;
        }

        $relation = self::RELATIONS[$role] ?? null;

        if ($relation === null || ! method_exists($user, $relation)) {
            return null;
        }

        return $user->{$relation};
    }

    /**
     * The id to compare against the PROJECT column for a role, or null.
     *
     * Since the pm_id resolution migration this is a PROFILE id for ALL SEVEN
     * roles.
     *
     * `projects.pm_id` used to hold the PM's USER id, while every other
     * `selected_*` column held a PROFILE id, and `bids_project_manager.pm_id`
     * held a PROFILE id. So the project column and its own bid table disagreed
     * about which id space they were in, and every comparison against it had to
     * remember the exception.
     *
     * The migration made `projects.pm_id` hold the PM's PROFILE id — the same
     * value `bids_project_manager.pm_id` holds, and the same value
     * `acceptBid` writes — so the rule has no exception left to remember.
     */
    public static function profileIdFor(string $role, ?User $user): ?int
    {
        if (! $user) {
            return null;
        }

        $relation = self::RELATIONS[$role] ?? null;

        if ($relation === null || ! method_exists($user, $relation)) {
            return null;
        }

        return $user->{$relation}?->id;
    }

    /**
     * The PM PROFILE id of a user, or null when they have no PM profile.
     */
    public static function pmProfileId(?User $user): ?int
    {
        return self::profileIdFor('project_manager', $user);
    }

    /**
     * Is this user the project's ASSIGNED project manager?
     *
     * ONE implementation of a rule that was copy-pasted into roughly eighty
     * places across twenty-five controllers, written a dozen different ways:
     *
     *     $project->pm_id === $user->id
     *     (int) $project->pm_id === (int) $user->id
     *     $user->id === $project->pm_id
     *     $project->pm_id !== Auth::id()
     *     ...
     *
     * Each of those compared a USER id against a column that holds a PROFILE
     * id, so each of them had to change — and each of them was a place to get
     * it wrong. They now all call this.
     */
    public static function isAssignedPm(Project $project, ?User $user): bool
    {
        if (! $user) {
            return false;
        }

        $pmProfileId = self::pmProfileId($user);

        if ($pmProfileId === null) {
            return false;
        }

        $projectPmId = $project->pm_id;

        if ($projectPmId === null) {
            return false;
        }

        return (int) $projectPmId === (int) $pmProfileId;
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

        $column = self::projectColumnFor($role);

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

        return self::isAssignedPm($project, $user);
    }
}