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
            'query' => ['required', 'string', 'min:2', 'max:50'],
        ]);

        $results = User::whereIn('role_type', ['arsitek', 'kontraktor'])
            ->where('id', '!=', Auth::id())
            ->where('name', 'LIKE', "%{$validated['query']}%")
            ->limit(15)
            ->get(['id', 'name', 'role_type', 'pic']);

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
}
