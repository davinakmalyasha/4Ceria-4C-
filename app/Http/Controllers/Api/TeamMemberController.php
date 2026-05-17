<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class TeamMemberController extends Controller
{
    public function index(): JsonResponse
    {
        $user = Auth::user();

        if (!$user || !in_array($user->role_type, ['arsitek', 'kontraktor', 'structural', 'mep', 'interior', 'project_manager', 'admin'])) {
            return response()->json(['data' => []]);
        }

        $members = TeamMember::where('owner_user_id', $user->id)
            ->active()
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $members]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = Auth::user();

        if (!in_array($user->role_type, ['arsitek', 'kontraktor', 'structural', 'mep', 'interior'])) {
            return response()->json(['message' => 'Unauthorized role for team management.'], 403);
        }

        $validated = $request->validate([
            'name'       => 'required|string|max:255',
            'role_title' => 'required|string|max:100',
            'photo'      => 'nullable|image|max:2048',
            'bio'        => 'nullable|string|max:1000',
            'skills'     => 'nullable|array',
            'skills.*'   => 'string|max:50',
            'phone'      => 'nullable|string|max:20',
            'email'      => 'nullable|email|max:255',
        ]);

        return DB::transaction(function () use ($user, $validated, $request) {
            $photoPath = null;
            if ($request->hasFile('photo')) {
                $photoPath = $request->file('photo')->store('team-members', 'public');
            }

            $member = TeamMember::create([
                'owner_user_id' => $user->id,
                'owner_role'    => $user->role_type,
                'name'          => $validated['name'],
                'photo_path'    => $photoPath,
                'role_title'    => $validated['role_title'],
                'bio'           => $validated['bio'] ?? null,
                'skills'        => $validated['skills'] ?? [],
                'phone'         => $validated['phone'] ?? null,
                'email'         => $validated['email'] ?? null,
            ]);

            return response()->json(['data' => $member, 'message' => 'Team member added.'], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();
        $member = TeamMember::where('owner_user_id', $user->id)->findOrFail($id);

        $validated = $request->validate([
            'name'       => 'required|string|max:255',
            'role_title' => 'required|string|max:100',
            'photo'      => 'nullable|image|max:2048',
            'bio'        => 'nullable|string|max:1000',
            'skills'     => 'nullable|array',
            'skills.*'   => 'string|max:50',
            'phone'      => 'nullable|string|max:20',
            'email'      => 'nullable|email|max:255',
        ]);

        return DB::transaction(function () use ($member, $validated, $request) {
            if ($request->hasFile('photo')) {
                if ($member->photo_path) {
                    Storage::disk('public')->delete($member->photo_path);
                }
                $validated['photo_path'] = $request->file('photo')->store('team-members', 'public');
            }
            unset($validated['photo']);

            $member->update($validated);

            return response()->json(['data' => $member->fresh(), 'message' => 'Team member updated.']);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        $user = Auth::user();
        $member = TeamMember::where('owner_user_id', $user->id)->findOrFail($id);

        $member->update(['status' => 'inactive']);

        return response()->json(['message' => 'Team member removed.']);
    }
}
