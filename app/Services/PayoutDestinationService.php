<?php

namespace App\Services;

use App\Models\Project;
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

        // Pass 2 — resolve to users in two queries rather than seven.
        $usersByProfileId = $this->usersForProfileIds($profileIdsByRole);

        // Pass 3 — emit in registry order.
        $destinations = [];

        foreach (config('bids') as $role => $config) {
            $user = match (true) {
                $role === 'project_manager' && $pmUserId !== null => User::find($pmUserId),
                isset($profileIdsByRole[$role]) => $usersByProfileId[$profileIdsByRole[$role]] ?? null,
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
     * @param  array<string, int>  $profileIdsByRole
     * @return array<int, User>  keyed by the raw profile id
     */
    private function usersForProfileIds(array $profileIdsByRole): array
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
            foreach ($profileModel::with('user')->findMany(array_values(array_unique($ids))) as $profile) {
                if ($profile->user) {
                    $found[$profile->id] = $profile->user;
                }
            }
        }

        return $found;
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