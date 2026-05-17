<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\House;
use App\Models\Kontraktor;
use App\Models\Project;
use App\Models\User;

class AdminDashboardController extends Controller
{
    public function stats()
    {
        return response()->json([
            'total_users' => User::count(),
            'total_houses' => House::count(),
            'total_projects' => Project::count(),
            'pending_verifications' => Arsitek::where('verification_status', 'pending')->count() + Kontraktor::where('verification_status', 'pending')->count(),
            'active_projects' => Project::where('status', 'active')->count(),
            'recent_users' => User::latest()->take(5)->get(),
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
}
