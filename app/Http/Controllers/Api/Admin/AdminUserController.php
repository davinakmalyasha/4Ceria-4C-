<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AdminUserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::with('roles');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('username', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->filled('role')) {
            $query->where('role_type', $request->role);
        }

        if ($request->filled('status')) {
            $status = $request->status === 'suspended';
            $query->where('is_suspended', $status);
        }

        return response()->json($query->latest()->paginate(20));
    }

    public function toggleSuspend(User $user)
    {
        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'You cannot suspend your own account.'], 400);
        }

        $user->update([
            'is_suspended' => !$user->is_suspended
        ]);

        Cache::forget('admin_dashboard_stats');

        return response()->json([
            'message' => $user->is_suspended ? 'User account suspended successfully.' : 'User account activated successfully.',
            'user' => $user->load('roles')
        ]);
    }

    public function updateRole(Request $request, User $user)
    {
        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'You cannot change your own role.'], 400);
        }

        $validated = $request->validate([
            'role_type' => 'required|in:user,arsitek,kontraktor,admin,notaris,interior,structural,mep,project_manager,supplier,logistics,civil,mechanical,electrical,plumbing,roofing,finishing'
        ]);

        $user->syncRoles([$validated['role_type']]);
        $user->update(['role_type' => $validated['role_type']]);

        Cache::forget('admin_dashboard_stats');

        return response()->json([
            'message' => 'User role updated successfully.',
            'user' => $user->load('roles')
        ]);
    }
}
