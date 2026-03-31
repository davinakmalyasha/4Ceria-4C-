<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\Request;
use App\Http\Resources\ProjectResource;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use Illuminate\Support\Facades\Auth;

class ProjectController extends Controller
{
    public function index()
    {
        $projects = Project::where('status', '!=', 'completed')->paginate(10);
        return ProjectResource::collection($projects);
    }

    public function store(StoreProjectRequest $request)
    {
        $data = $request->validated();
        $data['user_id'] = Auth::id();
        $data['status'] = 'open';

        if ($request->hasFile('attachment')) {
            $data['attachment'] = $request->file('attachment')->store('project_attachments', 'public');
        }

        $project = Project::create($data);

        // Save multiple images
        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $i => $image) {
                $path = $image->store('project_images', 'public');
                $project->images()->create([
                    'image_path' => $path,
                    'sort_order' => $i,
                ]);
            }
        }

        $project->load('images');
        return new ProjectResource($project);
    }

    public function show(Project $project)
    {
        $project->load([
            'bidsArsitek.arsitek.user',
            'bidsKontraktor.kontraktor.user',
            'images',
            'user'
        ]);
        return new ProjectResource($project);
    }

    public function submitBid(Request $request, Project $project)
    {
        $user = Auth::user();

        if (!in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            return response()->json(['message' => 'Only architects and contractors can submit bids.'], 403);
        }

        if ($project->status !== 'open') {
            return response()->json(['message' => 'This project is no longer accepting bids.'], 422);
        }

        $request->validate([
            'price' => 'required|numeric|min:0',
            'proposal' => 'required|string|max:2000',
        ]);

        if ($user->role_type === 'arsitek') {
            $profile = \App\Models\Arsitek::where('user_id', $user->id)->firstOrFail();

            // Prevent duplicate bids
            $existing = \App\Models\BidArsitek::where('project_id', $project->id)
                ->where('arsitek_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidArsitek::create([
                'project_id' => $project->id,
                'arsitek_id' => $profile->id,
                'price' => $request->price,
                'proposal' => $request->proposal,
                'status' => 'pending',
            ]);
        } else {
            $profile = \App\Models\Kontraktor::where('user_id', $user->id)->firstOrFail();

            $existing = \App\Models\BidKontraktor::where('project_id', $project->id)
                ->where('kontraktor_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidKontraktor::create([
                'project_id' => $project->id,
                'kontraktor_id' => $profile->id,
                'price' => $request->price,
                'proposal' => $request->proposal,
                'status' => 'pending',
            ]);
        }

        $project->load(['bidsArsitek.arsitek.user', 'bidsKontraktor.kontraktor.user', 'images', 'user']);
        return new ProjectResource($project);
    }

    public function acceptBid(Request $request, Project $project)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized. Must be project owner.'], 403);
        }

        $request->validate([
            'bid_id' => 'required|integer',
            'bid_type' => 'required|in:arsitek,kontraktor',
        ]);

        if ($request->bid_type === 'arsitek') {
            $bid = \App\Models\BidArsitek::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'accepted']);
            // Decline all other arsitek bids
            \App\Models\BidArsitek::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);
            $project->update(['selected_arsitek_id' => $bid->arsitek_id]);
        } else {
            $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'accepted']);
            \App\Models\BidKontraktor::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);
            $project->update(['selected_kontraktor_id' => $bid->kontraktor_id]);
        }

        $project->load(['bidsArsitek.arsitek.user', 'bidsKontraktor.kontraktor.user', 'user']);
        return new ProjectResource($project);
    }

    public function declineBid(Request $request, Project $project)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized. Must be project owner.'], 403);
        }

        $request->validate([
            'bid_id' => 'required|integer',
            'bid_type' => 'required|in:arsitek,kontraktor',
        ]);

        if ($request->bid_type === 'arsitek') {
            $bid = \App\Models\BidArsitek::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        } else {
            $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        }

        $project->load(['bidsArsitek.arsitek.user', 'bidsKontraktor.kontraktor.user', 'user']);
        return new ProjectResource($project);
    }

    public function update(UpdateProjectRequest $request, Project $project)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized. Must be project owner.'], 403);
        }

        $data = $request->validated();
        if ($request->hasFile('attachment')) {
            $data['attachment'] = $request->file('attachment')->store('project_attachments', 'public');
        }

        $project->update($data);

        return new ProjectResource($project);
    }

    public function destroy(Project $project)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $project->delete();
        return response()->json(['message' => 'Project deleted successfully']);
    }
}
