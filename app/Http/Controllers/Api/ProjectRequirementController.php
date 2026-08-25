<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectRequirement;
use App\Models\ProjectProcurementRequest;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectRequirementController extends Controller
{
    public function index(Project $project)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json(['data' => $project->requirements()->with(['user', 'folder'])->get()]);
    }

    public function store(Request $request, Project $project)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'quantity_required' => 'required|numeric|min:0',
            'unit' => 'required|string|max:50',
            'bom_type' => 'required|string|in:raw,finishing',
            'quality_level' => 'nullable|string|in:standard,premium,luxury',
            'category' => 'nullable|string|in:structural,architecture,mep,interior,general',
            'estimated_unit_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'purpose' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120', // SVG rejected
            'folder_id' => 'nullable|exists:project_material_folders,id',
        ]);

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('requirements', 'railway');
        }

        $requirement = $project->requirements()->create(array_merge($validated, [
            'user_id' => $user->id,
            'image_path' => $imagePath,
            'quantity_on_site' => 0,
            'quantity_used' => 0,
        ]));

        $this->logActivity($project, 'requirement_added', "Added material: {$validated['name']}");

        \App\Models\ProjectRequirementHistory::create([
            'project_requirement_id' => $requirement->id,
            'user_id' => $user->id,
            'type' => 'restock',
            'quantity' => 0,
            'notes' => 'Material requirement created',
        ]);

        return response()->json(['data' => $requirement->load('user')]);
    }

    public function update(Request $request, Project $project, ProjectRequirement $requirement)
    {
        $user = Auth::user();

        // Binding check: the requirement must belong to THIS project.
        if ((int) $requirement->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => 'nullable|string|max:255',
            'quantity_required' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
            'bom_type' => 'nullable|string|in:raw,finishing',
            'category' => 'nullable|string|in:structural,architecture,mep,interior,general',
            'quality_level' => 'nullable|string|in:standard,premium,luxury',
            'estimated_unit_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'purpose' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120', // SVG rejected
            'folder_id' => 'nullable|exists:project_material_folders,id',
        ]);

        if ($request->hasFile('image')) {
            $validated['image_path'] = $request->file('image')->store('requirements', 'railway');
        }

        $oldFolderId = $requirement->folder_id;
        $oldBomType = $requirement->bom_type;
        
        $requirement->update($validated);
        
        // Log folder move
        if (array_key_exists('folder_id', $validated) && $validated['folder_id'] != $oldFolderId) {
            $oldFolderName = 'Unassigned';
            if ($oldFolderId) {
                $folder = \App\Models\ProjectMaterialFolder::find($oldFolderId);
                $oldFolderName = $folder ? $folder->name : 'Deleted Folder';
            }
            
            $newFolderName = 'Unassigned';
            if ($validated['folder_id']) {
                $folder = \App\Models\ProjectMaterialFolder::find($validated['folder_id']);
                $newFolderName = $folder ? $folder->name : 'Deleted Folder';
            }
            
            \App\Models\ProjectRequirementHistory::create([
                'project_requirement_id' => $requirement->id,
                'user_id' => $user->id,
                'type' => 'restock',
                'quantity' => 0,
                'notes' => "Moved from '{$oldFolderName}' to '{$newFolderName}'",
            ]);
        }

        // Log tab move (bom_type)
        if (array_key_exists('bom_type', $validated) && $validated['bom_type'] != $oldBomType) {
            $oldTypeName = $oldBomType === 'raw' ? 'Bahan Baku' : 'Bahan Finishing';
            $newTypeName = $validated['bom_type'] === 'raw' ? 'Bahan Baku' : 'Bahan Finishing';
            
            \App\Models\ProjectRequirementHistory::create([
                'project_requirement_id' => $requirement->id,
                'user_id' => $user->id,
                'type' => 'restock',
                'quantity' => 0,
                'notes' => "Moved from '{$oldTypeName}' to '{$newTypeName}'",
            ]);
        }

        return response()->json(['data' => $requirement->load('user')]);
    }

    public function destroy(Project $project, ProjectRequirement $requirement)
    {
        // Binding check: the requirement must belong to THIS project.
        if ((int) $requirement->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if (!$this->isAuthorizedPro($project, Auth::user())) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $name = $requirement->name;
        
        DB::transaction(function () use ($requirement, $project, $name) {
            // Manually delete related records that might cause foreign key constraint failures
            $requirement->histories()->delete();
            $requirement->procurementRequests()->delete();
            
            $requirement->delete();
            $this->logActivity($project, 'requirement_deleted', "Removed material: {$name}");
        });

        return response()->json(['message' => 'Deleted']);
    }



    public function logUsage(Request $request, Project $project, ProjectRequirement $requirement)
    {
        $user = Auth::user();

        // Binding + authorization: only project participants may consume stock.
        if ((int) $requirement->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }
        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate(['quantity' => 'required|numeric|min:0.01']);

        return DB::transaction(function () use ($requirement, $validated, $project) {
            // Lock the record for update to prevent concurrent deductions
            $requirement = ProjectRequirement::where('id', $requirement->id)->lockForUpdate()->first();

            if ($requirement->quantity_on_site < $validated['quantity']) {
                return response()->json(['message' => 'Insufficient stock on site.'], 422);
            }

            $requirement->increment('quantity_used', $validated['quantity']);
            $requirement->decrement('quantity_on_site', $validated['quantity']);

            // Record transaction history
            \App\Models\ProjectRequirementHistory::create([
                'project_requirement_id' => $requirement->id,
                'user_id' => Auth::id(),
                'type' => 'use',
                'quantity' => $validated['quantity'],
                'notes' => 'Usage logged.',
            ]);

            $this->logActivity($project, 'material_used', "Used {$validated['quantity']} {$requirement->unit} of {$requirement->name}");

            return response()->json(['data' => $requirement]);
        });
    }

    public function getHistory(Project $project)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $requirementIds = $project->requirements()->pluck('id');
        $history = \App\Models\ProjectRequirementHistory::with(['user', 'requirement'])
            ->whereIn('project_requirement_id', $requirementIds)
            ->orderBy('created_at', 'desc')
            ->get();
        return response()->json(['data' => $history]);
    }

    public function getProcurementRequests(Project $project)
    {
        $user = Auth::user();
        if (!$this->isAuthorizedPro($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json(['data' => $project->procurementRequests()->with(['requirement', 'requester'])->get()]);
    }

    public function requestProcurement(Request $request, Project $project, ProjectRequirement $requirement)
    {
        $user = Auth::user();

        // Binding check: the requirement must belong to THIS project.
        if ((int) $requirement->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // Enforce Zero Frontend Trust Auth
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id;
        $isSubContractor = \App\Models\ProjectSubProfessional::where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('parent_role', 'kontraktor')
            ->where('status', 'hired')
            ->exists();
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;
        $isOwner = $project->user_id === $user->id;

        if (!$isHiredKontraktor && !$isSubContractor && !$isPM && !$isOwner) {
            return response()->json(['message' => 'Unauthorized. Only contractors, hired helper sub-professionals, or managers can request procurement.'], 403);
        }

        $validated = $request->validate([
            'quantity_needed' => 'required|numeric|min:0.01',
            'estimated_unit_cost' => 'nullable|numeric|min:0',
            'message' => 'nullable|string|max:500',
            'offer_to_buy' => 'nullable|boolean',
        ]);

        DB::beginTransaction();
        try {
            $hasPM = !empty($project->pm_id);
            $estimatedUnitCost = $validated['estimated_unit_cost'] ?? $requirement->estimated_unit_cost ?? 0;
            $estimatedTotalCost = $validated['quantity_needed'] * $estimatedUnitCost;

            $status = $hasPM ? 'pending_pm' : 'pending_owner';

            $procReq = $project->procurementRequests()->create([
                'requirement_id' => $requirement->id,
                'requested_by' => $user->id,
                'quantity_needed' => $validated['quantity_needed'],
                'estimated_unit_cost' => $estimatedUnitCost,
                'estimated_cost' => $hasPM ? null : $estimatedTotalCost,
                'message' => $validated['message'] ?? '',
                'offer_to_buy' => $validated['offer_to_buy'] ?? false,
                'status' => $status,
            ]);

            $this->logActivity($project, 'procurement_requested', "Requested procurement for {$requirement->name} ({$validated['quantity_needed']} {$requirement->unit})");

            if ($hasPM) {
                // Notify PM
                \App\Models\Notification::create([
                    'user_id' => $project->pm_id,
                    'type' => 'verification_required',
                    'title' => 'Material Procurement Requested',
                    'body' => "A new request for {$requirement->name} ({$validated['quantity_needed']} {$requirement->unit}) is pending your review.",
                    'data' => [
                        'project_id' => $project->id,
                        'request_id' => $procReq->id
                    ],
                ]);
            } else {
                // No PM: auto-create the budget addendum for Owner
                $addendum = \App\Models\ProjectAddendum::create([
                    'project_id' => $project->id,
                    'role_type' => 'pm_material',
                    'user_id' => $user->id,
                    'title' => "Material Procurement: {$requirement->name}",
                    'description' => "Direct request for {$validated['quantity_needed']} {$requirement->unit} of {$requirement->name} (No PM assigned). Cost: Rp " . number_format($estimatedTotalCost, 0, ',', '.') . ". Reason: " . ($validated['message'] ?? 'N/A'),
                    'amount' => $estimatedTotalCost,
                    'status' => 'pending_approval',
                    'procurement_request_id' => $procReq->id,
                ]);

                // Notify Owner
                \App\Models\Notification::create([
                    'user_id' => $project->user_id,
                    'type' => 'budget_approval_needed',
                    'title' => 'Budget Authorization Needed',
                    'body' => "Direct procurement request for {$requirement->name}. Authorize Rp " . number_format($estimatedTotalCost, 0, ',', '.') . " to proceed.",
                    'data' => [
                        'project_id' => $project->id,
                        'addendum_id' => $addendum->id,
                        'request_id' => $procReq->id
                    ],
                ]);
            }

            DB::commit();
            return response()->json(['data' => $procReq]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Request failed: ' . $e->getMessage()], 500);
        }
    }





    private function isAuthorizedPro(Project $project, $user, array $allowedRoles = [])
    {
        if (empty($allowedRoles)) {
            $allowedRoles = ['arsitek', 'kontraktor', 'mep', 'structural', 'project_manager', 'user', 'interior'];
        }
        
        $isOwner = $project->user_id === $user->id && in_array('user', $allowedRoles);
        $isHiredArsitek = $user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id && in_array('arsitek', $allowedRoles);
        $isHiredKontraktor = $user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id && in_array('kontraktor', $allowedRoles);
        $isHiredPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id && in_array('project_manager', $allowedRoles);
        // SECURITY: interior designers must be HIRED on this project — an
        // unscoped role check previously let ANY interior user edit BOM data.
        $isInterior = $user->role_type === 'interior' && (int) $project->selected_interior_id === (int) $user->interior_profile?->id && in_array('interior', $allowedRoles);
        $isHiredStructural = $user->role_type === 'structural' && 
            ($project->structural_id === optional($user->structural_engineer)->id || 
             $project->subProfessionals()->where('user_id', $user->id)->where('sub_role', 'structural')->where('status', 'active')->exists()) && 
            in_array('structural', $allowedRoles);

        $isHiredMEP = $user->role_type === 'mep' && 
            ($project->mep_id === optional($user->mep_engineer)->id || 
             $project->subProfessionals()->where('user_id', $user->id)->where('sub_role', 'mep')->where('status', 'active')->exists()) && 
            in_array('mep', $allowedRoles);

        return $isOwner || $isHiredArsitek || $isHiredKontraktor || $isHiredPM || $isInterior || $isHiredStructural || $isHiredMEP;
    }

    private function logActivity(Project $project, string $action, string $details): void
    {
        \App\Models\ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }

    private function notifyReviewers(Project $project, string $title, string $body): void
    {
        $reviewers = array_filter([$project->user_id, $project->pm_id]);
        foreach ($reviewers as $userId) {
            \App\Models\Notification::create([
                'user_id' => $userId,
                'type' => 'verification_required',
                'title' => $title,
                'body' => $body,
                'data' => ['project_id' => $project->id],
            ]);
        }
    }
}
