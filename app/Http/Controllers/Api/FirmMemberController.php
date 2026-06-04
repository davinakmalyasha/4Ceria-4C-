<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FirmMemberInviteRequest;
use App\Http\Requests\FirmMemberSearchRequest;
use App\Models\FirmMember;
use App\Models\User;
use App\Services\FirmMemberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FirmMemberController extends Controller
{
    public function __construct(private readonly FirmMemberService $service)
    {
    }

    public function search(FirmMemberSearchRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $results = $this->service->search(
            Auth::user(),
            $validated['query'],
            $validated['sort'] ?? 'a-z'
        );

        return response()->json(['data' => $results]);
    }

    public function suggestions(): JsonResponse
    {
        $user = Auth::user();

        if (!in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            return response()->json(['data' => []]);
        }

        return response()->json(['data' => $this->service->getSuggestions($user)]);
    }

    public function invite(FirmMemberInviteRequest $request): JsonResponse
    {
        $validated = $request->validated();

        try {
            $firmMembers = $this->service->invite(
                Auth::user(),
                (int) $validated['member_user_id'],
                $validated['roles_in_firm']
            );

            // Load member data for the first item to get the name for the success message
            $firstMember = $firmMembers->first()->load('member:id,name');

            return response()->json([
                'message' => "Invitations sent to {$firstMember->member->name}",
                'data'    => $firmMembers,
            ], 201);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }
    }

    public function respond(FirmMember $firmMember, Request $request): JsonResponse
    {
        $user = Auth::user();
        $isOwner = (int) $firmMember->firm_owner_id === (int) $user->id;
        $isMember = (int) $firmMember->member_user_id === (int) $user->id;

        if (!$isOwner && !$isMember) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'action' => ['required', 'in:accept,decline'],
        ]);

        $updated = $this->service->respond($firmMember, $validated['action']);

        $message = $validated['action'] === 'accept'
            ? ($isOwner ? 'Join request accepted.' : 'You have joined the firm.')
            : ($isOwner ? 'Join request declined.' : 'Invitation declined.');

        return response()->json(['message' => $message, 'data' => $updated]);
    }

    public function index(): JsonResponse
    {
        $user = Auth::user();

        if (in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            return response()->json(['data' => $this->service->getRoster($user)]);
        }

        return response()->json(['data' => []]);
    }

    public function invitations(): JsonResponse
    {
        return response()->json([
            'data' => $this->service->getInvitations(Auth::user()),
        ]);
    }

    public function myFirms(): JsonResponse
    {
        return response()->json([
            'data' => $this->service->getMyFirms(Auth::user()),
        ]);
    }

    public function requestJoin(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'firm_owner_id' => ['required', 'integer', 'exists:users,id'],
            'role_in_firm'  => ['required', 'string', 'max:50'],
        ]);

        try {
            $firmMember = $this->service->requestToJoin(
                Auth::user(),
                (int) $validated['firm_owner_id'],
                $validated['role_in_firm']
            );

            return response()->json([
                'message' => 'Join request sent successfully.',
                'data'    => $firmMember,
            ], 201);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }
    }

    public function joinRequests(): JsonResponse
    {
        $user = Auth::user();

        if (!in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            return response()->json(['data' => []]);
        }

        return response()->json([
            'data' => $this->service->getJoinRequests($user),
        ]);
    }

    public function browseFirmOwners(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['nullable', 'string', 'max:50'],
        ]);

        $queryStr = $validated['query'] ?? null;

        $dbQuery = User::whereIn('role_type', ['arsitek', 'kontraktor'])
            ->where('id', '!=', Auth::id());

        if ($queryStr && strlen($queryStr) >= 2) {
            $dbQuery->where(function ($q) use ($queryStr) {
                $cleanQuery = ltrim($queryStr, '#');
                $q->where('unique_code', strtoupper($cleanQuery))
                  ->orWhere('name', 'LIKE', "%{$queryStr}%");
            });
        } else {
            // Default to only hiring firms
            $dbQuery->where('firm_is_hiring', true);
        }

        $userId = Auth::id();

        $results = $dbQuery->limit(20)
            ->with(['firmRoster' => function ($q) use ($userId) {
                $q->where('member_user_id', $userId);
            }])
            ->get([
                'id', 
                'name', 
                'role_type', 
                'pic', 
                'firm_name', 
                'firm_slogan', 
                'firm_banner_path', 
                'firm_description', 
                'firm_is_hiring', 
                'firm_needed_roles'
            ]);

        $results->each(function ($u) use ($userId) {
            $u->firm_banner_url = $u->firm_banner_path ? asset('storage/' . $u->firm_banner_path) : null;
            if ($u->pic && !str_starts_with($u->pic, 'http')) {
                $u->pic = asset('storage/' . $u->pic);
            }
            $membership = $u->firmRoster->first();
            $u->currentUserMembershipStatus = $membership ? $membership->status : null;
            $u->unsetRelation('firmRoster');
        });

        return response()->json(['data' => $results]);
    }

    public function resend(FirmMember $firmMember): JsonResponse
    {
        if ((int)$firmMember->firm_owner_id !== (int)Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $updated = $this->service->resendInvitation($firmMember);

        return response()->json([
            'message' => 'Invitation resent successfully.',
            'data' => $updated
        ]);
    }

    public function cancel(FirmMember $firmMember): JsonResponse
    {
        if ((int)$firmMember->firm_owner_id !== (int)Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $this->service->cancelInvitation($firmMember);

        return response()->json([
            'message' => 'Invitation cancelled successfully.'
        ]);
    }

    public function remove(FirmMember $firmMember): JsonResponse
    {
        if ((int)$firmMember->firm_owner_id !== (int)Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $updated = $this->service->removeMember($firmMember);

        return response()->json([
            'message' => 'Member offboarded successfully.',
            'data' => $updated
        ]);
    }

    public function quickAssign(Request $request): JsonResponse
    {
        $user = Auth::user();
        
        $validated = $request->validate([
            'member_user_id' => ['required', 'integer', 'exists:users,id'],
            'project_id'     => ['required', 'integer', 'exists:projects,id'],
            'sub_role'       => ['required', 'string', 'max:50'],
            'rate'           => ['required', 'numeric', 'min:0'],
            'description'    => ['nullable', 'string', 'max:500'],
        ]);

        // R1: Security Gates
        // 1. Is the specialist an active member of this owner's firm with this exact capability/role?
        $firmMember = FirmMember::where('firm_owner_id', $user->id)
            ->where('member_user_id', $validated['member_user_id'])
            ->where('role_in_firm', $validated['sub_role'])
            ->active()
            ->first();

        if (!$firmMember) {
            return response()->json(['message' => 'The selected specialist does not hold this active role in your firm roster.'], 403);
        }

        // 2. Is the owner hired on the target project?
        $project = \App\Models\Project::findOrFail($validated['project_id']);
        $isHired = false;
        
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id == optional($user->arsitek)->id) $isHired = true;
        if ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id == optional($user->kontraktor)->id) $isHired = true;
        if ($user->role_type === 'project_manager' && $project->pm_id === $user->id) $isHired = true;

        if (!$isHired) {
            return response()->json(['message' => 'Unauthorized. You must be the hired lead professional on this project.'], 403);
        }

        // 3. Has this assignment proposal already been submitted or approved?
        $exists = \App\Models\ProjectAddendum::where('project_id', $validated['project_id'])
            ->where('assigned_user_id', $validated['member_user_id'])
            ->where('specialist_type', $validated['sub_role'])
            ->whereIn('status', ['pending_approval', 'approved'])
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'An assignment proposal for this specialist and capability is already pending or active on this project.'], 409);
        }

        // 4. Has this core specialist role already been filled on the project? (If structural/mep)
        if ($validated['sub_role'] === 'structural' && $project->structural_id) {
            return response()->json(['message' => 'Structural Engineer is already assigned to this project.'], 409);
        }
        if ($validated['sub_role'] === 'mep' && $project->mep_id) {
            return response()->json(['message' => 'MEP Engineer is already assigned to this project.'], 409);
        }

        // Create the specialist assignment addendum
        $addendum = \Illuminate\Support\Facades\DB::transaction(function () use ($project, $user, $validated) {
            return \App\Models\ProjectAddendum::create([
                'project_id'       => $project->id,
                'role_type'        => $user->role_type,
                'user_id'          => $user->id,
                'title'            => "Specialist Assignment: " . strtoupper(str_replace('_', ' ', $validated['sub_role'])),
                'amount'           => $validated['rate'],
                'description'      => $validated['description'] ?? 'Assigned directly from firm roster.',
                'type'             => 'specialist_assignment',
                'assigned_user_id' => $validated['member_user_id'],
                'specialist_type'  => $validated['sub_role'],
                'status'           => 'pending_approval',
            ]);
        });

        return response()->json([
            'message' => 'Specialist assignment proposal submitted to project owner.',
            'data'    => $addendum,
        ], 201);
    }

    public function getProfile(Request $request, $ownerId): JsonResponse
    {
        $owner = User::whereIn('role_type', ['arsitek', 'kontraktor'])
            ->where('id', $ownerId)
            ->first();

        if (!$owner) {
            return response()->json(['message' => 'Firm not found.'], 404);
        }

        $profile = $owner->arsitek ?? $owner->kontraktor;

        // Fetch roster using service
        $roster = $this->service->getRoster($owner);

        // Fetch portfolio items
        $portfolios = \App\Models\ProfessionalPortfolio::where('user_id', $owner->id)
            ->latest()
            ->get();

        return response()->json([
            'owner' => [
                'id' => $owner->id,
                'name' => $owner->name,
                'username' => $owner->username,
                'pic' => $owner->pic ? asset('storage/' . $owner->pic) : null,
                'role_type' => $owner->role_type,
                'unique_code' => $owner->unique_code,
            ],
            'firm_name' => $owner->firm_name ?? ($owner->role_type === 'arsitek' ? ($owner->arsitek->company_name ?? $owner->name) : ($owner->kontraktor->company_name ?? $owner->name)),
            'firm_slogan' => $owner->firm_slogan,
            'firm_banner_url' => $owner->firm_banner_path ? asset('storage/' . $owner->firm_banner_path) : null,
            'firm_description' => $owner->firm_description ?? ($profile?->deskripsi ?? ''),
            'firm_is_hiring' => (bool)$owner->firm_is_hiring,
            'firm_needed_roles' => $owner->firm_needed_roles ?? [],
            'stats' => [
                'experience_years' => (int)($profile?->pengalaman_tahun ?? ($profile?->pengalaman ?? 0)),
                'base_rate' => (float)($profile?->rate_harga ?? 0),
                'average_rating' => (float)($profile?->average_rating ?? 0),
                'review_count' => (int)($profile?->review_count ?? 0),
                'active_members_count' => FirmMember::where('firm_owner_id', $owner->id)->active()->count(),
            ],
            'roster' => $roster,
            'portfolios' => $portfolios,
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (!in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'firm_name' => ['nullable', 'string', 'max:100'],
            'firm_slogan' => ['nullable', 'string', 'max:150'],
            'firm_description' => ['nullable', 'string', 'max:1000'],
            'firm_banner' => ['nullable', 'image', 'max:5120'], // 5MB max
            'firm_logo' => ['nullable', 'image', 'max:2048'],   // 2MB max
            'base_rate' => ['nullable', 'numeric', 'min:0'],
            'experience_years' => ['nullable', 'integer', 'min:0'],
            'firm_is_hiring' => ['nullable'],
            'firm_needed_roles' => ['nullable'],
        ]);

        $updatedUser = \Illuminate\Support\Facades\DB::transaction(function () use ($user, $validated, $request) {
            $user->firm_name = $validated['firm_name'] ?? $user->firm_name;
            $user->firm_slogan = $validated['firm_slogan'] ?? $user->firm_slogan;
            $user->firm_description = $validated['firm_description'] ?? $user->firm_description;

            if ($request->has('firm_is_hiring')) {
                $user->firm_is_hiring = filter_var($request->input('firm_is_hiring'), FILTER_VALIDATE_BOOLEAN);
            }
            if ($request->has('firm_needed_roles')) {
                $rolesVal = $request->input('firm_needed_roles');
                if (is_string($rolesVal)) {
                    $user->firm_needed_roles = json_decode($rolesVal, true) ?? [];
                } else {
                    $user->firm_needed_roles = $rolesVal;
                }
            }

            if ($request->hasFile('firm_banner')) {
                if ($user->firm_banner_path) {
                    \Illuminate\Support\Facades\Storage::disk('public')->delete($user->firm_banner_path);
                }
                $user->firm_banner_path = $request->file('firm_banner')->store('firm_banners', 'public');
            }

            if ($request->hasFile('firm_logo')) {
                if ($user->pic) {
                    \Illuminate\Support\Facades\Storage::disk('public')->delete($user->pic);
                }
                $user->pic = $request->file('firm_logo')->store('avatars', 'public');
            }

            $user->save();

            // Update associated professional profile
            if ($request->has('base_rate') || $request->has('experience_years')) {
                $profUpdate = [];
                if ($request->has('base_rate')) {
                    $profUpdate['rate_harga'] = $validated['base_rate'];
                }
                
                if ($user->role_type === 'arsitek' && $user->arsitek) {
                    if ($request->has('experience_years')) {
                        $profUpdate['pengalaman_tahun'] = $validated['experience_years'];
                    }
                    $user->arsitek->update($profUpdate);
                } elseif ($user->role_type === 'kontraktor' && $user->kontraktor) {
                    if ($request->has('experience_years')) {
                        $profUpdate['pengalaman'] = $validated['experience_years'];
                    }
                    $user->kontraktor->update($profUpdate);
                }
            }

            return $user;
        });

        // Sync to professional company_name as well if applicable
        if ($updatedUser->firm_name) {
            if ($updatedUser->arsitek) {
                $updatedUser->arsitek->update(['company_name' => $updatedUser->firm_name]);
            }
            if ($updatedUser->kontraktor) {
                $updatedUser->kontraktor->update(['company_name' => $updatedUser->firm_name]);
            }
        }

        return response()->json([
            'message' => 'Firm squad profile updated successfully.',
            'user' => $updatedUser,
        ]);
    }
}
