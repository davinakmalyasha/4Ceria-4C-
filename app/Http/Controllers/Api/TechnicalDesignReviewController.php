<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\Notification;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TechnicalDesignReviewController extends Controller
{
    private function checkAuth($project, string $role, string $mode): bool
    {
        $u = Auth::user();
        if ($mode === 'specialist') {
            return ($role === 'structural' && $project->structuralEngineer?->user_id === $u->id) ||
                   ($role === 'mep' && $project->mepEngineer?->user_id === $u->id) ||
                   ($u->role_type === 'arsitek' && $project->selected_arsitek_id === $u->arsitek?->id) ||
                   ($project->user_id === $u->id);
        }
        return ($u->role_type === 'project_manager' && $project->pm_id === $u->id) ||
               ($project->user_id === $u->id) ||
               ($u->role_type === 'arsitek' && $project->selected_arsitek_id === $u->arsitek?->id);
    }

    private function notify($userId, string $type, string $title, string $body, int $projectId): void
    {
        if ($userId) {
            Notification::create(['user_id' => $userId, 'type' => $type, 'title' => $title, 'body' => $body, 'data' => ['project_id' => $projectId]]);
        }
    }

    public function submitDesign(Request $request, Project $project)
    {
        $v = $request->validate(['role_type' => 'required|in:structural,mep']);
        if (!$this->checkAuth($project, $v['role_type'], 'specialist')) return response()->json(['message' => 'Unauthorized'], 403);

        return DB::transaction(function () use ($project, $v) {
            $cat = $v['role_type'] === 'structural' ? 'structural_calc' : 'mep_layout';
            
            // Update documents status and clear old review notes
            $project->documents()
                ->where('category', $cat)
                ->whereIn('status', ['uploaded', 'revision_requested'])
                ->update([
                    'status' => 'under_review',
                    'review_note' => null
                ]);

            // Clear old review notes and status on milestones for this specialist's role
            $project->milestones()
                ->where('phase_context', $v['role_type'])
                ->update([
                    'review_note' => null,
                    'review_status' => 'pending'
                ]);

            $this->logActivity($project, 'design_submitted', "Submitted " . ucfirst($v['role_type']) . " Design");
            
            $body = Auth::user()->name . " has submitted the " . strtoupper($v['role_type']) . " design for review.";
            $this->notify($project->pm_id, 'design_submitted', 'Technical Design Submitted', $body, $project->id);
            if ($project->user_id !== Auth::id()) {
                $this->notify($project->user_id, 'design_submitted', 'Technical Design Submitted', $body, $project->id);
            }
            return response()->json(['message' => 'Submitted successfully']);
        });
    }

    public function approveDesign(Request $request, Project $project)
    {
        $v = $request->validate(['role_type' => 'required|in:structural,mep']);
        if (!$this->checkAuth($project, $v['role_type'], 'pm')) return response()->json(['message' => 'Unauthorized'], 403);

        return DB::transaction(function () use ($project, $v) {
            $cat = $v['role_type'] === 'structural' ? 'structural_calc' : 'mep_layout';
            $project->documents()->where('category', $cat)->update(['status' => 'verified', 'reviewed_at' => now()]);
            $col = $v['role_type'] === 'structural' ? 'structural_approved_at' : 'mep_approved_at';
            $project->update([$col => now()]);
            $this->logActivity($project, 'design_approved', "Approved " . ucfirst($v['role_type']) . " Design");

            // Automatically approve all associated progress logs (milestones) for this phase
            $milestones = $project->milestones()
                ->where('phase_context', $v['role_type'])
                ->where('approval_status', '!=', 'approved')
                ->get();

            foreach ($milestones as $milestone) {
                $milestone->update([
                    'is_completed' => true,
                    'approval_status' => 'approved',
                    'pm_verified_at' => now(),
                ]);

                // Unlock linked payment termins
                $termins = ProjectPaymentTermin::where('milestone_id', $milestone->id)
                    ->whereIn('status', ['locked', 'pending'])
                    ->get();
                    
                foreach ($termins as $termin) {
                    $termin->update(['status' => 'pending']);
                    
                    $this->logActivity(
                        $project, 
                        'payment_triggered', 
                        "Progress Verified: '{$milestone->title}' via Design Integration Approval. Payment Termin '{$termin->label}' is now unlocked and awaiting owner approval."
                    );
                }

                // Sync milestone files to vault
                $files = [];
                if (!empty($milestone->image)) {
                    $files[] = $milestone->image;
                }
                if (isset($milestone->content['gallery']) && is_array($milestone->content['gallery'])) {
                    foreach ($milestone->content['gallery'] as $img) {
                        $files[] = $img;
                    }
                }

                foreach ($files as $filePath) {
                    ProjectDocument::updateOrCreate(
                        [
                            'project_id' => $milestone->project_id,
                            'file_path' => $filePath,
                        ],
                        [
                            'uploader_id' => Auth::id() ?? $project->user_id,
                            'file_name' => $milestone->content['file_names'][$filePath] ?? ($milestone->title . ' - ' . basename($filePath)),
                            'file_path' => $filePath,
                            'file_type' => pathinfo($filePath, PATHINFO_EXTENSION),
                            'category' => $milestone->phase_context === 'design' ? 'blueprint' : ($milestone->type ?? 'milestone_attachment'),
                            'status' => 'verified',
                            'version_label' => $milestone->title,
                            'target_role' => $v['role_type'] === 'structural' ? 'structural' : 'mep',
                        ]
                    );
                }

                $this->logActivity(
                    $project,
                    'milestone_approved',
                    "Technical Log '{$milestone->title}' automatically verified on Design Integration Approval."
                );
            }

            $target = $v['role_type'] === 'structural' ? $project->structuralEngineer?->user_id : $project->mepEngineer?->user_id;
            $body = "Your " . strtoupper($v['role_type']) . " design has been approved and integrated into the project.";
            $this->notify($target, 'design_approved', 'Technical Design Integrated', $body, $project->id);
            return response()->json(['message' => 'Approved successfully']);
        });
    }

    public function reviseDesign(Request $request, Project $project)
    {
        $v = $request->validate(['role_type' => 'required|in:structural,mep', 'note' => 'required|string|max:1000']);
        if (!$this->checkAuth($project, $v['role_type'], 'pm')) return response()->json(['message' => 'Unauthorized'], 403);

        return DB::transaction(function () use ($project, $v) {
            $cat = $v['role_type'] === 'structural' ? 'structural_calc' : 'mep_layout';
            $project->documents()->where('category', $cat)->update(['status' => 'revision_requested', 'review_note' => $v['note'], 'reviewed_at' => now()]);
            $col = $v['role_type'] === 'structural' ? 'structural_approved_at' : 'mep_approved_at';
            $project->update([$col => null]);
            $this->logActivity($project, 'design_revision_requested', "Revision Requested: " . $v['note']);

            $target = $v['role_type'] === 'structural' ? $project->structuralEngineer?->user_id : $project->mepEngineer?->user_id;
            $body = "A revision has been requested for your " . strtoupper($v['role_type']) . " design: " . $v['note'];
            $this->notify($target, 'design_revision_requested', 'Revision Requested for Design', $body, $project->id);
            return response()->json(['message' => 'Revision requested successfully']);
        });
    }

    private function logActivity($project, string $action, string $details): void
    {
        ProjectActivityLog::create(['project_id' => $project->id, 'user_id' => Auth::id(), 'action' => $action, 'details' => $details]);
    }
}
