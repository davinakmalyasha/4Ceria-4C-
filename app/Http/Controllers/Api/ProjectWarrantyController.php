<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectWarrantyClaim;
use App\Traits\HandlesProjectAuthorization;
use Illuminate\Http\Request;

class ProjectWarrantyController extends Controller
{
    use HandlesProjectAuthorization;

    public function index(Project $project)
    {
        $user = request()->user();
        if (!$user || !$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json([
            'data' => $project->warrantyClaims()->with('reporter')->get()
        ]);
    }

    public function store(Request $request, Project $project)
    {
        $user = $request->user();
        if (!$this->authorizeProjectAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized. Only project participants can file warranty claims.'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'images' => 'nullable|array|max:5',
            'images.*' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        // Warranty window enforcement: claims are only valid AFTER handover
        // and WITHIN the warranty period (set at finalization; standard 180d).
        if (!$project->warranty_end_at) {
            return response()->json(['message' => 'The warranty period has not started yet. Claims can be filed after project handover.'], 422);
        }
        if (now()->gt($project->warranty_end_at)) {
            return response()->json(['message' => 'The warranty period ended on ' . $project->warranty_end_at->format('d M Y') . '.'], 422);
        }

        $imagePaths = [];
        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $imagePaths[] = $image->store("projects/{$project->id}/warranty", 'public');
            }
        }

        $claim = $project->warrantyClaims()->create([
            'reporter_id' => $user->id,
            'title' => $validated['title'],
            'description' => $validated['description'],
            'images' => $imagePaths,
            'status' => 'open',
        ]);

        // B10: the responsible contractor was never told a claim exists.
        if ($project->selected_kontraktor_id) {
            $contractor = \App\Models\Kontraktor::with('user')->find($project->selected_kontraktor_id);
            if ($contractor?->user && (int) $contractor->user->id !== (int) $user->id) {
                \App\Models\Notification::create([
                    'user_id' => $contractor->user->id,
                    'type' => 'warranty_claim',
                    'title' => 'New Warranty Claim',
                    'body' => "{$user->name} filed \"{$claim->title}\" on project \"{$project->title}\".",
                    'data' => ['project_id' => $project->id, 'claim_id' => $claim->id],
                ]);
            }
        }

        return response()->json(['message' => 'Warranty claim filed', 'data' => $claim]);
    }

    public function updateStatus(Request $request, Project $project, ProjectWarrantyClaim $claim)
    {
        // Binding check: the claim must belong to THIS project.
        if ((int) $claim->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $user = $request->user();

        // Only the hired contractor (the party responsible for fixes) or the
        // owner may move a claim through its lifecycle; cost_impact is
        // owner-approvable and must never be negative.
        $isContractor = $user->role_type === 'kontraktor'
            && (int) $project->selected_kontraktor_id === (int) optional($user->kontraktor)->id;
        $isOwner = $this->isProjectOwner($project, $user);

        if (!$isContractor && !$isOwner) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:fixing,resolved,closed',
            'cost_impact' => 'nullable|numeric|min:0',
        ]);

        $updateData = ['status' => $validated['status']];

        if (isset($validated['cost_impact'])) {
            if ($validated['cost_impact'] > 0 && !$isOwner) {
                return response()->json(['message' => 'Only the project owner can set a cost impact.'], 403);
            }
            $updateData['cost_impact'] = $validated['cost_impact'];
        }

        if ($validated['status'] === 'resolved') {
            $updateData['resolved_at'] = now();
        }

        $claim->update($updateData);

        return response()->json(['message' => 'Claim status updated', 'data' => $claim]);
    }
}
