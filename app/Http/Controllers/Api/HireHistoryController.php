<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class HireHistoryController extends Controller
{
    /**
     * Fetch all hired professionals for the authenticated user across all projects.
     */
    public function index()
    {
        $user = Auth::user();
        
        // Fetch all projects owned by the user with their hired professionals
        $projects = Project::where('user_id', $user->id)
            ->with([
                'arsitek.user.phoneNumber',
                'kontraktor.user.phoneNumber',
                'notaris.user.phoneNumber',
                'interior.user.phoneNumber',
                'projectManager.user.phoneNumber',
                'structuralEngineer.user.phoneNumber',
                'mepEngineer.user.phoneNumber'
            ])
            ->latest()
            ->limit(100)
            ->get();

        $hiredList = [];

        foreach ($projects as $project) {
            // Check each role and add to list if hired
            $this->addProfessionalToList($hiredList, $project->arsitek, 'Architect', $project->title);
            $this->addProfessionalToList($hiredList, $project->kontraktor, 'Contractor', $project->title);
            $this->addProfessionalToList($hiredList, $project->notaris, 'Notary', $project->title);
            $this->addProfessionalToList($hiredList, $project->interior, 'Interior Designer', $project->title);
            $this->addProfessionalToList($hiredList, $project->projectManager, 'Project Manager', $project->title);
            $this->addProfessionalToList($hiredList, $project->structuralEngineer, 'Structural Engineer', $project->title);
            $this->addProfessionalToList($hiredList, $project->mepEngineer, 'MEP Engineer', $project->title);
        }

        // Remove duplicates if the same professional is hired for different projects (or keep them if user wants per-project history)
        // User said "who have they hire before", so maybe unique professionals?
        // But "each hire page have the hire history" suggests per-project or per-hire.
        // Let's keep it per-hire for now so they see which project they worked on.

        return response()->json([
            'success' => true,
            'data' => $hiredList
        ]);
    }

    /**
     * Helper to map professional profiles to a standardized object.
     */
    private function addProfessionalToList(&$list, $profile, $roleLabel, $projectTitle)
    {
        if (!$profile) return;

        // Determine the user object (some profiles might have different relations but standard is 'user')
        $user = $profile->user;
        if (!$user) return;

        $phone = $profile->no_telp;
        if (!$phone) {
            // PERF: phoneNumber is now eager-loaded (see index()) — the old
            // exists()+first() pair ran 2 queries PER hired professional row.
            $phone = $user->phoneNumber->first()?->contact;
        }

        $list[] = [
            'id' => $profile->id,
            'user_id' => $user->id,
            'name' => $profile->nama ?? $user->name,
            'role' => $roleLabel,
            'project_title' => $projectTitle,
            'phone' => $phone,
            'avatar' => $profile->foto ? asset('storage/' . $profile->foto) : ($user->pic ? asset('storage/' . $user->pic) : null),
            'hired_at' => $profile->created_at, // Approximate, could be better if we track accepted_at
        ];
    }
}
