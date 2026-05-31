<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\House;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;

class AdminDashboardController extends Controller
{
    public function stats()
    {
        return response()->json([
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
            'active_projects' => Project::where('status', 'active')->count(),
            'role_distribution' => [
                'client' => User::where('role_type', 'user')->count(),
                'arsitek' => User::where('role_type', 'arsitek')->count(),
                'kontraktor' => User::where('role_type', 'kontraktor')->count(),
                'supplier' => User::where('role_type', 'supplier')->count(),
                'notaris' => User::where('role_type', 'notaris')->count(),
                'interior' => User::where('role_type', 'interior')->count(),
                'project_manager' => User::where('role_type', 'project_manager')->count(),
            ]
        ]);
    }

    public function houses()
    {
        return response()->json(House::with('user')->latest()->get());
    }

    public function projects()
    {
        return response()->json(Project::with(['user', 'selectedArsitek', 'selectedKontraktor'])->latest()->get());
    }

    public function toggleHouseSuspend($id)
    {
        $house = House::findOrFail($id);
        $house->update([
            'is_suspended' => !$house->is_suspended
        ]);

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

        return response()->json([
            'message' => 'Project forced terminated by Administrator.',
            'project' => $project->load(['user', 'selectedArsitek', 'selectedKontraktor'])
        ]);
    }
}
