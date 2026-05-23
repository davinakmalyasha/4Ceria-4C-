<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectDocument;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectMilestoneController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;
        
        $isHiredPro = false;
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id) $isHiredPro = true;
        if ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id) $isHiredPro = true;
        if ($user->role_type === 'notaris' && $project->selected_notaris_id === $user->notaris_profile?->id) $isHiredPro = true;
        if ($user->role_type === 'interior' && $project->selected_interior_id === $user->interior_profile?->id) $isHiredPro = true;
        if ($user->role_type === 'structural' && $project->structural_id === $user->structural_engineer?->id) $isHiredPro = true;
        if ($user->role_type === 'mep' && $project->mep_id === $user->mep_engineer?->id) $isHiredPro = true;

        $isSubPro = DB::table('project_sub_professionals')
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
        if ($isSubPro) $isHiredPro = true;

        if (!$isOwner && !$isPM && !$isHiredPro) {
            return response()->json(['message' => 'Unauthorized. You must be assigned to this project to view files.'], 403);
        }

        // Silent Auto-Heal: Update type to sub_professional for any legacy administrative team placeholders
        DB::table('project_milestones')
            ->where('project_id', $project->id)
            ->whereNull('type')
            ->where(function($q) {
                $q->where('title', 'like', '% — MEP')
                  ->orWhere('title', 'like', '% — STRUCTURAL')
                  ->orWhere('title', 'like', '% — INTERIOR')
                  ->orWhere('title', 'like', '% — mep')
                  ->orWhere('title', 'like', '% — structural')
                  ->orWhere('title', 'like', '% — interior');
            })
            ->update(['type' => 'sub_professional']);

        $query = $project->milestones()->with(['arsitek.user', 'kontraktor.user', 'notaris.user', 'interior.user', 'pm.user', 'linkedTermin', 'changeOrders']);
        
        // Exclude sub-professional payment placeholder milestones from the regular technical milestones list
        $query->where(function($q) {
            $q->whereNull('type')
              ->orWhere('type', '!=', 'sub_professional');
        });

        if ($request->has('phase_context')) {
            $query->where('phase_context', $request->phase_context);
        }
        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;

        $activeSub = DB::table('project_sub_professionals')
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();
            
        $isHiredPro = false;
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id) $isHiredPro = true;
        if ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id) $isHiredPro = true;
        if ($user->role_type === 'notaris' && $project->selected_notaris_id === $user->notaris_profile?->id) $isHiredPro = true;
        if ($user->role_type === 'interior' && $project->selected_interior_id === $user->interior_profile?->id) $isHiredPro = true;
        if ($user->role_type === 'structural' && $project->structural_id === $user->structural_engineer?->id) $isHiredPro = true;
        if ($user->role_type === 'mep' && $project->mep_id === $user->mep_engineer?->id) $isHiredPro = true;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isPM && !$isHiredPro && !$activeSub) {
            return response()->json(['message' => 'Only hired professionals, active sub-professionals, or the Project Owner can add milestones.'], 403);
        }

        // NTP Gates removed as requested. Professionals can now start immediately after SPK.

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string',
            'type' => 'nullable|string|max:100',
            'sort_order' => 'nullable|integer|min:0',
            'phase_context' => 'nullable|string',
            'content' => 'nullable|string', // JSON string from frontend
            'target_notaris_id' => 'nullable|exists:notaris_profiles,id',
            'target_arsitek_id' => 'nullable|exists:arsiteks,id',
            'target_kontraktor_id' => 'nullable|exists:kontraktors,id',
            'target_interior_id' => 'nullable|exists:interior_profiles,id',
            'cost_impact' => 'nullable|numeric',
            'time_impact_days' => 'nullable|integer|min:0',
        ]);

        $contentInput = $request->input('content');
        $content = [];
        if (is_string($contentInput)) {
            $content = json_decode($contentInput, true) ?? [];
        } elseif (is_array($contentInput)) {
            $content = $contentInput;
        }

        $phase = $validated['phase_context'] ?? 'design';
        
        // PBG Gate: Only applies to new_build and renovation categories during physical build/construction phase
        if (in_array($phase, ['build', 'construction'])) {
            $needsPBG = in_array($project->project_category, ['new_build', 'renovation']);
            if ($needsPBG) {
                $isPBGApproved = $project->pbg_verified_at !== null || $project->milestones()
                    ->where('approval_status', 'approved')
                    ->where(function($q) {
                        $q->where('title', 'like', '%PBG%')
                          ->orWhere('title', 'like', '%IMB%');
                    })
                    ->exists();

                if (!$isPBGApproved) {
                    return response()->json(['message' => 'Physical site work is locked. PBG permit is missing or unverified.'], 403);
                }
            }
        }
        
        // Check if phase is locked to tag as additional work
        $isLocked = false;
        if ($phase === 'design' && $project->design_locked_at) $isLocked = true;
        if (($phase === 'build' || $phase === 'construction') && $project->construction_locked_at) $isLocked = true;
        if ($phase === 'interior' && $project->interior_locked_at) $isLocked = true;
        if ($phase === 'legal' && $project->legal_locked_at) $isLocked = true;

        if ($isLocked) {
            $content['is_addon'] = true;
            $content['original_phase_lock_date'] = now();
        }
        
        // Handle file uploads
        if ($request->hasFile('gallery')) {
            $files = $request->file('gallery');
            $gallery = $content['gallery'] ?? [];
            $fileNames = $content['file_names'] ?? [];
            $fileArray = is_array($files) ? $files : [$files];
            
            foreach ($fileArray as $file) {
                $path = $file->store('milestone_files', 'public');
                $gallery[] = $path;
                $fileNames[$path] = $file->getClientOriginalName();
            }
            $content['gallery'] = $gallery;
            $content['file_names'] = $fileNames;
        }

        $data = [
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'start_date' => $validated['start_date'] ?? null,
            'due_date' => $validated['due_date'] ?? null,
            'type' => $activeSub ? $activeSub->sub_role : ($validated['type'] ?? 'milestone'),
            'sort_order' => $validated['sort_order'] ?? 0,
            'phase_context' => $validated['phase_context'] ?? 'design',
            'content' => $content,
            'is_completed' => false,
            'approval_status' => 'pending',
        ];

        // Role-based ownership or targeted ownership
        if ($request->target_notaris_id) $data['notaris_id'] = $request->target_notaris_id;
        elseif ($request->target_arsitek_id) $data['arsitek_id'] = $request->target_arsitek_id;
        elseif ($request->target_kontraktor_id) $data['kontraktor_id'] = $request->target_kontraktor_id;
        elseif ($request->target_interior_id) $data['interior_id'] = $request->target_interior_id;
        elseif ($request->target_structural_id) $data['structural_id'] = $request->target_structural_id;
        elseif ($request->target_mep_id) $data['mep_id'] = $request->target_mep_id;
        else {
            if ($user->role_type === 'arsitek' && $user->arsitek) $data['arsitek_id'] = $user->arsitek->id;
            elseif ($user->role_type === 'kontraktor' && $user->kontraktor) $data['kontraktor_id'] = $user->kontraktor->id;
            elseif ($user->role_type === 'project_manager' && $user->project_manager) $data['pm_id'] = $user->project_manager->id;
            elseif ($user->role_type === 'notaris' && $user->notaris_profile) $data['notaris_id'] = $user->notaris_profile->id;
            elseif ($user->role_type === 'interior' && $user->interior_profile) $data['interior_id'] = $user->interior_profile->id;
            elseif ($user->role_type === 'structural' && $user->structural_engineer) $data['structural_id'] = $user->structural_engineer->id;
            elseif ($user->role_type === 'mep' && $user->mep_engineer) $data['mep_id'] = $user->mep_engineer->id;
        }

        DB::beginTransaction();
        try {
            $milestone = $project->milestones()->create($data);
            
            // Unified Add-on & Fee Logic
            if ($request->filled('cost_impact') && $request->input('cost_impact') > 0) {
                $project->changeOrders()->create([
                    'requested_by' => $user->id,
                    'role_type' => $user->role_type,
                    'milestone_id' => $milestone->id,
                    'title' => 'Additional Fee: ' . $milestone->title,
                    'description' => 'Automatically generated fee request for add-on: ' . ($validated['description'] ?? $milestone->title),
                    'cost_impact' => $request->input('cost_impact'),
                    'time_impact_days' => $request->input('time_impact_days', 0),
                    'status' => 'proposed',
                ]);
            }

            $this->syncToVault($milestone); 
            $this->logActivity($project, 'milestone_added', "Added: {$validated['title']}");

            DB::commit();
            return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user', 'notaris.user', 'interior.user', 'structural.user', 'mep.user', 'changeOrders'])]);
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error("Failed to store milestone: " . $e->getMessage());
            return response()->json(['message' => 'Internal server error: ' . $e->getMessage()], 500);
        }
    }

    public function update(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();
        if (!$this->canModifyMilestone($project, $milestone, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // NTP Gates removed as requested.

        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'is_completed' => 'nullable|boolean',
            'approval_status' => 'nullable|string|in:in_progress,pending,approved,revision',
            'revision_notes' => 'nullable|string',
            'content' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($milestone, $validated, $project, $request) {
            $updateData = $validated;
            
            $contentInput = $request->input('content');
            $content = $milestone->content ?? [];

            if (is_string($contentInput)) {
                $content = json_decode($contentInput, true) ?? $content;
            } elseif (is_array($contentInput)) {
                $content = $contentInput;
            }

            if (!is_array($content)) $content = [];

            // Handle file uploads (append to gallery)
            if ($request->hasFile('gallery')) {
                $files = $request->file('gallery');
                $gallery = $content['gallery'] ?? [];
                $fileNames = $content['file_names'] ?? [];
                $fileArray = is_array($files) ? $files : [$files];
                
                foreach ($fileArray as $file) {
                    $path = $file->store('milestone_files', 'public');
                    $gallery[] = $path;
                    $fileNames[$path] = $file->getClientOriginalName();
                }
                $content['gallery'] = $gallery;
                $content['file_names'] = $fileNames;
            }
            
            $updateData['content'] = $content;
            
            $milestone->update($updateData);
            $this->syncToVault($milestone); // Sync on every update

            if (isset($validated['approval_status']) && $validated['approval_status'] === 'approved') {
                $milestone->update([
                    'pm_verified_at' => now(),
                    'is_completed' => true,
                    'approval_status' => 'approved'
                ]);
                $this->unlockLinkedTermin($milestone);
                $this->syncToVault($milestone); // Sync again to update status to verified
                $this->logActivity($project, 'milestone_approved', "Approved: {$milestone->title}");
            }

            return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user', 'notaris.user', 'interior.user', 'structural.user', 'mep.user'])]);
        });
    }

    public function approve(Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();
        $isPM = ($user->role_type === 'project_manager' && $project->pm_id === $user->id);
        $isOwner = ($project->user_id === $user->id);
        
        // Lead Professional Check (Architect for Structural/MEP)
        $isLeadArsitek = ($user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id);
        $isLeadKontraktor = ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id);
        
        $canReview = ($isLeadArsitek && ($milestone->structural_id || $milestone->mep_id)) || ($isLeadKontraktor && ($milestone->structural_id || $milestone->mep_id));

        if (!$isPM && !$isOwner && !$canReview) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return DB::transaction(function () use ($milestone, $project, $isPM, $canReview) {
            if ($canReview && $milestone->approval_status === 'pending') {
                $milestone->update([
                    'approval_status' => 'reviewed',
                    'lead_pro_verified_at' => now(),
                ]);
                $this->logActivity($project, 'milestone_reviewed', "Technical Review Completed: {$milestone->title}");
            } else {
                $milestone->update([
                    'is_completed' => true,
                    'approval_status' => 'approved',
                    'pm_verified_at' => $isPM ? now() : $milestone->pm_verified_at,
                ]);
                $this->unlockLinkedTermin($milestone);
                $this->syncToVault($milestone);
                $this->logActivity($project, 'milestone_approved', "Final Verification: {$milestone->title}");
            }
            
            return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user', 'notaris.user', 'interior.user', 'structural.user', 'mep.user'])]);
        });
    }

    public function destroy(Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();
        if (!$this->canModifyMilestone($project, $milestone, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if ($milestone->approval_status === 'approved') {
            return response()->json(['message' => 'Cannot delete an approved milestone.'], 400);
        }

        if ($milestone->linkedTermin && $milestone->linkedTermin->status === 'paid') {
            return response()->json(['message' => 'Cannot delete a step linked to a PAID payment.'], 400);
        }

        $milestone->delete();
        $this->logActivity($project, 'milestone_deleted', "Deleted: {$milestone->title}");
        
        return response()->json(['message' => 'Milestone deleted successfully.']);
    }

    public function submitTechnicalAudit(Request $request, Project $project)
    {
        $user = Auth::user();
        $isPM = ($user->role_type === 'project_manager' && $project->pm_id === $user->id);
        $isOwner = ($project->user_id === $user->id);
        $isLeadArsitek = ($user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id);
        $isLeadKontraktor = ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id);

        if (!$isPM && !$isOwner && !$isLeadArsitek && !$isLeadKontraktor) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'role_type' => 'required|in:structural,mep,design,build,interior,legal',
            'milestones' => 'array',
            'milestones.*.id' => 'required|exists:project_milestones,id',
            'milestones.*.status' => 'required|in:approved,revision_requested',
            'milestones.*.note' => 'nullable|string',
            'documents' => 'array',
            'documents.*.id' => 'required|exists:project_documents,id',
            'documents.*.status' => 'required|in:approved,revision_requested',
            'documents.*.note' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated, $project, $isPM, $isLeadArsitek, $isLeadKontraktor) {
            $allApproved = true;
            $unlockedTermins = [];

            foreach ($validated['milestones'] ?? [] as $m) {
                $milestone = ProjectMilestone::find($m['id']);
                $updateData = [
                    'review_note' => $m['note'],
                    'review_status' => $m['status'],
                ];

                if ($m['status'] === 'approved') {
                    if ($isLeadArsitek || $isLeadKontraktor) {
                        $updateData['lead_pro_verified_at'] = now();
                        $updateData['approval_status'] = 'reviewed';
                    }
                    if ($isPM) {
                        $updateData['pm_verified_at'] = now();
                        $updateData['approval_status'] = 'approved';
                        $updateData['is_completed'] = true;
                    }
                } else {
                    $allApproved = false;
                    $updateData['approval_status'] = 'pending';
                    $updateData['lead_pro_verified_at'] = null;
                    $updateData['pm_verified_at'] = null;
                }
                
                $milestone->update($updateData);

                if ($isPM && $m['status'] === 'approved') {
                    $unlocked = $this->unlockLinkedTermin($milestone);
                    $unlockedTermins = array_merge($unlockedTermins, $unlocked);
                    $this->syncToVault($milestone);
                }
            }

            foreach ($validated['documents'] ?? [] as $d) {
                $doc = ProjectDocument::find($d['id']);
                $updateData = [
                    'review_note' => $d['note'],
                    'status' => $d['status'],
                    'reviewed_at' => now(),
                ];
                if ($d['status'] !== 'approved') {
                    $allApproved = false;
                }
                $doc->update($updateData);
            }

            // Only auto-approve integration if EVERYTHING is approved
            // Note: If no items are provided in the audit, we don't update the project status
            $hasItems = count($validated['milestones'] ?? []) > 0 || count($validated['documents'] ?? []) > 0;
            if ($allApproved && $hasItems) {
                if ($validated['role_type'] === 'structural') {
                    $project->update(['structural_approved_at' => now()]);
                } else {
                    $project->update(['mep_approved_at' => now()]);
                }
                $this->logActivity($project, 'integration_approved', "Integrated {$validated['role_type']} role via Audit");
            }

            return response()->json([
                'message' => 'Audit submitted successfully',
                'unlocked_termins' => $unlockedTermins
            ]);
        });
    }

    private function unlockLinkedTermin(ProjectMilestone $milestone)
    {
        $termins = ProjectPaymentTermin::where('milestone_id', $milestone->id)
            ->whereIn('status', ['locked', 'pending']) // Or just any status that isn't paid
            ->get();
            
        $unlockedData = [];
        foreach ($termins as $termin) {
            $termin->update(['status' => 'pending']); // Ensure it's marked pending owner release
            
            $unlockedData[] = [
                'label' => $termin->label,
                'amount' => $termin->amount,
                'milestone_title' => $milestone->title
            ];

            $this->logActivity(
                $milestone->project,
                'payment_triggered',
                "Progress Verified: '{$milestone->title}'. Payment Termin '{$termin->label}' is now unlocked and awaiting owner approval."
            );
        }

        return $unlockedData;
    }

    private function canModifyMilestone(Project $project, ProjectMilestone $milestone, $user)
    {
        if ($project->user_id === $user->id) return true; 
        if ($user->role_type === 'project_manager' && $project->pm_id === $user->id) return true;
        
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id) {
            if ($milestone->structural_id || $milestone->mep_id) return true;
        }
        if ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id) {
            if ($milestone->structural_id || $milestone->mep_id) return true;
        }

        if ($milestone->arsitek_id && $milestone->arsitek_id === $user->arsitek?->id) return true;
        if ($milestone->kontraktor_id && $milestone->kontraktor_id === $user->kontraktor?->id) return true;
        if ($milestone->notaris_id && $milestone->notaris_id === $user->notaris_profile?->id) return true;
        if ($milestone->interior_id && $milestone->interior_id === $user->interior_profile?->id) return true;
        if ($milestone->pm_id && $milestone->pm_id === $user->project_manager?->id) return true;
        if ($milestone->structural_id && $milestone->structural_id === $user->structural_engineer?->id) return true;
        if ($milestone->mep_id && $milestone->mep_id === $user->mep_engineer?->id) return true;

        $activeSub = DB::table('project_sub_professionals')
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();
        if ($activeSub && $milestone->type === $activeSub->sub_role) {
            return true;
        }

        return false;
    }

    private function syncToVault(ProjectMilestone $milestone): void
    {
        $files = $milestone->getApprovedFiles();
        if (empty($files)) return;

        $status = ($milestone->approval_status === 'approved' || $milestone->is_completed) ? 'verified' : 'under_review';

        foreach ($files as $filePath) {
            ProjectDocument::updateOrCreate(
                [
                    'project_id' => $milestone->project_id,
                    'file_path' => $filePath,
                ],
                [
                    'uploader_id' => Auth::id() ?? $milestone->project->user_id,
                    'file_name' => $milestone->content['file_names'][$filePath] ?? ($milestone->title . ' - ' . basename($filePath)),
                    'file_path' => $filePath, // Redundant but safe for updateOrCreate
                    'file_type' => pathinfo($filePath, PATHINFO_EXTENSION),
                    'category' => $milestone->phase_context === 'design' ? 'blueprint' : ($milestone->type ?? 'milestone_attachment'),
                    'status' => $status,
                    'version_label' => $milestone->title,
                    'target_role' => match(true) {
                        (bool)$milestone->arsitek_id => 'architect',
                        (bool)$milestone->kontraktor_id => 'contractor',
                        (bool)$milestone->notaris_id => 'notary',
                        (bool)$milestone->interior_id => 'interior',
                        (bool)$milestone->pm_id => 'pm',
                        (bool)$milestone->structural_id => 'structural',
                        (bool)$milestone->mep_id => 'mep',
                        default => null,
                    },
                ]
            );
        }
    }

    private function logActivity(Project $project, string $action, string $details): void
    {
        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }
}
