<?php

namespace App\Services;

use App\Models\FirmMember;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class FirmMemberService
{
    /**
     * Search for invitable professionals by unique_code or name.
     * Auto-filters target roles based on firm owner type.
     */
    public function search(User $owner, string $query, string $sort = 'a-z'): Collection
    {
        $targetRoles = $this->getTargetRoles($owner);
        $direction = $sort === 'z-a' ? 'desc' : 'asc';

        $users = User::whereIn('role_type', $targetRoles)
            ->where('id', '!=', $owner->id)
            ->where(function ($q) use ($query) {
                $q->where('unique_code', strtoupper($query))
                  ->orWhere('name', 'LIKE', "%{$query}%");
            })
            ->orderBy('name', $direction)
            ->limit(20)
            ->get(['id', 'name', 'unique_code', 'role_type', 'pic']);

        $users->each(function ($u) {
            if ($u->pic && !str_starts_with($u->pic, 'http')) {
                $u->pic = asset('storage/' . $u->pic);
            }
        });

        return $users;
    }

    /**
     * Return top professionals (by experience) as suggestions for the invite modal.
     */
    public function getSuggestions(User $owner, int $limit = 10): Collection
    {
        $targetRoles = $this->getTargetRoles($owner);

        $existingIds = FirmMember::where('firm_owner_id', $owner->id)
            ->whereIn('status', ['invited', 'active', 'requested'])
            ->pluck('member_user_id');

        $users = User::whereIn('role_type', $targetRoles)
            ->where('id', '!=', $owner->id)
            ->whereNotIn('id', $existingIds)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get(['id', 'name', 'unique_code', 'role_type', 'pic']);

        $users->each(function ($u) {
            if ($u->pic && !str_starts_with($u->pic, 'http')) {
                $u->pic = asset('storage/' . $u->pic);
            }
        });

        return $users;
    }

    public function invite(User $owner, int $memberUserId, array $rolesInFirm): Collection
    {
        return DB::transaction(function () use ($owner, $memberUserId, $rolesInFirm): Collection {
            $createdMembers = new Collection();

            foreach ($rolesInFirm as $roleInFirm) {
                $existing = FirmMember::where('firm_owner_id', $owner->id)
                    ->where('member_user_id', $memberUserId)
                    ->where('role_in_firm', $roleInFirm)
                    ->whereIn('status', ['invited', 'active', 'requested'])
                    ->first();

                if (!$existing) {
                    $createdMembers->push(FirmMember::create([
                        'firm_owner_id'  => $owner->id,
                        'member_user_id' => $memberUserId,
                        'role_in_firm'   => $roleInFirm,
                        'status'         => 'invited',
                        'invited_at'     => now(),
                    ]));
                }
            }

            if ($createdMembers->isEmpty()) {
                abort(409, 'This professional already holds the selected role(s) in your firm.');
            }

            return $createdMembers;
        });
    }

    /**
     * Accept or decline a firm invitation (or join request from owner side).
     */
    public function respond(FirmMember $firmMember, string $action): FirmMember
    {
        return DB::transaction(function () use ($firmMember, $action): FirmMember {
            if ($action === 'accept') {
                $firmMember->update([
                    'status'      => 'active',
                    'accepted_at' => now(),
                ]);

                return $firmMember->fresh();
            }

            // Decline — soft remove
            $firmMember->update(['status' => 'removed']);

            return $firmMember->fresh();
        });
    }

    /** Get the firm owner's roster with eager-loaded member data. */
    public function getRoster(User $owner): Collection
    {
        $roster = FirmMember::where('firm_owner_id', $owner->id)
            ->whereIn('status', ['invited', 'active', 'requested'])
            ->with([
                'member:id,name,unique_code,role_type,pic',
                'member.structural_engineer',
                'member.mep_engineer',
                'member.interior_profile',
                'member.kontraktor',
                'member.portfolios',
            ])
            ->orderBy('created_at', 'desc')
            ->get();

        $memberIds = $roster->pluck('member_user_id')->filter()->toArray();
        $subPros = \App\Models\ProjectSubProfessional::whereIn('user_id', $memberIds)
            ->where('status', 'active')
            ->with('project:id,title')
            ->get()
            ->groupBy('user_id');

        // Append phone number and active projects to member data
        $roster->each(function (FirmMember $fm) use ($subPros) {
            if (!$fm->member) {
                return;
            }
            $profile = $fm->member->structural_engineer
                ?? $fm->member->mep_engineer
                ?? $fm->member->interior_profile
                ?? $fm->member->kontraktor;

            $phone = $profile?->no_telp ?? $profile?->no_telepon ?? null;
            $fm->member->setAttribute('no_telp', $phone);

            // Append extra profile details for UI display
            $fm->member->setAttribute('verification_status', $profile?->verification_status ?? 'unverified');
            $fm->member->setAttribute('rate_harga', (float)($profile?->rate_harga ?? 0));
            $fm->member->setAttribute('pengalaman_tahun', (int)($profile?->pengalaman_tahun ?? $profile?->pengalaman ?? 0));
            $fm->member->setAttribute('deskripsi', $profile?->deskripsi ?? '');
            $fm->member->setAttribute('lokasi', $profile?->lokasi ?? $profile?->alamat ?? '');
            $fm->member->setAttribute('entity_type', $profile?->entity_type ?? 'individual');

            if ($fm->member->pic && !str_starts_with($fm->member->pic, 'http')) {
                $fm->member->pic = asset('storage/' . $fm->member->pic);
            }

            // 1. Get projects from sub-professional assignments
            $subProjects = $subPros->get($fm->member_user_id) ?: collect();
            $subTitles = $subProjects->map(fn($sp) => $sp->project?->title)->filter();

            // 2. Get projects where they are directly assigned as the primary expert
            $primaryTitles = collect();
            if ($profile) {
                $role = $fm->member->role_type;
                $query = \App\Models\Project::whereNotIn('status', ['completed', 'cancelled']);

                if ($role === 'structural') {
                    $primaryTitles = $query->where('structural_id', $profile->id)->pluck('title');
                } elseif ($role === 'mep') {
                    $primaryTitles = $query->where('mep_id', $profile->id)->pluck('title');
                } elseif ($role === 'interior') {
                    $primaryTitles = $query->where('selected_interior_id', $profile->id)->pluck('title');
                } elseif ($role === 'kontraktor') {
                    $primaryTitles = $query->where('selected_kontraktor_id', $profile->id)->pluck('title');
                } elseif ($role === 'arsitek') {
                    $primaryTitles = $query->where('selected_arsitek_id', $profile->id)->pluck('title');
                }
            }

            // Merge and get unique titles
            $allActiveProjects = $subTitles->concat($primaryTitles)->unique()->values()->toArray();

            $fm->setAttribute('active_projects_count', count($allActiveProjects));
            $fm->setAttribute('active_projects', $allActiveProjects);
        });

        return $roster;
    }

    /**
     * Resend a pending firm invitation.
     */
    public function resendInvitation(FirmMember $firmMember): FirmMember
    {
        if ($firmMember->status !== 'invited') {
            abort(400, 'Only pending invitations can be resent.');
        }

        return DB::transaction(function () use ($firmMember): FirmMember {
            $firmMember->update([
                'invited_at' => now(),
            ]);
            return $firmMember->fresh();
        });
    }

    /**
     * Cancel a pending firm invitation.
     */
    public function cancelInvitation(FirmMember $firmMember): bool
    {
        if ($firmMember->status !== 'invited') {
            abort(400, 'Only pending invitations can be cancelled.');
        }

        return DB::transaction(function () use ($firmMember): bool {
            return (bool) $firmMember->delete();
        });
    }

    /**
     * Remove a member from the active firm roster.
     */
    public function removeMember(FirmMember $firmMember): FirmMember
    {
        if ($firmMember->status !== 'active') {
            abort(400, 'Only active members can be removed.');
        }

        return DB::transaction(function () use ($firmMember): FirmMember {
            $firmMember->update([
                'status' => 'removed'
            ]);
            return $firmMember->fresh();
        });
    }

    /** Get pending firm invitations for a specialist. */
    public function getInvitations(User $member): Collection
    {
        $invitations = FirmMember::where('member_user_id', $member->id)
            ->invited()
            ->with([
                'firmOwner:id,name,role_type,pic',
                'firmOwner.arsitek:id,user_id,no_telp',
                'firmOwner.kontraktor:id,user_id,no_telepon',
            ])
            ->orderBy('invited_at', 'desc')
            ->get();

        $invitations->each(function (FirmMember $fm) {
            if (!$fm->firmOwner) return;
            $profile = $fm->firmOwner->arsitek ?? $fm->firmOwner->kontraktor;
            $phone = $profile?->no_telp ?? $profile?->no_telepon ?? null;
            $fm->firmOwner->setAttribute('no_telp', $phone);

            if ($fm->firmOwner->pic && !str_starts_with($fm->firmOwner->pic, 'http')) {
                $fm->firmOwner->pic = asset('storage/' . $fm->firmOwner->pic);
            }
        });

        return $invitations;
    }

    /** Get firms a specialist has been accepted into. */
    public function getMyFirms(User $member): Collection
    {
        $firms = FirmMember::where('member_user_id', $member->id)
            ->active()
            ->with([
                'firmOwner:id,name,role_type,pic',
                'firmOwner.arsitek:id,user_id,no_telp',
                'firmOwner.kontraktor:id,user_id,no_telepon',
            ])
            ->orderBy('accepted_at', 'desc')
            ->get();

        $firms->each(function (FirmMember $fm) {
            if (!$fm->firmOwner) return;
            $profile = $fm->firmOwner->arsitek ?? $fm->firmOwner->kontraktor;
            $phone = $profile?->no_telp ?? $profile?->no_telepon ?? null;
            $fm->firmOwner->setAttribute('no_telp', $phone);

            if ($fm->firmOwner->pic && !str_starts_with($fm->firmOwner->pic, 'http')) {
                $fm->firmOwner->pic = asset('storage/' . $fm->firmOwner->pic);
            }
        });

        return $firms;
    }

    /** Specialist requests to join a firm owner. */
    public function requestToJoin(User $specialist, int $firmOwnerId, string $roleInFirm): FirmMember
    {
        $existing = FirmMember::where('firm_owner_id', $firmOwnerId)
            ->where('member_user_id', $specialist->id)
            ->whereIn('status', ['invited', 'active', 'requested'])
            ->first();

        if ($existing) {
            abort(409, 'You already have a pending connection with this firm.');
        }

        return DB::transaction(function () use ($specialist, $firmOwnerId, $roleInFirm): FirmMember {
            return FirmMember::create([
                'firm_owner_id'  => $firmOwnerId,
                'member_user_id' => $specialist->id,
                'role_in_firm'   => $roleInFirm,
                'status'         => 'requested',
                'requested_at'   => now(),
            ]);
        });
    }

    /** Get pending join requests for a firm owner. */
    public function getJoinRequests(User $owner): Collection
    {
        $requests = FirmMember::where('firm_owner_id', $owner->id)
            ->requested()
            ->with('member:id,name,unique_code,role_type,pic')
            ->orderBy('requested_at', 'desc')
            ->get();

        $requests->each(function (FirmMember $fm) {
            if ($fm->member && $fm->member->pic && !str_starts_with($fm->member->pic, 'http')) {
                $fm->member->pic = asset('storage/' . $fm->member->pic);
            }
        });

        return $requests;
    }

    /** @return string[] */
    private function getTargetRoles(User $owner): array
    {
        return match ($owner->role_type) {
            'arsitek'    => ['structural', 'mep', 'interior'],
            'kontraktor' => ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'],
            default      => [],
        };
    }
}
