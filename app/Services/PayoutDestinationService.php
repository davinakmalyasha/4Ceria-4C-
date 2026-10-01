<?php

namespace App\Services;

use App\Models\Project;
use Illuminate\Http\Request;
use App\Models\User;

/**
 * Where the owner should send money for each hired role.
 *
 * WHY THIS EXISTS — THE BUG IT REPLACES
 * ------------------------------------
 * `signContract()` had the professional fill in bank details, and then did this:
 *
 *     $project->update(['payment_instructions' =>
 *         "Bank: {$bankType} | No. Rekening: {$no} | A/N: {$name}"]);
 *
 * `projects.payment_instructions` is the OWNER'S OWN FIELD. `BriefingActionCenter`
 * lets the owner/PM edit it, `UpdateProjectRequest` validates it, and
 * `ProjectPayments` renders it to the owner as "Payment Instructions" — the
 * authoritative string telling the client which account to transfer to. The SPA
 * even documents the ownership explicitly:
 *
 *     // NEVER fallback to project?.payment_instructions, as that belongs to the
 *     // client/PM.
 *
 *     ContractSignModal.tsx:403
 *
 * So a counterparty was writing into the client's authoritative financial
 * instruction field. Two consequences:
 *
 *   1. A HIRED PROFESSIONAL could replace the owner's instructions with an
 *      arbitrary account string, and the platform would then tell the client to
 *      transfer escrow to it. Nothing downstream reconciles the account against
 *      the person actually owed, because the string is free text.
 *   2. `payment_instructions` is ONE project-level column shared by ALL SEVEN
 *      roles, so signing was last-writer-wins: architect signs, contractor signs,
 *      and the owner is left with one account belonging to no particular role.
 *
 * The professional's structured bank details were ALREADY being persisted to
 * their own record (`users.bank_name`, `users.bank_account_number`,
 * `users.bank_account_name`) on the same line. That copy is per-person, cannot
 * collide across roles, and is validated on input.
 *
 * So the denormalised free-text duplicate is removed, and this service derives
 * the payout destination per role from the structured source. Nothing
 * trustworthy is lost: that line was the field's only non-owner writer.
 */
final class PayoutDestinationService
{
    /**
     * Per-request profile-id -> User memo.
     *
     * WHY THIS EXISTS -- AN N+1 I INTRODUCED
     * -----------------------------------------
     * `ProjectResource` calls `forProject()` for EVERY row of a collection, and
     * each call issued up to seven queries (one `findMany` per profile model class
     * present, plus `User::find()` for the PM). On `GET /api/projects?all=true`
     * -- which the dashboard fires on mount for every role -- that is up to 13
     * queries per row across a 200-row page.
     *
     * Ids are unique per table but they OVERLAP across tables: architect profile
     * 42 and contractor profile 42 are different rows. So a naive request-scoped
     * `User::findMany(allIds)` would return the wrong person's bank details. The
     * memo is therefore keyed by MODEL CLASS + id, which is exactly the key the
     * grouped query below already uses, and a miss simply falls through to the
     * normal path.
     *
     * Stored on the request rather than as an instance property, because one
     * Resource collection is serialised by one request but the service is resolved
     * fresh from the container per call in some paths.
     */
    private static function memoFor(Request $request): array
    {
        return $request->attributes->get(self::MEMO_KEY, []);
    }

    private const MEMO_KEY = 'payout_destination_user_memo';

    /**
     * Payout destination per hired role, keyed by role, in `config('bids')` order.
     *
     * Roles with nobody hired are OMITTED rather than emitted empty, so "nobody
     * hired" cannot be mistaken for "hired, bank details unknown" — the owner
     * acts on those differently.
     *
     * @return array<string, array<string, mixed>>
     */
    public function forProject(Project $project): array
    {
        $request = request();
        $memo = self::memoFor($request);
        // Pass 1 — what does the project say is hired?
        //
        // `projects.pm_id` holds the PM's USER id; every other `selected_*`
        // column holds a PROFILE id (see config/bids.php). Conflating them
        // resolves a profile id against `users.id`, which either misses or —
        // far worse — returns the wrong person's bank details.
        $pmUserId = null;
        $profileIdsByRole = [];

        foreach (config('bids') as $role => $config) {
            $id = $project->{$config['project_profile_column']} ?? null;

            if ($id === null) {
                continue;
            }

            if ($role === 'project_manager') {
                $pmUserId = (int) $id;
            } else {
                $profileIdsByRole[$role] = (int) $id;
            }
        }

        // Pass 2 — resolve to users, reading the per-request memo first.
        //
        // Only the profile ids NOT already seen are queried, so a 200-row page
        // costs one query per profile model class per row *only on the first row
        // that mentions that class*, and nothing at all afterwards.
        $usersByProfileIds = $this->usersForProfileIds($profileIdsByRole, $memo, $request);

        // Pass 3 — emit in registry order.
        $destinations = [];

        foreach (config('bids') as $role => $config) {
            $profileModel = $config['profile_model'] ?? null;

            $user = match (true) {
                $role === 'project_manager' && $pmUserId !== null => $this->userFor($memo, User::class, $pmUserId, $request),
                isset($profileIdsByRole[$role]) => $usersByProfileIds[$profileModel . ':' . $profileIdsByRole[$role]] ?? null,
                default => null,
            };

            // Only roles that were actually hired get an entry. `$user` may still
            // be null when the profile row was deleted out from under the
            // project; that is reported as an incomplete destination rather than
            // silently omitted, because a dangling column is a data fault the
            // owner needs to see.
            if ($role === 'project_manager' && $pmUserId === null) {
                continue;
            }

            if ($role !== 'project_manager' && ! isset($profileIdsByRole[$role])) {
                continue;
            }

            $destinations[$role] = $this->describe($role, $config, $user);
        }

        return $destinations;
    }

