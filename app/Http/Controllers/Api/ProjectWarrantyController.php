<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectWarrantyClaim;
use Illuminate\Http\Request;

class ProjectWarrantyController extends Controller
{
    public function index(Project $project)
    {
        return response()->json([
            'data' => $project->warrantyClaims()->with('reporter')->get()
        ]);
    }

    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'images' => 'nullable|array|max:5',
            'images.*' => 'image|max:5120',
        ]);

        $imagePaths = [];
        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $imagePaths[] = $image->store("projects/{$project->id}/warranty", 'public');
            }
        }

        $claim = $project->warrantyClaims()->create([
            'reporter_id' => $request->user()->id,
            'title' => $validated['title'],
            'description' => $validated['description'],
            'images' => $imagePaths,
            'status' => 'open',
        ]);

        return response()->json(['message' => 'Warranty claim filed', 'data' => $claim]);
    }

    public function updateStatus(Request $request, Project $project, ProjectWarrantyClaim $claim)
    {
        $validated = $request->validate([
            'status' => 'required|in:fixing,resolved,closed',
            'cost_impact' => 'nullable|numeric',
        ]);

        $updateData = ['status' => $validated['status']];
        
        if (isset($validated['cost_impact'])) {
            $updateData['cost_impact'] = $validated['cost_impact'];
        }

        if ($validated['status'] === 'resolved') {
            $updateData['resolved_at'] = now();
        }

        $claim->update($updateData);

        return response()->json(['message' => 'Claim status updated', 'data' => $claim]);
    }
}
