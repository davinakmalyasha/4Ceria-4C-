<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectComment;
use App\Models\ProjectDocument;
use App\Models\ProjectMilestone;
use App\Models\ProjectDailyLog;
use App\Models\ProjectAddendum;
use App\Models\BidNotaris;
use App\Models\BidStructural;
use App\Models\BidMep;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectProcurementRequest;
use App\Http\Resources\ProjectResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;

class ProjectFeatureController extends Controller
{
    // --- MILESTONES ---
    public function getMilestones(Request $request, Project $project)
    {
        $query = $project->milestones()->with(['arsitek.user', 'kontraktor.user', 'pm.user', 'linkedTermin']);

        // Filter by phase_context if provided (e.g. ?phase_context=interior)
        if ($request->has('phase_context')) {
            $query->where('phase_context', $request->phase_context);
        }

        $milestones = $query->get();

        return response()->json(['data' => $milestones]);
    }

    public function storeMilestone(Request $request, Project $project)
    {
        $user = Auth::user();
        $request->validate([
            'title' => 'required|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string',
            'image' => 'nullable|file|mimes:jpg,jpeg,png,webp,pdf|max:10240',
            'type' => 'nullable|string|in:generic,schematic,development,construction,legal',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        // Block owners from adding milestones
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Only hired professionals can add milestones.'], 403);
        }

        $data = [
            'title' => $request->title,
            'start_date' => $request->start_date,
            'due_date' => $request->due_date,
            'description' => $request->description,
            'type' => $request->type ?? 'generic',
            'content' => is_string($request->content) ? json_decode($request->content, true) : $request->content,
            'sort_order' => $request->sort_order ?? 0,
            'is_completed' => false,
            'approval_status' => 'in_progress',
            'phase_context' => $request->phase_context ?? 'build',
        ];

        // Handle image upload
        $content = $data['content'];
        if ($request->hasFile('gallery')) {
            $gallery = $content['gallery'] ?? [];
            foreach ($request->file('gallery') as $file) {
                if (count($gallery) >= 8) break;
                // Support both images and PDFs
                $folder = $file->getClientOriginalExtension() === 'pdf' ? 'milestone_docs' : 'milestone_images';
                $gallery[] = $file->store($folder, 'public');
            }
            $content['gallery'] = $gallery;
            $data['content'] = $content;
        }

        // Assign professional ownership strictly based on role
        if ($user->role_type === 'arsitek' && $user->arsitek) {
            $data['arsitek_id'] = $user->arsitek->id;
        } elseif ($user->role_type === 'kontraktor' && $user->kontraktor) {
            $data['kontraktor_id'] = $user->kontraktor->id;
        } elseif ($user->role_type === 'notaris') {
            $data['notaris_id'] = $user->id;
        } elseif ($user->role_type === 'project_manager' && $user->project_manager) {
            $data['pm_id'] = $user->project_manager->id;
            
            // Allow PM to specify a target pro role if provided
            if ($request->has('target_notaris_id')) $data['notaris_id'] = $request->target_notaris_id;
            if ($request->has('target_arsitek_id')) $data['arsitek_id'] = $request->target_arsitek_id;
            if ($request->has('target_kontraktor_id')) $data['kontraktor_id'] = $request->target_kontraktor_id;
            if ($request->has('target_interior_id')) $data['interior_id'] = $request->target_interior_id;
        } elseif ($user->role_type === 'interior') {
            $data['interior_id'] = $user->id;
        } else {
            return response()->json(['message' => 'Unauthorized professional role.'], 403);
        }

        $milestone = $project->milestones()->create($data);

        $roleName = ucfirst($user->role_type);
        $this->logActivity($project, 'milestone_added', "{$roleName} added milestone: {$request->title}");

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
    }

    public function updateMilestone(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        // Block owners from updating milestones
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Owners cannot modify milestones. This is managed by professionals.'], 403);
        }

        // Context-Aware Authorization: The project's hired professional for the active phase has access
        $isProjectPM = ($user->role_type === 'project_manager' && $project->pm_id === $user->id);
        $isProjectOwner = ($project->user_id === $user->id);
        $isProjectNotary = ($user->role_type === 'notaris' && $project->selected_notaris_id === $user->notaris_profile?->id);
        $isProjectArchitect = ($user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id);
        $isProjectContractor = ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id);

        // Authorization Logic
        $isAuthor = false;
        if ($user->role_type === 'arsitek' && ($milestone->arsitek_id === $user->arsitek?->id || ($milestone->phase_context !== 'legal' && $isProjectArchitect))) $isAuthor = true;
        if ($user->role_type === 'kontraktor' && ($milestone->kontraktor_id === $user->kontraktor?->id || ($milestone->phase_context !== 'legal' && $isProjectContractor))) $isAuthor = true;
        if ($user->role_type === 'notaris' && ($milestone->notaris_id === $user->id || $isProjectNotary)) $isAuthor = true;
        if ($user->role_type === 'interior' && $milestone->interior_id === $user->id) $isAuthor = true;
        if ($user->role_type === 'project_manager' && ($milestone->pm_id === $user->project_manager?->id || $isProjectPM)) $isAuthor = true;

        // Universal Legal Vault: Any hired professional for the project has access to legal phase milestones (e.g. SPK, Permits)
        $hasUniversalAccess = ($milestone->phase_context === 'legal' && ($isProjectNotary || $isProjectArchitect || $isProjectContractor || $isProjectPM));

        if (!$isAuthor && !$isProjectPM && !$isProjectOwner && !$hasUniversalAccess) {
            return response()->json(['message' => 'Unauthorized. You do not have permission to update this milestone.'], 403);
        }

        // Restriction: Only Author or Universal Pro can change basic details; PM/Owner can only update status/notes
        if (!$isAuthor && !$hasUniversalAccess && $request->hasAny(['title', 'description', 'sort_order', 'type'])) {
            return response()->json(['message' => 'Unauthorized to modify milestone metadata. Only the assigned professional can change the title/description.'], 403);
        }

        $request->validate([
            'is_completed' => 'nullable|boolean',
            'title' => 'nullable|string|max:255',
            'start_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'description' => 'nullable|string',
            'image' => 'nullable|file|mimes:jpg,jpeg,png,webp,pdf|max:10240',
            'type' => 'nullable|string|in:generic,schematic,development,construction,legal',
            'sort_order' => 'nullable|integer|min:0',
            'approval_status' => 'nullable|string|in:in_progress,pending,approved,revision',
            'gallery' => 'nullable|array|max:8',
            'gallery.*' => 'nullable|file|mimes:jpg,jpeg,png,webp,pdf|max:10240',
        ]);

        $updateData = $request->only(['is_completed', 'title', 'start_date', 'due_date', 'description', 'sort_order', 'type', 'approval_status', 'revision_notes']);

        if ($request->has('content')) {
            $updateData['content'] = is_string($request->content) ? json_decode($request->content, true) : $request->content;
        }

