<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectTerminationController extends Controller
{
    /**
     * Owner fires a professional from the project.
     */
    public function fireProfessional(Request $request, Project $project)
    {
        $user = Auth::user();
        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Only the project owner can terminate contracts.'], 403);
        }

        $request->validate([
            'role_type' => 'required|in:arsitek,kontraktor,interior,notaris,pm',
            'reason' => 'required|string|max:500',
        ]);

        $role = $request->role_type;
        $column = $this->getColumnForRole($role);
        $professionalId = $project->$column;

        if (!$professionalId) {
            return response()->json(['message' => "No professional of type {$role} is currently hired."], 422);
        }

        return DB::transaction(function () use ($project, $role, $column, $request) {
            // 1. Log the termination
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'professional_fired',
                'details' => "Owner terminated contract for {$role}. Reason: {$request->reason}",
            ]);

            // 2. MARK BID AS TERMINATED
            $bid = $this->updateBidStatusOnTermination($project, $role, 'terminated');

            // 3. ACCOUNTABILITY: Notify Professional & Deduct Reliability Score
            if ($bid) {
                $profileRelation = match($role) {
                    'arsitek' => 'arsitek',
                    'kontraktor' => 'kontraktor',
                    'interior' => 'interior',
                    'notaris' => 'notaris',
                    'pm' => 'projectManager',
                };
                
                $profile = $bid->$profileRelation;

                if ($profile) {
                    // Notify the professional
                    if ($profile->user_id) {
                        Notification::create([
                            'user_id' => $profile->user_id,
                            'type' => 'contract_terminated',
                            'title' => 'Contract Terminated',
                            'body' => "Your contract for \"{$project->title}\" was terminated by the owner. Reason: {$request->reason}",
                            'data' => ['project_id' => $project->id],
                        ]);
                    }

                    // Deduct reliability score (10% for being fired) - Floor at 0
                    $profile->update([
                        'reliability_score' => max(0, ($profile->reliability_score ?? 100) - 10)
                    ]);
                }
            }

            // 4. CLEANUP: Delete uncompleted milestones for this role
            $project->milestones()
                ->where($column, $project->$column)
                ->where('is_completed', false)
                ->delete();

            // 5. Clear the professional from the project
            $project->update([$column => null]);

            // 6. Reopen project for bidding if it's a primary role or PM
            if (in_array($role, ['arsitek', 'kontraktor', 'pm', 'interior', 'notaris'])) {
                // If it was in progress, we might need to reset it to open to get a replacement
                if ($project->status === 'in_progress') {
                    $project->update(['status' => 'open']);
                }
            }

            return response()->json(['message' => "Contract for {$role} terminated successfully. Project is reopened for bidding."]);
        });
    }

    /**
     * Professional resigns from the project.
     */
    public function resignFromProject(Request $request, Project $project)
    {
        $user = Auth::user();
        $role = $user->role_type;
        $column = $this->getColumnForRole($role);

        if (!$column || $project->$column !== $this->getProfileIdForUser($user, $role)) {
            return response()->json(['message' => 'You are not hired for this role on this project.'], 403);
        }

        $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        return DB::transaction(function () use ($project, $role, $column, $request, $user) {
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'professional_resigned',
                'details' => "Professional ({$role}) resigned from the project. Reason: {$request->reason}",
            ]);

            // 1. Notify Owner
            Notification::create([
                'user_id' => $project->user_id,
                'type' => 'professional_resigned',
                'title' => 'Professional Resigned',
                'body' => "The {$role} for your project \"{$project->title}\" has resigned. Reason: {$request->reason}",
                'data' => ['project_id' => $project->id],
            ]);

            // 2. Mark bid as resigned
            $bid = $this->updateBidStatusOnTermination($project, $role, 'resigned');

            // 3. ACCOUNTABILITY: Deduct Reliability Score for resignation (5%) - Floor at 0
            $profileId = $this->getProfileIdForUser($user, $role);
            $profileModel = match($role) {
                'arsitek' => \App\Models\Arsitek::class,
                'kontraktor' => \App\Models\Kontraktor::class,
                'interior' => \App\Models\InteriorProfile::class,
                'notaris' => \App\Models\NotarisProfile::class,
                'pm' => \App\Models\ProjectManager::class,
            };

            if ($profileId && $profileModel) {
                $profile = $profileModel::find($profileId);
                if ($profile) {
                    $profile->update([
                        'reliability_score' => max(0, ($profile->reliability_score ?? 100) - 5)
                    ]);
                }
            }

            // 4. CLEANUP: Delete uncompleted milestones for this role
            $project->milestones()
                ->where($column, $project->$column)
                ->where('is_completed', false)
                ->delete();

            // 5. Clear the professional from the project
            $project->update([$column => null]);

            if (in_array($role, ['arsitek', 'kontraktor', 'pm', 'interior', 'notaris'])) {
                if ($project->status === 'in_progress') {
                    $project->update(['status' => 'open']);
                }
            }

            return response()->json(['message' => 'Resignation submitted successfully.']);
        });
    }

    private function getColumnForRole($role)
    {
        return match ($role) {
            'arsitek' => 'selected_arsitek_id',
            'kontraktor' => 'selected_kontraktor_id',
            'interior' => 'selected_interior_id',
            'notaris' => 'selected_notaris_id',
            'pm' => 'pm_id',
            default => null,
        };
    }

    private function updateBidStatusOnTermination(Project $project, $role, $status)
    {
        $modelClass = match ($role) {
            'arsitek' => \App\Models\BidArsitek::class,
            'kontraktor' => \App\Models\BidKontraktor::class,
            'interior' => \App\Models\BidInterior::class,
            'notaris' => \App\Models\BidNotaris::class,
            'pm' => \App\Models\BidProjectManager::class,
            default => null,
        };

        if ($modelClass) {
            $bid = $modelClass::where('project_id', $project->id)
                ->where('status', 'accepted')
                ->latest()
                ->first();

            if ($bid) {
                $bid->update(['status' => $status]);
                return $bid;
            }
        }
        return null;
    }

    private function getProfileIdForUser($user, $role)
    {
        return match ($role) {
            'arsitek' => $user->arsitek?->id,
            'kontraktor' => $user->kontraktor?->id,
            'interior' => $user->interior_profile?->id,
            'notaris' => $user->notaris_profile?->id,
            'pm' => $user->project_manager?->id,
            default => $user->id,
        };
    }
}