    /**
     * Profile id => User for the six profile-id roles, batched by model class.
     *
     * The return is keyed by `"ModelClass:id"`, NOT by the bare profile id.
     *
     * A REAL BUG, caught by the performance suite: profile ids are unique per
     * table but they OVERLAP across tables. Architect profile 42 and contractor
     * profile 42 are different rows belonging to different people. Keying the
     * result by the bare id meant whichever model was iterated last OVERWROTE the
     * other, so a project could be shown the CONTRACTOR's bank details under the
     * ARCHITECT's role -- telling the owner to pay the wrong person for the wrong
     * stage.
     *
     * The memo was always keyed by class+id (see MEMO_KEY above); the returned
     * map was not, which is exactly the kind of half-fix that survives review.
     * Both are keyed the same way now.
     *
     * @param  array<string, int>  $profileIdsByRole
     * @param  array<string, User|null>  $memo  mutated in place
     * @return array<string, User>  keyed by "ModelClass:id"
     */
    private function usersForProfileIds(array $profileIdsByRole, array &$memo, Request $request): array
    {
        if ($profileIdsByRole === []) {
            return [];
        }

        $grouped = [];
        foreach ($profileIdsByRole as $role => $id) {
            $grouped[config("bids.{$role}.profile_model")][] = $id;
        }

        $found = [];

        foreach ($grouped as $profileModel => $ids) {
            // Split on the memo. Ids already resolved for THIS model class are
            // reused without a query; the rest are fetched in one statement.
            $wanted = [];
            foreach (array_unique($ids) as $id) {
                $key = $profileModel . ':' . $id;

                if (array_key_exists($key, $memo)) {
                    if ($memo[$key] !== null) {
                        $found[$key] = $memo[$key];
                    }

                    continue;
                }

                $wanted[] = $id;
            }

            if ($wanted === []) {
                continue;
            }

            foreach ($profileModel::with('user')->findMany($wanted) as $profile) {
                $user = $profile->user;
                $memo[$profileModel . ':' . $profile->id] = $user;
                $found[$profileModel . ':' . $profile->id] = $user;
            }

            // A profile id that resolved to nothing is memoised as null, so a page
            // with 200 dangling references costs one query rather than 200.
            foreach ($wanted as $id) {
                $memo[$profileModel . ':' . $id] ??= null;
            }
        }

        $request->attributes->set(self::MEMO_KEY, $memo);

        return $found;
    }

    /**
     * `User::find()` through the same memo, keyed on the users table.
     *
     * The PM's id is a USER id, so it is memoised under `User::` and cannot
     * collide with a profile id even though the numeric values may match.
     *
     * @param  array<string, User|null>  $memo
     */
    private function userFor(array &$memo, string $model, int $id, Request $request): ?User
    {
        $key = $model . ':' . $id;

        if (! array_key_exists($key, $memo)) {
            $memo[$key] = $model::find($id);
            $request->attributes->set(self::MEMO_KEY, $memo);
        }

        return $memo[$key];
    }

    /**
     * @return array<string, mixed>
     */
    private function describe(string $role, array $config, ?User $user): array
    {
        $bankName = $user?->bank_name;
        $accountNo = $user?->bank_account_number;
        $accountName = $user?->bank_account_name;

        return [
            'role' => $role,
            'label' => $config['label'] ?? $role,

            // WHO is owed, which an account number alone does not tell the owner.
            'user_id' => $user?->id,
            'name' => $user?->name,

            // Structured, never a pre-joined string the client has to parse back
            // out with a regex — which is what `ProjectPayments.tsx` did.
            'bank_name' => $bankName,
            'bank_account_number' => $accountNo,
            'bank_account_name' => $accountName,

            // false means the professional signed without giving bank details (or
            // their profile is dangling). The owner must see that as a BLOCKER,
            // not as a blank to ignore.
            'complete' => $user !== null
                && ! empty($bankName)
                && ! empty($accountNo)
                && ! empty($accountName),
        ];
    }
}