        // Handle image upload on update
        $currentContent = $updateData['content'] ?? $milestone->content ?? [];
        
        // Handle retaining existing gallery items
        if ($request->has('retained_gallery')) {
            $retained = json_decode($request->retained_gallery, true) ?? [];
            $existingGallery = $currentContent['gallery'] ?? [];
            $toDelete = array_diff($existingGallery, $retained);
            foreach ($toDelete as $path) {
                if ($path) \Illuminate\Support\Facades\Storage::disk('public')->delete($path);
            }
            $currentContent['gallery'] = $retained;
            $updateData['content'] = $currentContent;
        }

        // Handle adding new gallery items
        if ($request->hasFile('gallery')) {
            $gallery = $currentContent['gallery'] ?? [];
            foreach ($request->file('gallery') as $file) {
                if (count($gallery) >= 8) break;
                $gallery[] = $file->store('milestone_images', 'public');
            }
            $currentContent['gallery'] = $gallery;
            $updateData['content'] = $currentContent;
        }

        // Auto-set PM verification timestamp if the status becomes approved by a PM
        if (isset($isProjectPM) && $isProjectPM && isset($updateData['approval_status']) && $updateData['approval_status'] === 'approved') {
            // Regulatory Sequence Enforcement (Indonesian Standard: SIMBG/IAI)
            if ($milestone->phase_context === 'legal') {
                if ($milestone->title === 'SLF Certification') {
                    $asBuiltApproved = \App\Models\ProjectMilestone::where('project_id', $project->id)
                        ->where('title', 'As-Built Drawings')
                        ->where('approval_status', 'approved')
                        ->exists();
                    if (!$asBuiltApproved) {
                        return response()->json(['message' => 'Regulatory Block: SLF Certification cannot be approved until As-Built Drawings are verified.'], 422);
                    }
                }

                if ($milestone->title === 'As-Built Drawings') {
                    $pbgApproved = \App\Models\ProjectMilestone::where('project_id', $project->id)
                        ->where('title', 'PBG (IMB) Permit')
                        ->where('approval_status', 'approved')
                        ->exists();
                    if (!$pbgApproved) {
                        return response()->json(['message' => 'Regulatory Block: As-Built Drawings cannot be approved until the PBG (IMB) Permit is verified.'], 422);
                    }
                }
                
                if ($milestone->title === 'PBG (IMB) Permit') {
                    $spkApproved = \App\Models\ProjectMilestone::where('project_id', $project->id)
                        ->where('title', 'SPK (Surat Perintah Kerja)')
                        ->where('approval_status', 'approved')
                        ->exists();
                    if (!$spkApproved) {
                        return response()->json(['message' => 'Regulatory Block: PBG (IMB) Permit cannot be approved until the SPK Contract is verified.'], 422);
                    }
                }
            }
            
            $updateData['pm_verified_at'] = now();
        }

        // Safety: If a professional (Author) updates an already approved milestone, reset status to pending
        if ($isAuthor && $milestone->approval_status === 'approved' && !isset($updateData['approval_status'])) {
            // Check if they actually changed content or files
            if ($request->hasAny(['content', 'gallery', 'description'])) {
                $updateData['approval_status'] = 'pending';
                $updateData['pm_verified_at'] = null; // Clear old verification
                $this->logActivity($project, 'legal_revision', "Professional updated an approved document. Status reset to pending for re-verification.");
            }
        }

        $milestone->update($updateData);

        if ($milestone->approval_status === 'approved') {
            $this->archiveMilestoneToVault($project, $milestone);
        }

