<?php

namespace App\Services;

use App\Models\FirmMember;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class FirmMemberService
{
    /**
     * Search for invitable professionals by unique_code or name.
     * Auto-filters target roles based on firm owner type.
     */
    public function search(User $owner, string $query, string $sort = 'a-z'): Collection
    {
        $targetRoles = match ($owner->role_type) {
            'arsitek'    => ['structural', 'mep', 'interior'],
            'kontraktor' => ['kontraktor'],
            default      => [],
        };

        $direction = $sort === 'z-a' ? 'desc' : 'asc';

        return User::whereIn('role_type', $targetRoles)
            ->where('id', '!=', $owner->id)
            ->where(function ($q) use ($query) {
                $q->where('unique_code', strtoupper($query))
                  ->orWhere('name', 'LIKE', "%{$query}%");
            })
            ->orderBy('name', $direction)
            ->limit(20)
            ->get(['id', 'name', 'unique_code', 'role_type', 'pic']);
    }

    /**
     * Invite a professional to join the firm.
     */
    public function invite(User $owner, int $memberUserId, string $roleInFirm): FirmMember
    {
        $existing = FirmMember::where('firm_owner_id', $owner->id)
            ->where('member_user_id', $memberUserId)
            ->whereIn('status', ['invited', 'active'])
            ->first();

        if ($existing) {
            abort(409, 'This professional is already in your firm.');
        }

        return DB::transaction(function () use ($owner, $memberUserId, $roleInFirm): FirmMember {
            return FirmMember::create([
                'firm_owner_id'  => $owner->id,
                'member_user_id' => $memberUserId,
                'role_in_firm'   => $roleInFirm,
                'status'         => 'invited',
                'invited_at'     => now(),
            ]);
        });
    }

    /**
     * Accept or decline a firm invitation.
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
        return FirmMember::where('firm_owner_id', $owner->id)
            ->whereIn('status', ['invited', 'active'])
            ->with('member:id,name,unique_code,role_type,pic')
            ->orderBy('created_at', 'desc')
            ->get();
    }

    /** Get pending firm invitations for a specialist. */
    public function getInvitations(User $member): Collection
    {
        return FirmMember::where('member_user_id', $member->id)
            ->invited()
            ->with('firmOwner:id,name,role_type,pic')
            ->orderBy('invited_at', 'desc')
            ->get();
    }
}
