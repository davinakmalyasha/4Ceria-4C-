<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\House;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AdminDashboardController extends Controller
{
    public function stats()
    {
        $stats = Cache::remember('admin_dashboard_stats', 600, function () {
            $roles = User::selectRaw('role_type, count(*) as total')
                ->groupBy('role_type')
                ->pluck('total', 'role_type');

            return [
                'total_users' => User::count(),
                'total_houses' => House::count(),
                'total_projects' => Project::count(),
                'pending_verifications' => Arsitek::where('verification_status', 'pending')->count() + 
                                         Kontraktor::where('verification_status', 'pending')->count() + 
                                         \App\Models\ProjectManager::where('verification_status', 'pending')->count() + 
                                         \App\Models\StructuralEngineer::where('verification_status', 'pending')->count() + 
                                         \App\Models\MepEngineer::where('verification_status', 'pending')->count() + 
                                         \App\Models\Supplier::where('verification_status', 'pending')->count() + 
                                         \App\Models\InteriorProfile::where('verification_status', 'pending')->count() + 
                                         \App\Models\NotarisProfile::where('verification_status', 'pending')->count(),
                // "Active operations" = anything not in a terminal state.
                // ('active' is not part of the project status vocabulary.)
                'active_projects' => Project::whereNotIn('status', ['completed', 'cancelled', 'terminated'])->count(),
                'role_distribution' => [
                    'client' => (int) $roles->get('user', 0),
                    'arsitek' => (int) $roles->get('arsitek', 0),
                    'kontraktor' => (int) $roles->get('kontraktor', 0),
                    'supplier' => (int) $roles->get('supplier', 0),
                    'notaris' => (int) $roles->get('notaris', 0),
                    'interior' => (int) $roles->get('interior', 0),
                    'project_manager' => (int) $roles->get('project_manager', 0),
                ]
            ];
        });

        return response()->json($stats);
    }

    public function houses(Request $request)
    {
        $query = House::with('user');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%");
                  });
            });
        }

        return response()->json($query->latest()->paginate(15));
    }

    public function projects(Request $request)
    {
        $query = Project::with(['user', 'selectedArsitek', 'selectedKontraktor']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%");
                  });
            });
        }

        return response()->json($query->latest()->paginate(15));
    }

    public function toggleHouseSuspend($id)
    {
        $house = House::findOrFail($id);
        $house->update([
            'is_suspended' => !$house->is_suspended
        ]);

        Cache::forget('admin_dashboard_stats');

        return response()->json([
            'message' => $house->is_suspended ? 'Listing suspended successfully.' : 'Listing activated successfully.',
            'house' => $house->load('user')
        ]);
    }

    public function terminateProject(Request $request, $id)
    {
        $project = Project::findOrFail($id);
        $project->update([
            'status' => 'cancelled'
        ]);

        Cache::forget('admin_dashboard_stats');

        return response()->json([
            'message' => 'Project forced terminated by Administrator.',
            'project' => $project->load(['user', 'selectedArsitek', 'selectedKontraktor'])
        ]);
    }
}