        if ($request->has('is_completed')) {
            $status = $request->is_completed ? 'completed' : 'reopened';
            $this->logActivity($project, "milestone_{$status}", "Milestone {$status}: {$milestone->title}");
        }

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
    }

    public function approveMilestone(Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        $isOwner = ($user->role_type === 'user' && $project->user_id === $user->id);
        $isHiredPM = ($user->role_type === 'project_manager' && (int)$project->pm_id === (int)$user->id);

        if (!$isOwner && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner or hired Project Manager can approve phases.'], 403);
        }

        return DB::transaction(function () use ($project, $milestone, $isHiredPM) {
            $milestone->update([
                'is_completed' => true,
                'approval_status' => 'approved',
                'revision_notes' => null,
                'pm_verified_at' => $milestone->pm_verified_at ?? ($isHiredPM ? now() : null),
            ]);

            // If PM approved or Owner approved, we ensure payment terms are unlocked if context allows
            // Note: PM approval specifically triggers the verification logic for payments.
            if ($isHiredPM) {
                ProjectPaymentTermin::where('milestone_id', $milestone->id)
                    ->where('status', 'locked')
                    ->update(['status' => 'pending']);
                
                $this->logActivity($project, "milestone_pm_verified", "PM Approved & Verified: {$milestone->title}");
            } else {
                $this->logActivity($project, "milestone_approved", "Owner Approved: {$milestone->title}");
            }

            // Auto-archive evidence to Vault
            $this->archiveMilestoneToVault($project, $milestone);

            return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
        });
    }

    private function archiveMilestoneToVault(Project $project, ProjectMilestone $milestone): void
    {
        if (empty($milestone->content['gallery'])) return;

        $filePath = $milestone->content['gallery'][0];
        $exists = \App\Models\ProjectDocument::where('project_id', $project->id)
            ->where('file_path', $filePath)
            ->exists();

        if (!$exists) {
            \App\Models\ProjectDocument::create([
                'project_id' => $project->id,
                'uploader_id' => $milestone->notaris_id ?? $milestone->arsitek_id ?? $milestone->kontraktor_id ?? Auth::id(),
                'file_name' => $milestone->title,
                'file_path' => $filePath,
                'file_type' => 'official_document',
                'category' => $milestone->phase_context === 'legal' ? 'legal' : (($milestone->phase_context === 'build' || $milestone->phase_context === 'structure' || $milestone->phase_context === 'mep') ? 'technical' : 'others'),
                'status' => 'verified'
            ]);
        }
    }

    /**
     * PM verifies the progress quality.
     */
    public function verifyMilestonePM(Project $project, ProjectMilestone $milestone)
    {
        // Only the assigned PM can verify
        if ((int)$project->pm_id !== (int)Auth::id()) {
            return response()->json(['message' => 'Only the assigned project manager can verify progress.'], 403);
        }

        if (!$milestone->is_completed && $milestone->approval_status !== 'pending') {
            return response()->json(['message' => 'Milestone must be submitted for review or marked as completed first.'], 422);
        }

        return \DB::transaction(function () use ($project, $milestone) {
            $milestone->update(['pm_verified_at' => now()]);

            // Automatically unlock any linked payment termins
            ProjectPaymentTermin::where('milestone_id', $milestone->id)
                ->where('status', 'locked')
                ->update(['status' => 'pending']);

            $this->logActivity($project, "milestone_pm_verified", "PM Verified Progress: {$milestone->title}");

            return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user', 'pm.user'])]);
        });
    }

    public function requestMilestoneRevision(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        $isOwner = ($user->role_type === 'user' && $project->user_id === $user->id);
        $isHiredPM = ($user->role_type === 'project_manager' && (int)$project->pm_id === (int)$user->id);

        if (!$isOwner && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner or hired Project Manager can request revisions.'], 403);
        }

        $request->validate([
            'revision_notes' => 'required|string',
        ]);

        $content = $milestone->content ?? [];
        if ($milestone->revision_notes) {
            $history = $content['revision_history'] ?? [];
            $history[] = [
                'note' => $milestone->revision_notes,
                'date' => now()->toIso8601String(),
                'version' => count($history) + 1
            ];
            $content['revision_history'] = $history;
        }

        $milestone->update([
            'is_completed' => false,
            'approval_status' => 'revision',
            'revision_notes' => $request->revision_notes,
            'content' => $content,
        ]);

        $this->logActivity($project, "milestone_revision", "Revision requested for: {$milestone->title}");

        return response()->json(['data' => $milestone->load(['arsitek.user', 'kontraktor.user'])]);
    }

    public function deleteMilestone(Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();

        // Block owners from deleting milestones
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Security: Professional can only delete their own milestones
        if ($user->role_type === 'arsitek' && $milestone->arsitek_id !== $user->arsitek?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'kontraktor' && $milestone->kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'notaris' && $milestone->notaris_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'interior' && $milestone->interior_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        if ($user->role_type === 'project_manager' && $milestone->pm_id !== $user->project_manager?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $title = $milestone->title;
        $milestone->delete();
        $this->logActivity($project, 'milestone_deleted', "Removed milestone: {$title}");

        return response()->json(['message' => 'Deleted']);
    }

    // --- COMMENTS ---
    public function getComments(Project $project)
    {
        return response()->json(['data' => $project->comments()->with(['user', 'parent.user'])->get()]);
    }

    public function storeComment(Request $request, Project $project)
    {
        $request->validate([
            'message' => 'required|string|max:1000',
            'parent_id' => 'nullable|exists:project_comments,id',
        ]);
        $comment = $project->comments()->create([
            'user_id' => Auth::id(),
            'message' => $request->message,
            'parent_id' => $request->parent_id,
        ]);
        $comment->load(['user', 'parent.user']);
        $this->logActivity($project, 'comment_posted', 'Posted a comment');

        // --- Notification Logic ---
        $targetUserId = null;
        if ($request->parent_id && $comment->parent) {
            if ($comment->parent->user_id !== Auth::id()) {
                $targetUserId = $comment->parent->user_id;
            }
        } elseif ($project->user_id !== Auth::id()) {
            $targetUserId = $project->user_id;
        }

        if ($targetUserId) {
            Notification::create([
                'user_id' => $targetUserId,
                'type' => 'project_message',
                'title' => 'New Project Q&A Message',
                'body' => Auth::user()->name.' posted a message on project "'.$project->title.'".',
                'data' => ['project_id' => $project->id],
            ]);
        }

        return response()->json(['data' => $comment]);
    }

    public function updateComment(Request $request, Project $project, ProjectComment $comment)
    {
        if ($comment->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized. You can only edit your own messages.'], 403);
        }

        $request->validate(['message' => 'required|string|max:1000']);
        $comment->update(['message' => $request->message]);

        return response()->json(['data' => $comment]);
    }

    public function deleteComment(Project $project, ProjectComment $comment)
    {
        // Only author or project owner can delete
        if ($comment->user_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $comment->delete();

        return response()->json(['message' => 'Comment deleted']);
    }

    // --- DOCUMENTS ---
    public function getDocuments(Project $project)
    {
        return response()->json(['data' => $project->documents()->with('uploader')->get()]);
    }

    public function storeDocument(Request $request, Project $project)
    {
        $request->validate([
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,png,xlsx,xls,dwg,zip|max:20480',
            'category' => 'nullable|string|max:50',
            'status' => 'nullable|string|in:uploaded,under_review,awaiting_signature,legally_binding',
            'target_role' => 'nullable|string|in:structural,mep,architect',
        ]);

        $file = $request->file('file');
        $path = $file->store('project_documents', 'public');

        $document = $project->documents()->create([
            'uploader_id' => Auth::id(),
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $path,
            'file_type' => $file->extension(),
            'category' => $request->category ?? 'general',
            'status' => $request->status ?? 'uploaded',
            'target_role' => $request->target_role,
        ]);

        $document->load('uploader');
        $this->logActivity($project, 'document_uploaded', "Uploaded: {$file->getClientOriginalName()}");

        return response()->json(['data' => $document]);
    }

    public function deleteDocument(Project $project, ProjectDocument $document)
    {
        if ($document->uploader_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $name = $document->file_name;
        Storage::disk('public')->delete($document->file_path);
        $document->delete();
        $this->logActivity($project, 'document_deleted', "Removed: {$name}");

        return response()->json(['message' => 'Deleted']);
    }

    // --- RATINGS ---
    public function rateProject(Request $request, Project $project)
    {
        $user = Auth::user();

        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Only the project owner can leave a rating.'], 403);
        }

        if ($project->status !== 'completed') {
            return response()->json(['message' => 'Project must be completed before rating.'], 422);
        }

        $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'komentar' => 'nullable|string|max:1000',
            'target_type' => 'required|in:arsitek,kontraktor',
        ]);

        if ($request->target_type === 'arsitek' && $project->selected_arsitek_id) {
            $existing = \App\Models\ArsitekRating::where('project_id', $project->id)
                ->where('user_id', $user->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already rated the architect for this project.'], 422);
            }

            \App\Models\ArsitekRating::create([
                'user_id' => $user->id,
                'arsitek_id' => $project->selected_arsitek_id,
                'project_id' => $project->id,
                'rating' => $request->rating,
                'komentar' => $request->komentar ?? '',
            ]);
            $this->logActivity($project, 'rating_given', "Rated architect {$request->rating}/5 stars");
        } elseif ($request->target_type === 'kontraktor' && $project->selected_kontraktor_id) {
            $existing = \App\Models\KontraktorRating::where('project_id', $project->id)
                ->where('user_id', $user->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already rated the contractor for this project.'], 422);
            }

            \App\Models\KontraktorRating::create([
                'user_id' => $user->id,
                'kontraktor_id' => $project->selected_kontraktor_id,
                'project_id' => $project->id,
                'rating' => $request->rating,
                'komentar' => $request->komentar ?? '',
            ]);
            $this->logActivity($project, 'rating_given', "Rated contractor {$request->rating}/5 stars");
        } else {
            return response()->json(['message' => 'No professional assigned for this type.'], 422);
        }

        return response()->json(['message' => 'Rating submitted successfully!']);
    }

    // --- ACTIVITY LOG ---
    public function getActivity(Project $project)
    {
        $logs = $project->activityLogs()->with('user')->limit(50)->get();

        return response()->json(['data' => $logs]);
    }

    // --- HELPER ---
    private function logActivity(Project $project, string $action, string $details): void
    {
        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }

    // --- REQUIREMENTS ---
    public function getRequirements(Project $project)
    {
        return response()->json(['data' => $project->requirements]);
    }

    public function storeRequirement(Request $request, Project $project)
    {
        $user = Auth::user();
        
        // Authorization: Owner or Hired Pros only
        $isOwner = $project->user_id === $user->id;
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredMep = $user->role_type === 'mep' && $project->mep_id === $user->id;
        $isHiredStructural = $user->role_type === 'structural' && $project->structural_id === $user->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isHiredArsitek && !$isHiredKontraktor && !$isHiredMep && !$isHiredStructural && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner or hired professionals can manage requirements.'], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'quantity_required' => 'required|numeric|min:0',
            'unit' => 'required|string|max:50',
            'quality_level' => 'nullable|string|in:standard,premium,luxury',
            'notes' => 'nullable|string',
        ]);

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('requirements', 'public');
        }

        $requirement = $project->requirements()->create([
            'name' => $request->name,
            'quantity_required' => $request->quantity_required,
            'unit' => $request->unit,
            'quality_level' => $request->quality_level ?? 'standard',
            'notes' => $request->notes,
            'image_path' => $imagePath,
            'quantity_on_site' => 0,
            'quantity_used' => 0,
        ]);

        $this->logActivity($project, 'requirement_added', "Added material requirement: {$request->name} ({$request->quantity_required} {$request->unit})");

        return response()->json(['data' => $requirement]);
    }

    public function updateRequirement(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $user = Auth::user();
        
        // Authorization: Owner or Hired Pros only
        $isOwner = $project->user_id === $user->id;
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredMep = $user->role_type === 'mep' && $project->mep_id === $user->id;
        $isHiredStructural = $user->role_type === 'structural' && $project->structural_id === $user->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isHiredArsitek && !$isHiredKontraktor && !$isHiredMep && !$isHiredStructural && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner or hired professionals can manage requirements.'], 403);
        }

        $request->validate([
            'name' => 'nullable|string|max:255',
            'quantity_required' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
            'quality_level' => 'nullable|string|in:standard,premium,luxury',
            'notes' => 'nullable|string',
        ]);

        $requirement->update($request->only(['name', 'quantity_required', 'unit', 'quality_level', 'notes']));

        return response()->json(['data' => $requirement]);
    }

    public function deleteRequirement(Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $user = Auth::user();
        
        // Authorization: Owner or Hired Pros only
        $isOwner = $project->user_id === $user->id;
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredMep = $user->role_type === 'mep' && $project->mep_id === $user->id;
        $isHiredStructural = $user->role_type === 'structural' && $project->structural_id === $user->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isHiredArsitek && !$isHiredKontraktor && !$isHiredMep && !$isHiredStructural && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner or hired professionals can manage requirements.'], 403);
        }

        $name = $requirement->name;
        $requirement->delete();
        $this->logActivity($project, 'requirement_deleted', "Removed material requirement: {$name}");

        return response()->json(['message' => 'Deleted']);
    }

    public function logExternalProcurement(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $user = Auth::user();
        
        // Authorization: Only the owner or the hired contractor can log external procurement
        $isOwner = $project->user_id === $user->id;
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isHiredKontraktor && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner, hired contractor, or Project Manager can log manual supplies.'], 403);
        }

        $request->validate([
            'quantity' => 'required|numeric|min:0.01',
            'unit_cost' => 'nullable|numeric|min:0',
        ]);

        $totalCost = ($request->unit_cost ?? 0) * $request->quantity;

        $requirement->increment('quantity_procured_externally', $request->quantity);
        $requirement->increment('quantity_on_site', $request->quantity);
        $requirement->increment('external_cost', $totalCost);

        $this->logActivity($project, 'external_procurement', "Manually registered {$request->quantity} {$requirement->unit} of {$requirement->name} (Cost: Rp " . number_format($totalCost, 0, ',', '.') . ")");

        return response()->json(['data' => $requirement]);
    }

    public function logRequirementUsage(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $request->validate([
            'quantity' => 'required|numeric|min:0.01',
        ]);

        if ($requirement->quantity_on_site < $request->quantity) {
            return response()->json(['message' => 'Insufficient stock on site.'], 422);
        }

        $requirement->increment('quantity_used', $request->quantity);
        $requirement->decrement('quantity_on_site', $request->quantity);

        $this->logActivity($project, 'material_used', "Used {$request->quantity} {$requirement->unit} of {$requirement->name}");

        return response()->json(['data' => $requirement]);
    }

    /**
     * Contractor requests procurement assistance from PM/Owner.
     */
    public function requestProcurement(Request $request, Project $project, \App\Models\ProjectRequirement $requirement)
    {
        $user = Auth::user();

        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isHiredKontraktor && !$isHiredPM) {
            return response()->json(['message' => 'Unauthorized. Only the hired contractor or PM can request procurement.'], 403);
        }

        $validated = $request->validate([
            'quantity_needed' => 'required|numeric|min:0.01',
            'message' => 'nullable|string|max:500',
            'offer_to_buy' => 'nullable|boolean',
        ]);

        $qtyNeeded = $validated['quantity_needed'];
        $message = $validated['message'] ?? '';
        $offerToBuy = $validated['offer_to_buy'] ?? false;

        \DB::beginTransaction();
        try {
            // 1. Create a persistent record
            $procurementRequest = ProjectProcurementRequest::create([
                'project_id' => $project->id,
                'requirement_id' => $requirement->id,
                'requested_by' => $user->id,
                'quantity_needed' => $qtyNeeded,
                'message' => $message,
                'offer_to_buy' => $offerToBuy,
                'status' => 'pending_pm', // Starts with PM gate
            ]);

            $shortage = max(0, $requirement->quantity_required - $requirement->quantity_on_site - $requirement->quantity_used);

            $notifBody = $offerToBuy
                ? "{$user->name} offers to procure {$qtyNeeded} {$requirement->unit} of \"{$requirement->name}\" on your behalf. {$message}"
                : "{$user->name} reports that {$qtyNeeded} {$requirement->unit} of \"{$requirement->name}\" is needed on-site. Current shortage: {$shortage} {$requirement->unit}. {$message}";

            // Notify PM (if exists)
            if ($project->pm_id) {
                \App\Models\Notification::create([
                    'user_id' => $project->pm_id,
                    'type' => 'procurement_request',
                    'title' => $offerToBuy ? 'Contractor Offers to Procure Material' : 'Material Procurement Needed',
                    'body' => $notifBody,
                    'data' => [
                        'project_id' => $project->id, 
                        'requirement_id' => $requirement->id,
                        'request_id' => $procurementRequest->id
                    ],
                ]);
            }

            // Always notify Owner
            \App\Models\Notification::create([
                'user_id' => $project->user_id,
                'type' => 'procurement_request',
                'title' => $offerToBuy ? 'Contractor Offers to Buy Material' : 'Material Shortage Alert',
                'body' => $notifBody,
                'data' => [
                    'project_id' => $project->id, 
                    'requirement_id' => $requirement->id,
                    'request_id' => $procurementRequest->id
                ],
            ]);

            $this->logActivity($project, 'procurement_requested', "{$user->name} requested procurement: {$qtyNeeded} {$requirement->unit} of {$requirement->name}" . ($offerToBuy ? ' (offered to buy)' : ''));

            \DB::commit();

            return response()->json([
                'message' => 'Procurement request sent to ' . ($project->pm_id ? 'PM and Owner' : 'Owner') . '.',
                'data' => $procurementRequest
            ]);
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Failed to record procurement request: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Get all pending procurement requests for a project.
     */
    public function getProcurementRequests(Request $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $user->id === $project->user_id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $requests = ProjectProcurementRequest::where('project_id', $project->id)
            ->with(['requirement', 'requester'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $requests]);
    }

    /**
     * Gate 2: PM verifies technical necessity and forwards to Owner with estimated cost.
     */
    public function pmVerifyProcurement(Request $request, Project $project, ProjectProcurementRequest $procurementRequest)
    {
        $user = Auth::user();

        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the assigned PM can verify procurement requests.'], 403);
        }

        $request->validate([
            'estimated_cost' => 'required|numeric|min:0',
            'pm_note' => 'nullable|string|max:500',
        ]);

        if ($procurementRequest->status !== 'pending_pm') {
            return response()->json(['message' => 'Request is not in a verifiable state'], 422);
        }

        \DB::beginTransaction();
        try {
            $procurementRequest->update([
                'estimated_cost' => $request->estimated_cost,
                'pm_note' => $request->pm_note,
                'status' => 'pending_owner',
            ]);

            $requirement = $procurementRequest->requirement;

            // Create a Budget Addendum for the Owner to approve
            $addendum = ProjectAddendum::create([
                'project_id' => $project->id,
                'role_type' => 'pm_material',
                'user_id' => $user->id,
                'title' => "Material Procurement: {$requirement->name}",
                'description' => "Request for {$procurementRequest->quantity_needed} {$requirement->unit} of {$requirement->name}. PM Note: " . ($request->pm_note ?? 'Verified by PM'),
                'amount' => $request->estimated_cost,
                'status' => 'pending_approval',
                'procurement_request_id' => $procurementRequest->id,
            ]);

            // Notify Owner
            \App\Models\Notification::create([
                'user_id' => $project->user_id,
                'type' => 'budget_approval_needed',
                'title' => 'Budget Authorization Needed',
                'body' => "PM has verified a procurement request for {$requirement->name}. Authorize Rp " . number_format($request->estimated_cost, 0, ',', '.') . " to proceed.",
                'data' => [
                    'project_id' => $project->id,
                    'addendum_id' => $addendum->id,
                    'request_id' => $procurementRequest->id
                ],
            ]);

            $this->logActivity($project, 'procurement_verified', "PM verified procurement for {$requirement->name} with estimated cost Rp " . number_format($request->estimated_cost, 0, ',', '.'));

            \DB::commit();

            return response()->json(['message' => 'Request forwarded to Owner for budget approval.', 'data' => $procurementRequest]);
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Verification failed: ' . $e->getMessage()], 500);
        }
    }

    /**
     * PM rejects the procurement request.
     */
    public function pmRejectProcurement(Request $request, Project $project, ProjectProcurementRequest $procurementRequest)
    {
        $user = Auth::user();

        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate(['pm_note' => 'required|string|max:500']);

        $procurementRequest->update([
            'status' => 'rejected',
            'pm_note' => $request->pm_note,
        ]);

        // Notify Contractor
        \App\Models\Notification::create([
            'user_id' => $procurementRequest->requested_by,
            'type' => 'procurement_rejected',
            'title' => 'Procurement Request Rejected',
            'body' => "PM rejected your request for {$procurementRequest->requirement->name}. Note: {$request->pm_note}",
            'data' => ['project_id' => $project->id],
        ]);

        $this->logActivity($project, 'procurement_rejected', "PM rejected procurement for {$procurementRequest->requirement->name}.");

        return response()->json(['data' => $procurementRequest]);
    }

    /**
     * Architect approves the structural/MEP engineer's deliverables.
     */
    public function approveEngineeringIntegration(Request $request, Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'arsitek' || $project->selected_arsitek_id !== optional($user->arsitek)->id) {
            return response()->json(['message' => 'Only the hired architect can approve engineering integration.'], 403);
        }

        $validated = $request->validate([
            'role_type' => 'required|in:structural,mep',
        ]);

        $roleType = $validated['role_type'];

        if ($roleType === 'structural' && !$project->structural_id) {
            return response()->json(['message' => 'No structural engineer is assigned.'], 422);
        }
        if ($roleType === 'mep' && !$project->mep_id) {
            return response()->json(['message' => 'No MEP engineer is assigned.'], 422);
        }

        $field = $roleType === 'structural' ? 'structural_approved_at' : 'mep_approved_at';

        if ($project->{$field}) {
            return response()->json(['message' => ucfirst($roleType) . ' integration already approved.'], 422);
        }

        \DB::beginTransaction();
        try {
            $project->update([$field => now()]);
            $this->logActivity($project, 'engineering_approved', "Architect approved {$roleType} engineering integration.");
            \DB::commit();
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Failed to approve integration.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    /**
     * Architect requests revision from structural/MEP engineer.
     */
    public function requestEngineeringRevision(Request $request, Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'arsitek' || $project->selected_arsitek_id !== optional($user->arsitek)->id) {
            return response()->json(['message' => 'Only the hired architect can request revisions.'], 403);
        }

        $validated = $request->validate([
            'role_type' => 'required|in:structural,mep',
            'note' => 'required|string|max:1000',
        ]);

        $roleType = $validated['role_type'];

        // Reset approval if previously approved
        $field = $roleType === 'structural' ? 'structural_approved_at' : 'mep_approved_at';
        $project->update([$field => null]);

        // Mark all engineer documents as needing revision
        $project->documents()
            ->where('category', $roleType === 'structural' ? 'structural_calc' : 'mep_layout')
            ->update(['status' => 'revision_requested']);

        $this->logActivity($project, 'engineering_revision', "Architect requested {$roleType} revision: {$validated['note']}");

        return new ProjectResource($this->loadFullProject($project));
    }

    public function sealDesign(Project $project)
    {
        $user = Auth::user();

        // Security: only the assigned architect can seal the design
        if ($user->role_type !== 'arsitek' || $project->selected_arsitek_id !== optional($user->arsitek)->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired architect can seal the design.'], 403);
        }

        if ($project->requires_structural && !$project->structural_id) {
            return response()->json(['message' => 'A Structural Engineer is legally required but has not been hired yet.'], 422);
        }

        // Gate: structural must be approved if hired
        if ($project->structural_id && !$project->structural_approved_at) {
            return response()->json(['message' => 'Structural engineering integration must be approved before sealing the design.'], 422);
        }

        // Gate: MEP must be approved if hired
        if ($project->mep_id && !$project->mep_approved_at) {
            return response()->json(['message' => 'MEP engineering integration must be approved before sealing the design.'], 422);
        }

        // Check if all technical design milestones are completed (ignoring legal/contracts vault)
        $incomplete = $project->milestones()
            ->where('phase_context', '!=', 'legal')
            ->where('is_completed', false)
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All technical design milestones must be completed and approved before sealing the design.'], 422);
        }

        \DB::beginTransaction();
        try {
            $project->update([
                'design_handover_submitted_at' => now(),
                'design_handover_notes' => null
            ]);

            $this->logActivity($project, 'design_handover_submitted', "Architect submitted design package for PM verification.");
            \DB::commit();
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Failed to submit design handover.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    private function loadFullProject(Project $project)
    {
        return $project->load([
            'arsitek.user.phoneNumber',
            'kontraktor.user.phoneNumber',
            'notaris.user.phoneNumber',
            'interior.user.phoneNumber',
            'structuralEngineer.user.phoneNumber',
            'mepEngineer.user.phoneNumber',
            'bidsArsitek.arsitek.user.phoneNumber',
            'bidsKontraktor.kontraktor.user.phoneNumber',
            'bidsNotaris.notaris.user.phoneNumber',
            'bidsInterior.interior.user.phoneNumber',
            'bidsProjectManager.pm.user',
            'bidsStructural.structuralEngineer.user',
            'images',
            'milestones',
            'user',
            'ratings',
            'kontraktorRating',
            'materialOrders.deliveryJob',
            'requirements',
            'projectManager.user',
            'addendums',
            'documents.uploader'
        ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager', 'bidsStructural', 'bidsMep']);
    }

    // --- DAILY SITE LOGS ---
    public function getDailyLogs(Project $project)
    {
        $logs = $project->dailyLogs()->with('user')->get();
        return response()->json(['data' => $logs]);
    }

    public function storeDailyLog(Request $request, Project $project)
    {
        $user = Auth::user();

        // Only hired contractor can add logs
        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Only the hired contractor can add daily logs.'], 403);
        }

        $request->validate([
            'log_date' => 'required|date',
            'weather' => 'required|string|in:sunny,cloudy,rainy,stormy',
            'worker_count' => 'required|integer|min:0',
            'activities' => 'required|string|max:2000',
            'issues' => 'nullable|string|max:1000',
            'photos' => 'nullable|array|max:4',
            'photos.*' => 'image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $photoPaths = [];
        if ($request->hasFile('photos')) {
            foreach ($request->file('photos') as $photo) {
                $photoPaths[] = $photo->store('daily_logs', 'public');
            }
        }

        $log = $project->dailyLogs()->create([
            'user_id' => $user->id,
            'log_date' => $request->log_date,
            'weather' => $request->weather,
            'worker_count' => $request->worker_count,
            'activities' => $request->activities,
            'issues' => $request->issues,
            'photos' => $photoPaths,
        ]);

        $this->logActivity($project, 'daily_log_added', "Daily site log for " . $request->log_date);

        return response()->json(['data' => $log->load('user')]);
    }

    public function deleteDailyLog(Project $project, ProjectDailyLog $dailyLog)
    {
        $user = Auth::user();
        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Delete photos from storage
        if ($dailyLog->photos) {
            foreach ($dailyLog->photos as $path) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($path);
            }
        }

        $dailyLog->delete();
        return response()->json(['message' => 'Log deleted']);
    }

    // --- PAYMENT TERMINS ---
    public function getPaymentTermins(Project $project)
    {
        return response()->json(['data' => $project->paymentTermins()->with('milestone')->get()]);
    }

    public function storePaymentTermin(Request $request, Project $project)
    {
        $user = Auth::user();

        // Professionals or PM can create termins
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'label' => 'required|string|max:255',
            'percentage' => 'required|numeric|min:0|max:100',
            'amount' => 'required|integer|min:0',
            'trigger_description' => 'nullable|string|max:255',
            'status' => 'nullable|string|in:locked,pending,invoice_sent,paid',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
            'role_type' => 'nullable|string|in:arsitek,kontraktor,mep,interior,notaris',
        ]);

        $termin = $project->paymentTermins()->create([
            'label' => $request->label,
            'percentage' => $request->percentage,
            'amount' => $request->amount,
            'trigger_description' => $request->trigger_description,
            'status' => $request->status ?? 'locked',
            'milestone_id' => $request->milestone_id,
            'notes' => $request->notes,
            'role_type' => $request->role_type ?? $user->role_type,
            'recipient_id' => ($request->role_type && $request->role_type !== $user->role_type) ? null : $user->id,
        ]);
        

        $this->logActivity($project, 'termin_added', "Payment termin added: {$request->label}");

        return response()->json(['data' => $termin->load('milestone')]);
    }

    public function updatePaymentTermin(Request $request, Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();
        $isAuthor = $termin->recipient_id === $user->id;
        $isOwner = $project->user_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->project_manager?->id;

        if (!$isAuthor && !$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'label' => 'nullable|string|max:255',
            'percentage' => 'nullable|numeric|min:0|max:100',
            'amount' => 'nullable|integer|min:0',
            'trigger_description' => 'nullable|string|max:255',
            'status' => 'nullable|string|in:locked,pending,invoice_sent,paid',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
        ]);

        $updateData = $request->only(['label', 'percentage', 'amount', 'trigger_description', 'status', 'milestone_id', 'notes']);

        // If status changes to 'paid', record the timestamp
        if (isset($updateData['status']) && $updateData['status'] === 'paid' && $termin->status !== 'paid') {
            $updateData['paid_at'] = now();

            // Record in budget ledger (Link professional verification to balance reduction)
            \App\Models\ProjectBudgetTransaction::updateOrCreate(
                [
                    'project_id' => $project->id,
                    'reference_model' => 'App\Models\ProjectPaymentTermin',
                    'reference_id' => $termin->id,
                ],
                [
                    'transaction_type' => 'payment',
                    'amount' => $termin->amount,
                    'title' => "Paid Termin: {$termin->label} (Verified by Recipient)",
                    'transaction_date' => now(),
                ]
            );
        }
        

        $termin->update($updateData);

        return response()->json(['data' => $termin->load('milestone')]);
    }

    public function deletePaymentTermin(Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();
        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $termin->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function sealConstruction(Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'kontraktor' || $project->selected_kontraktor_id !== $user->kontraktor?->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired contractor can seal construction.'], 403);
        }

        // Check all contractor milestones are completed
        $incomplete = $project->milestones()
            ->where('phase_context', 'construction')
            ->where('is_completed', false)
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All construction milestones must be completed before sealing.'], 422);
        }

        \DB::beginTransaction();
        try {
            $project->update([
                'construction_handover_submitted_at' => now(),
                'construction_handover_notes' => null
            ]);

            $this->logActivity($project, 'construction_handover_submitted', "Contractor submitted construction handover for PM verification.");
            \DB::commit();
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Failed to submit construction handover.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function sealInterior(Project $project)
    {
        $user = Auth::user();

        if ($user->role_type !== 'interior' || $project->selected_interior_id !== optional($user->interior_profile)->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired interior designer can seal.'], 403);
        }

        // Check all interior milestones are completed
        $incomplete = $project->milestones()
            ->where('phase_context', 'interior')
            ->where('is_completed', false)
            ->exists();

        if ($incomplete) {
            return response()->json(['message' => 'All interior design milestones must be completed and approved before sealing.'], 422);
        }

        \DB::beginTransaction();
        try {
            $project->update([
                'interior_handover_submitted_at' => now(),
                'interior_handover_notes' => null
            ]);

            $this->logActivity($project, 'interior_handover_submitted', "Interior designer submitted handover for PM verification.");
            \DB::commit();
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Failed to submit interior handover.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function createFurnitureAddendum(Request $request, Project $project, ProjectMilestone $milestone)
    {
        $user = Auth::user();
        // Validation: Only the hired interior designer can request furniture payment
        if ($user->role_type !== 'interior' || $project->selected_interior_id !== optional($user->interior_profile)->id) {
            return response()->json(['message' => 'Unauthorized. Only the hired interior designer can request furniture payment.'], 403);
        }

        $request->validate([
            'furniture_item_id' => 'required',
        ]);

        $itemId = $request->furniture_item_id;
        $content = $milestone->content ?? [];
        $items = $content['furniture_items'] ?? [];
        
        $itemIndex = -1;
        foreach($items as $index => $item) {
            if ($item['id'] === $itemId) {
                $itemIndex = $index;
                break;
            }
        }

        if ($itemIndex === -1) {
            return response()->json(['message' => 'Furniture item not found in this room.'], 404);
        }

        $item = $items[$itemIndex];

        if (isset($item['addendum_id'])) {
            return response()->json(['message' => 'Payment request already exists for this item.'], 422);
        }

        return \DB::transaction(function () use ($project, $milestone, $content, $items, $itemIndex, $item) {
            $addendum = ProjectAddendum::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'role_type' => 'interior',
                'title' => "Furniture: " . $item['name'],
                'description' => "Item Procurement for " . ($item['brand'] ?? $item['name']) . " in " . $milestone->title,
                'amount' => $item['price'],
                'status' => 'pending_approval'
            ]);

            $items[$itemIndex]['addendum_id'] = $addendum->id;
            $newContent = $content;
            $newContent['furniture_items'] = $items;
            $milestone->update(['content' => $newContent]);

            $this->logActivity($project, 'furniture_procurement_requested', "Interior Designer requested payment for: " . $item['name']);

            return response()->json(['data' => $addendum]);
        });
    }

    public function approveHandover(Request $request, Project $project)
    {
        $user = Auth::user();
        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. Only the assigned PM can approve handovers.'], 403);
        }

        $phase = $request->input('phase'); // design, build, interior
        
        \DB::beginTransaction();
        try {
            $completed = $project->completed_phases ?? [];
            $attributes = [];

            if ($phase === 'design') {
                $attributes['design_completed_at'] = now();
                $attributes['status'] = 'procurement';
                if (in_array('build', $project->needed_phases ?? [])) {
                    $attributes['target_role'] = 'both';
                }
                if (!in_array('design', $completed)) $completed[] = 'design';
            } elseif ($phase === 'build') {
                $attributes['construction_completed_at'] = now();
                $attributes['status'] = 'completed_build';
                if (!in_array('build', $completed)) $completed[] = 'build';
            } elseif ($phase === 'interior') {
                $attributes['interior_completed_at'] = now();
                if (!in_array('interior', $completed)) $completed[] = 'interior';
            }

            $attributes['completed_phases'] = $completed;
            $project->update($attributes);

            $this->logActivity($project, "{$phase}_handover_approved", "PM approved the technical handover for {$phase} phase.");
            \DB::commit();
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Approval failed'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }

    public function requestHandoverRevision(Request $request, Project $project)
    {
        $user = Auth::user();
        if ($user->role_type !== 'project_manager' || $project->pm_id !== $user->id) {
             return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'phase' => 'required|string|in:design,build,interior',
            'notes' => 'required|string|max:1000'
        ]);

        $phase = $request->phase;
        $column = "{$phase}_handover_submitted_at";
        $notesColumn = "{$phase}_handover_notes";

        $project->update([
            $column => null,
            $notesColumn => $request->notes
        ]);

        $this->logActivity($project, "{$phase}_handover_revision", "PM requested revisions for {$phase} handover: {$request->notes}");

        return new ProjectResource($this->loadFullProject($project));
    }

        return new ProjectResource($this->loadFullProject($project));
    }
    public function sealLegal(Project $project)
    {
        $user = Auth::user();

        $isOwner = $user->id === $project->user_id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;
        $isNotary = $user->role_type === 'notaris' && $project->selected_notaris_id === optional($user->notaris_profile)->id;
        $isArchitect = $user->role_type === 'arsitek' && $project->selected_arsitek_id === optional($user->arsitek)->id;

        if (!$isNotary && !$isOwner && !$isPM && !$isArchitect) {
            return response()->json(['message' => 'Unauthorized. Only the hired notary, architect, Owner, or PM can seal the legal phase.'], 403);
        }

        // Optional: Check if all milestones are completed
        $incomplete = $project->milestones()->where('phase_context', 'legal')->where('is_completed', false)->exists();
        if ($incomplete) {
            return response()->json(['message' => 'All legal milestones must be completed and approved before sealing.'], 422);
        }

        \DB::beginTransaction();
        try {
            $completed = $project->completed_phases ?? [];
            if (!in_array('legal', $completed)) {
                $completed[] = 'legal';
            }

            $project->update([
                'legal_completed_at' => now(),
                'completed_phases' => $completed,
            ]);

            $actor = $isNotary ? 'Notary' : ($isArchitect ? 'Architect' : ($isPM ? 'Project Manager' : 'Project Owner'));
            $this->logActivity($project, 'legal_sealed', "{$actor} formally sealed and finalized the legal phase.");
            \DB::commit();
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['message' => 'Failed to seal legal phase.'], 500);
        }

        return new ProjectResource($this->loadFullProject($project));
    }
    // --- LEGAL FINANCIALS & LEDGER ---
    public function getLegalFinancials(Project $project)
    {
        // Find the accepted notary bid to get the pre-allocated tax budget
        $notaryBid = BidNotaris::where('project_id', $project->id)->where('status', 'accepted')->first();
        
        // Sum up all approved disbursements that are tagged as 'legal' or 'disbursement'
        $disbursements = $project->addendums()
            ->where('role_type', 'notaris')
            ->get();

        return response()->json([
            'allocated_tax' => $notaryBid ? (float)$notaryBid->tax_estimate : 0,
            'professional_fee' => $notaryBid ? (float)$notaryBid->price : 0,
            'disbursements' => $disbursements,
            'total_spent' => (float)$disbursements->where('status', 'paid')->sum('amount'),
            'pending_approval' => (float)$disbursements->where('status', 'pending_approval')->sum('amount'),
        ]);
    }

    public function requestLegalDisbursement(Request $request, Project $project)
    {
        $user = Auth::user();
        $request->validate([
            'title' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'description' => 'required|string',
        ]);

        if ($user->role_type !== 'notaris') {
            return response()->json(['message' => 'Only the hired notary can request disbursements.'], 403);
        }

        $addendum = $project->addendums()->create([
            'user_id' => $user->id,
            'role_type' => 'notaris',
            'title' => '[Legal Disbursement] ' . $request->title,
            'description' => $request->description,
            'amount' => $request->amount,
            'status' => 'pending_approval'
        ]);

        $this->logActivity($project, 'legal_disbursement_requested', "Notary requested disbursement of Rp " . number_format($request->amount, 0, ',', '.') . " for: " . $request->title);

        return response()->json(['data' => $addendum]);
    }

    public function verifyLegalDisbursement(Request $request, Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        $isOwner = $user->id === $project->user_id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only the Owner or PM can verify disbursements.'], 403);
        }

        $request->validate(['status' => 'required|in:paid,rejected']);

        $addendum->update([
            'status' => $request->status,
            'paid_at' => $request->status === 'paid' ? now() : null
        ]);

        // If approved, create a real budget transaction to deduct from the master budget
        if ($request->status === 'paid') {
            $project->budgetTransactions()->create([
                'transaction_type' => 'payment',
                'amount' => $addendum->amount,
                'title' => $addendum->title,
                'reference_model' => 'ProjectAddendum',
                'reference_id' => $addendum->id,
                'transaction_date' => now(),
            ]);
        }

        $this->logActivity($project, 'legal_disbursement_verified', "{$request->status} disbursement order '{$addendum->title}'");

        return response()->json(['data' => $addendum]);
    }

    public function requestEngineeringRole(Request $request, Project $project)
    {
        $user = Auth::user();
        $request->validate([
            'role_type' => 'required|in:structural,mep',
            'suggested_fee' => 'nullable|numeric|min:0',
            'description' => 'required|string|max:1000',
        ]);

        $isArchitect = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isArchitect && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only the Architect or PM can request engineering roles.'], 403);
        }

        $addendum = $project->addendums()->create([
            'user_id' => $user->id,
            'role_type' => $request->role_type,
            'title' => "[Role Request] " . strtoupper($request->role_type) . " Specialist",
            'description' => $request->description,
            'amount' => $request->suggested_fee ?? 0,
            'status' => 'pending_approval'
        ]);

        $this->logActivity($project, 'engineering_requested', "Architect requested hiring of a " . strtoupper($request->role_type) . " specialist.");

        return response()->json(['data' => $addendum]);
    }

    public function verifyEngineeringRequest(Request $request, Project $project, \App\Models\ProjectAddendum $addendum)
    {
        $user = Auth::user();
        $isOwner = $user->id === $project->user_id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isPM && !$isOwner) {
            return response()->json(['message' => 'Unauthorized. Only the PM (or Owner as fallback) can authorize engineering roles.'], 403);
        }

        $request->validate(['status' => 'required|in:approved,rejected']);

        $dbStatus = $request->status === 'approved' ? 'approved_unpaid' : 'rejected';
        $addendum->update(['status' => $dbStatus]);

        if ($request->status === 'approved') {
            $roles = $project->published_bidding_roles ?? [];
            if (!in_array($addendum->role_type, $roles)) {
                $roles[] = $addendum->role_type;
            }

            $updateData = ['published_bidding_roles' => $roles];
            if ($addendum->role_type === 'structural') $updateData['requires_structural'] = true;
            if ($addendum->role_type === 'mep') $updateData['requires_mep'] = true;

            $project->update($updateData);
        }

        $this->logActivity($project, 'engineering_request_verified', "{$request->status} hiring request for " . strtoupper($addendum->role_type));

        return response()->json(['data' => $addendum]);
    }

    public function approveEngineeringHire(Request $request, Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        if ($user->id !== $project->user_id) {
            return response()->json(['message' => 'Unauthorized. Only the Project Owner can authorize budget commitments.'], 403);
        }

        if ($addendum->status !== 'pending_approval') {
            return response()->json(['message' => 'This request is not pending approval.'], 400);
        }

        return DB::transaction(function () use ($project, $addendum) {
            $totalDeduction = $addendum->amount;

            if ($project->budget < $totalDeduction) {
                return response()->json(['message' => 'Insufficient project budget.'], 400);
            }

            // Hire the engineer based on the recommended bid
            $bidType = $addendum->recommended_bid_type;
            $bidId = $addendum->recommended_bid_id;

            if ($bidType === 'structural') {
                $bid = BidStructural::findOrFail($bidId);
                $bid->update(['status' => 'accepted']);
                BidStructural::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);
                $project->update(['structural_id' => $bid->structural_id]);
                $bidderUserId = $bid->structuralEngineer->user_id;
            } elseif ($bidType === 'mep') {
                $bid = BidMep::findOrFail($bidId);
                $bid->update(['status' => 'accepted']);
                BidMep::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);
                $project->update(['mep_id' => $bid->mep_id]);
                $bidderUserId = $bid->mepEngineer->user_id;
            } else {
                return response()->json(['message' => 'Invalid bid type in addendum.'], 400);
            }

            // Deduct budget
            $project->update(['budget' => $project->budget - $totalDeduction]);

            // Log Transaction
            ProjectBudgetTransaction::create([
                'project_id' => $project->id,
                'transaction_type' => 'adjustment_down',
                'amount' => $totalDeduction,
                'title' => ucwords($bidType) . " Engineering Hire Authorization",
                'reference_model' => "ProjectAddendum",
                'reference_id' => $addendum->id,
                'transaction_date' => now(),
            ]);

            $addendum->update(['status' => 'approved_unpaid']);

            Notification::create([
                'user_id' => $bidderUserId,
                'type' => 'bid_accepted',
                'title' => 'Engineering Bid Accepted!',
                'body' => "Your bid for project \"{$project->title}\" has been authorized by the owner.",
                'data' => ['project_id' => $project->id],
            ]);

            $this->logActivity($project, 'engineering_hired', "Owner authorized hiring of " . strtoupper($bidType) . " specialist.");

            return response()->json(['data' => $addendum]);
        });
    }

    public function rejectEngineeringHire(Request $request, Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        $isOwner = $user->id === $project->user_id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $addendum->update(['status' => 'rejected']);

        $this->logActivity($project, 'engineering_hire_rejected', "Hiring request for " . strtoupper($addendum->role_type) . " was rejected.");

        return response()->json(['data' => $addendum]);
    }
}
