<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FirmMemberInviteRequest;
use App\Http\Requests\FirmMemberSearchRequest;
use App\Models\FirmMember;
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

    public function invite(FirmMemberInviteRequest $request): JsonResponse
    {
        $validated = $request->validated();

        try {
            $firmMember = $this->service->invite(
                Auth::user(),
                (int) $validated['member_user_id'],
                $validated['role_in_firm']
            );

            $firmMember->load('member:id,name');

            return response()->json([
                'message' => "Invitation sent to {$firmMember->member->name}",
                'data'    => $firmMember,
            ], 201);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }
    }

    public function respond(FirmMember $firmMember, Request $request): JsonResponse
    {
        if ((int) $firmMember->member_user_id !== (int) Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'action' => ['required', 'in:accept,decline'],
        ]);

        $updated = $this->service->respond($firmMember, $validated['action']);

        $message = $validated['action'] === 'accept'
            ? 'You have joined the firm.'
            : 'Invitation declined.';

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
}
