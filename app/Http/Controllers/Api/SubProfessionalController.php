<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectSubProfessional;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SubProfessionalController extends Controller
{
    public function index(Project $project): \Illuminate\Http\JsonResponse
    {
        $subs = $project->subProfessionals()
            ->with(['user:id,name,role_type', 'assignedByUser:id,name'])
            ->where('status', '!=', 'removed')
            ->get();

        return response()->json(['data' => $subs]);
    }

    public function assign(Project $project, Request $request): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();

        if (!$this->canAssign($project, $user, $request->input('parent_role'))) {
            return response()->json(['message' => 'Unauthorized to assign sub-professionals.'], 403);
        }

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'parent_role' => 'required|in:arsitek,kontraktor',
            'sub_role' => 'required|string|max:50',
            'rate' => 'nullable|numeric|min:0',
            'scope_notes' => 'nullable|string|max:1000',
        ]);

        return DB::transaction(function () use ($project, $validated, $user) {
            $existing = ProjectSubProfessional::where('project_id', $project->id)
                ->where('user_id', $validated['user_id'])
                ->where('sub_role', $validated['sub_role'])
                ->first();

            if ($existing && $existing->status !== 'removed') {
                return response()->json(['message' => 'This professional is already assigned to this project.'], 422);
            }

            $profile = null;
            if ($user->role_type === 'arsitek') $profile = $user->arsitek;
            if ($user->role_type === 'kontraktor') $profile = $user->kontraktor;

            $isCompany = $profile && $profile->entity_type === 'company';
            $status = $isCompany ? 'accepted' : 'invited';

            $sub = ProjectSubProfessional::updateOrCreate(
                [
                    'project_id' => $project->id,
                    'user_id' => $validated['user_id'],
                    'sub_role' => $validated['sub_role'],
                ],
                [
                    'parent_role' => $validated['parent_role'],
                    'assigned_by' => $user->id,
                    'status' => $status,
                    'rate' => $validated['rate'] ?? 0,
                    'scope_notes' => $validated['scope_notes'] ?? null,
                    'accepted_at' => $isCompany ? now() : null,
                    'completed_at' => null,
                ]
            );

            // If direct assignment, auto-link to project core slots if matching role
            if ($isCompany) {
                if ($validated['sub_role'] === 'structural') {
                    $struc = \App\Models\StructuralEngineer::where('user_id', $validated['user_id'])->first();
                    if ($struc) $project->update(['structural_id' => $struc->id]);
                }
                if ($validated['sub_role'] === 'mep') {
                    $mep = \App\Models\MepEngineer::where('user_id', $validated['user_id'])->first();
                    if ($mep) $project->update(['mep_id' => $mep->id]);
                }
            }

            Notification::create([
                'user_id' => $validated['user_id'],
                'type' => 'sub_professional_invite',
                'title' => 'New Sub-Professional Invitation',
                'body' => "You have been invited as a {$validated['sub_role']} for \"{$project->title}\".",
                'data' => [
                    'project_id' => $project->id,
                    'sub_professional_id' => $sub->id,
                ],
            ]);

            return response()->json([
                'message' => 'Sub-professional invited successfully.',
                'data' => $sub->load('user:id,name,role_type'),
            ], 201);
        });
    }

    public function accept(Project $project, int $id): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();
        $sub = ProjectSubProfessional::where('id', $id)
            ->where('project_id', $project->id)
            ->firstOrFail();

        if ((int) $sub->user_id !== (int) $user->id) {
            return response()->json(['message' => 'Only the invited professional can accept.'], 403);
        }

        if ($sub->status !== 'invited') {
            return response()->json(['message' => 'This invitation is no longer pending.'], 422);
        }

        $sub->update(['status' => 'accepted', 'accepted_at' => now()]);

        // Auto-link to project core slots if matching role
        if ($sub->sub_role === 'structural') {
            $struc = \App\Models\StructuralEngineer::where('user_id', $sub->user_id)->first();
            if ($struc) $project->update(['structural_id' => $struc->id]);
        }
        if ($sub->sub_role === 'mep') {
            $mep = \App\Models\MepEngineer::where('user_id', $sub->user_id)->first();
            if ($mep) $project->update(['mep_id' => $mep->id]);
        }
        if ($sub->sub_role === 'interior') {
            $interior = \App\Models\InteriorProfile::where('user_id', $sub->user_id)->first();
            if ($interior) $project->update(['selected_interior_id' => $interior->id]);
        }

        return response()->json([
            'message' => 'Invitation accepted.',
            'data' => $sub,
        ]);
    }

    public function decline(Project $project, int $id): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();
        $sub = ProjectSubProfessional::where('id', $id)
            ->where('project_id', $project->id)
            ->firstOrFail();

        if ((int) $sub->user_id !== (int) $user->id) {
            return response()->json(['message' => 'Only the invited professional can decline.'], 403);
        }

        if (!in_array($sub->status, ['invited', 'accepted', 'interviewing', 'recommended'])) {
            return response()->json(['message' => 'Cannot decline this assignment.'], 422);
        }

        $sub->update([
            'status' => 'declined',
            'completed_at' => now(),
        ]);

        // Unlink from project core slots
        if ($sub->sub_role === 'structural') {
            $struc = \App\Models\StructuralEngineer::where('user_id', $sub->user_id)->first();
            if ($struc && (int)$project->structural_id === (int)$struc->id) {
                $project->update(['structural_id' => null]);
            }
        }
        if ($sub->sub_role === 'mep') {
            $mep = \App\Models\MepEngineer::where('user_id', $sub->user_id)->first();
            if ($mep && (int)$project->mep_id === (int)$mep->id) {
                $project->update(['mep_id' => null]);
            }
        }
        if ($sub->sub_role === 'interior') {
            $interior = \App\Models\InteriorProfile::where('user_id', $sub->user_id)->first();
            if ($interior && (int)$project->selected_interior_id === (int)$interior->id) {
                $project->update(['selected_interior_id' => null]);
            }
        }

        // Notify the architect/lead pro who assigned them
        if ($sub->assigned_by) {
            \App\Models\Notification::create([
                'user_id' => $sub->assigned_by,
                'type' => 'sub_professional_declined',
                'title' => 'Specialist Assignment Declined',
                'body' => "{$user->name} has declined the invitation to join \"{$project->title}\" as a {$sub->sub_role}.",
                'data' => [
                    'project_id' => $project->id,
                    'sub_professional_id' => $sub->id,
                ],
            ]);
        }

        return response()->json([
            'message' => 'Assignment declined.',
            'data' => $sub,
        ]);
    }

    public function interview(Project $project, int $id): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();
        $sub = ProjectSubProfessional::where('id', $id)->where('project_id', $project->id)->firstOrFail();

        if (!$this->canAssign($project, $user, $sub->parent_role)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $sub->update(['status' => 'interviewing']);

        return response()->json(['message' => 'Status updated to interviewing.', 'data' => $sub]);
    }

    public function recommend(Project $project, int $id, Request $request): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();
        $sub = ProjectSubProfessional::where('id', $id)->where('project_id', $project->id)->firstOrFail();

        if (!$this->canAssign($project, $user, $sub->parent_role)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'suggested_fee' => 'required|numeric|min:0',
            'lead_pro_notes' => 'required|string|max:2000',
        ]);

        $sub->update([
            'status' => 'recommended',
            'suggested_fee' => $validated['suggested_fee'],
            'lead_pro_notes' => $validated['lead_pro_notes'],
            'recommended_at' => now(),
        ]);

        // Synchronize Bid status for UI consistency
        $bidModel = $sub->sub_role === 'structural' ? \App\Models\BidStructural::class : \App\Models\BidMep::class;
        $relation = $sub->sub_role === 'structural' ? 'structuralEngineer' : 'mepEngineer';
        
        $bid = $bidModel::where('project_id', $project->id)
            ->whereHas($relation, function($q) use ($sub) {
                $q->where('user_id', $sub->user_id);
            })
            ->first();

        if ($bid) {
            $bid->update([
                'status' => 'recommended',
                'is_recommended' => true
            ]);
        }

        return response()->json(['message' => 'Specialist recommended to owner.', 'data' => $sub]);
    }

    public function hire(Project $project, int $id): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();
        $sub = ProjectSubProfessional::where('id', $id)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $isOwner = (int) $project->user_id === (int) $user->id;
        $isPM = $project->pm_id && (int) $project->pm_id === (int) $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Only the owner or project manager can hire sub-professionals.'], 403);
        }

        // If recommended by lead pro, only Owner can finalize the hire
        if ($sub->status === 'recommended' && !$isOwner) {
            return response()->json(['message' => 'Only the owner can hire recommended specialists.'], 403);
        }

        // Allow hiring if accepted (direct invite) or recommended (vetting flow)
        if ($sub->status !== 'accepted' && $sub->status !== 'recommended') {
            return response()->json(['message' => 'Professional must accept the invitation or be recommended first.'], 422);
        }

        $sub->update([
            'status' => 'active',
            'hired_at' => now(),
            'rate' => $sub->suggested_fee > 0 ? $sub->suggested_fee : $sub->rate
        ]);

        // Link to project main fields if applicable
        $this->linkToProject($project, $sub);

        return response()->json([
            'message' => 'Professional hired successfully.',
            'data' => $sub,
        ]);
    }

    private function linkToProject(Project $project, ProjectSubProfessional $sub): void
    {
        if ($sub->sub_role === 'structural') {
            $struc = \App\Models\StructuralEngineer::where('user_id', $sub->user_id)->first();
            if ($struc) $project->update(['structural_id' => $struc->id]);
        }
        if ($sub->sub_role === 'mep') {
            $mep = \App\Models\MepEngineer::where('user_id', $sub->user_id)->first();
            if ($mep) $project->update(['mep_id' => $mep->id]);
        }
    }

    public function shortlistBid(Project $project, string $role, int $bidId): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();
        if (!$this->canAssign($project, $user, $role === 'structural' || $role === 'mep' ? 'arsitek' : 'kontraktor')) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $bidModel = $role === 'structural' ? \App\Models\BidStructural::class : \App\Models\BidMep::class;
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();
        
        $userId = $role === 'structural' ? $bid->structuralEngineer->user_id : $bid->mepEngineer->user_id;

        $sub = ProjectSubProfessional::updateOrCreate(
            ['project_id' => $project->id, 'user_id' => $userId, 'sub_role' => $role],
            [
                'parent_role' => $role === 'structural' || $role === 'mep' ? 'arsitek' : 'kontraktor',
                'assigned_by' => $user->id,
                'status' => 'interviewing',
                'rate' => $bid->price,
                'scope_notes' => $bid->proposal,
            ]
        );

        $bid->update(['status' => 'shortlisted']);

        return response()->json(['message' => 'Bid shortlisted for interview.', 'data' => $sub]);
    }

    public function remove(Project $project, int $id): \Illuminate\Http\JsonResponse
    {
        $user = Auth::user();
        $sub = ProjectSubProfessional::where('id', $id)
            ->where('project_id', $project->id)
            ->firstOrFail();

        $isOwner = (int) $project->user_id === (int) $user->id;
        $isAssigner = (int) $sub->assigned_by === (int) $user->id;

        if (!$isOwner && !$isAssigner) {
            return response()->json(['message' => 'Unauthorized to remove this sub-professional.'], 403);
        }

        $sub->update(['status' => 'removed']);

        return response()->json(['message' => 'Sub-professional removed.']);
    }

    private function canAssign(Project $project, $user, ?string $parentRole): bool
    {
        $isOwner = (int) $project->user_id === (int) $user->id;
        if ($isOwner) {
            return true;
        }

        if ($parentRole === 'arsitek') {
            return $project->selected_arsitek_id
                && $user->role_type === 'arsitek'
                && optional($user->arsitek)->id === $project->selected_arsitek_id;
        }

        if ($parentRole === 'kontraktor') {
            return $project->selected_kontraktor_id
                && $user->role_type === 'kontraktor'
                && optional($user->kontraktor)->id === $project->selected_kontraktor_id;
        }

        return false;
    }
}
