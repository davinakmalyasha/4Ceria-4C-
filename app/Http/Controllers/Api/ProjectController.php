<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use App\Http\Resources\ProjectResource;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use Illuminate\Support\Facades\Auth;
use App\Models\Notification;

class ProjectController extends Controller
{
    public function index(\Illuminate\Http\Request $request)
    {
        $user = Auth::guard('sanctum')->user();
        
        $query = Project::with(['images', 'milestones', 'user'])
            ->withCount(['bidsArsitek', 'bidsKontraktor']);

        if ($request->query('with_bids') === 'true') {
            $query->with(['bidsArsitek.arsitek.user', 'bidsKontraktor.kontraktor.user']);
        }

        if (!$user) {
            // Public failsafe: only show open projects tagged for 'both' (or just don't show any)
            $query->where('status', 'open');
            return ProjectResource::collection($query->paginate(50));
        }

        // Support platform-wide project feed if requested
        if ($request->query('feed') === 'true') {
            $query->where('status', 'open')
                  ->where('user_id', '!=', $user->id); // Exclude own projects from feed
            return ProjectResource::collection($query->latest()->get());
        }

        if ($user->role_type === 'user') {
            // Client only sees their own projects by default
            $query->where('user_id', $user->id);
            // Default sort for user
            $query->latest();
        } elseif ($user->role_type === 'arsitek') {
            $arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
            $query->where(function ($q) use ($arsitek) {
                // Return 'open' or 'accepted_kontraktor' where target_role includes arsitek
                $q->where(function($subQ) {
                    $subQ->whereIn('status', ['open', 'accepted_kontraktor', 'accepted_arsitek', 'in_progress', 'completed'])
                         ->whereIn('target_role', ['both', 'arsitek']);
                });
                
                // OR if the arsitek is explicitly hired to the project already
                if ($arsitek) {
                    $q->orWhere('selected_arsitek_id', $arsitek->id);
                }
            });
            $query->latest();
        } elseif ($user->role_type === 'kontraktor') {
            $kontraktor = \App\Models\Kontraktor::where('user_id', $user->id)->first();
            $query->where(function ($q) use ($kontraktor) {
                $q->where(function($subQ) {
                    $subQ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress', 'completed'])
                         ->whereIn('target_role', ['both', 'kontraktor']);
                });
                
                if ($kontraktor) {
                    $q->orWhere('selected_kontraktor_id', $kontraktor->id);
                }
            });
            $query->latest();
        } else {
            // Failsafe backend restriction
            $query->where('id', '<', 0);
        }

        if ($request->query('all') === 'true') {
             return ProjectResource::collection($query->latest()->get());
        }
        
        return ProjectResource::collection($query->latest()->paginate(50));
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

        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => 'project_created',
            'details' => "Project \"{$project->title}\" was posted",
        ]);

        return new ProjectResource($project);
    }

    public function show(Project $project)
    {
        $project->load([
            'bidsArsitek.arsitek.user',
            'bidsKontraktor.kontraktor.user',
            'images',
            'milestones',
            'user',
            'ratings',
            'kontraktorRating'
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
            'estimated_duration' => 'nullable|integer|min:1',
            'duration_unit' => 'nullable|string|in:days,weeks,months',
            'attachment_1' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:5120',
            'attachment_2' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:5120',
            'attachment_3' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:5120',
        ]);

        $attachments = [];
        for ($i = 1; $i <= 3; $i++) {
            $key = "attachment_$i";
            if ($request->hasFile($key)) {
                $path = $request->file($key)->store('bid_attachments', 'public');
                $attachments[$key] = $path;
            } else {
                $attachments[$key] = null;
            }
        }

        if ($user->role_type === 'arsitek') {
            $profile = \App\Models\Arsitek::where('user_id', $user->id)->firstOrFail();

            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification. You can only bid once verified.'], 403);
            }

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
                'estimated_duration' => $request->estimated_duration,
                'duration_unit' => $request->duration_unit,
                'attachment_1' => $attachments['attachment_1'],
                'attachment_2' => $attachments['attachment_2'],
                'attachment_3' => $attachments['attachment_3'],
                'status' => 'pending',
            ]);
        } else {
            $profile = \App\Models\Kontraktor::where('user_id', $user->id)->firstOrFail();

            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification. You can only bid once verified.'], 403);
            }

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
                'estimated_duration' => $request->estimated_duration,
                'duration_unit' => $request->duration_unit,
                'attachment_1' => $attachments['attachment_1'],
                'attachment_2' => $attachments['attachment_2'],
                'attachment_3' => $attachments['attachment_3'],
                'status' => 'pending',
            ]);
        }

        // Notify Project Owner
        Notification::create([
            'user_id' => $project->user_id,
            'type' => 'bid_received',
            'title' => 'New Bid Received!',
            'body' => "A professional has submitted a bid for your project: \"{$project->title}\".",
            'data' => ['project_id' => $project->id, 'bidder_name' => $user->name]
        ]);

        $project->load(['bidsArsitek.arsitek.user', 'bidsKontraktor.kontraktor.user', 'images', 'user', 'ratings', 'kontraktorRating']);
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
            
            $project->load('milestones'); // Ensure milestones are loaded for the status change logic if needed or just for the resource
            
            // Advance Status
            if ($project->target_role === 'arsitek' || $project->status === 'accepted_kontraktor') {
                $project->update(['selected_arsitek_id' => $bid->arsitek_id, 'status' => 'in_progress']);
            } else {
                $project->update(['selected_arsitek_id' => $bid->arsitek_id, 'status' => 'accepted_arsitek']);
            }
        } else {
            $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'accepted']);
            \App\Models\BidKontraktor::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);
            
            // Advance Status
            if ($project->target_role === 'kontraktor' || $project->status === 'accepted_arsitek') {
                $project->update(['selected_kontraktor_id' => $bid->kontraktor_id, 'status' => 'in_progress']);
            } else {
                $project->update(['selected_kontraktor_id' => $bid->kontraktor_id, 'status' => 'accepted_kontraktor']);
            }
        }

        // Notify the Winning Professional
        $bidderUserId = ($request->bid_type === 'arsitek') ? $bid->arsitek->user_id : $bid->kontraktor->user_id;
        Notification::create([
            'user_id' => $bidderUserId,
            'type' => 'bid_accepted',
            'title' => 'Congratulations! Your Bid was Accepted',
            'body' => "Your proposal for project \"{$project->title}\" has been accepted. You can now start communicating with the client.",
            'data' => ['project_id' => $project->id]
        ]);

        // Auto-generate kickoff milestone if shifted fully active
        if ($project->status === 'in_progress') {
            \App\Models\ProjectMilestone::firstOrCreate(
                ['project_id' => $project->id, 'title' => 'Project Kickoff'],
                ['description' => 'Contract executed. The project is ready to begin.', 'status' => 'pending']
            );
        }

        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => 'bid_accepted',
            'details' => "Accepted {$request->bid_type} bid",
        ]);

        $project->load(['bidsArsitek.arsitek.user', 'bidsKontraktor.kontraktor.user', 'user', 'images', 'ratings', 'kontraktorRating']);
        $project->loadCount(['bidsArsitek', 'bidsKontraktor']);
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

        // Notify the rejected professional
        $bidderUserId = ($request->bid_type === 'arsitek') ? $bid->arsitek->user_id : $bid->kontraktor->user_id;
        Notification::create([
            'user_id' => $bidderUserId,
            'type' => 'bid_rejected',
            'title' => 'Proposal Update',
            'body' => "Your proposal for project \"{$project->title}\" was not selected this time.",
            'data' => ['project_id' => $project->id]
        ]);

        $project->load(['bidsArsitek.arsitek.user', 'bidsKontraktor.kontraktor.user', 'user', 'images', 'ratings', 'kontraktorRating']);
        $project->loadCount(['bidsArsitek', 'bidsKontraktor']);
        return new ProjectResource($project);
    }

    public function update(UpdateProjectRequest $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        
        // Find if user is the selected professional
        $isWorker = false;
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id) {
            $arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
            if ($arsitek && $arsitek->id === $project->selected_arsitek_id) {
                $isWorker = true;
            }
        } elseif ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id) {
            $kontraktor = \App\Models\Kontraktor::where('user_id', $user->id)->first();
            if ($kontraktor && $kontraktor->id === $project->selected_kontraktor_id) {
                $isWorker = true;
            }
        }

        if (!$isOwner && !$isWorker) {
            return response()->json(['message' => 'Unauthorized. Must be project owner or the hired professional.'], 403);
        }

        $data = $request->validated();
        if ($request->hasFile('attachment')) {
            $data['attachment'] = $request->file('attachment')->store('project_attachments', 'public');
        }

        $project->update($data);

        if (isset($data['status'])) {
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'status_changed',
                'details' => "Status changed to {$data['status']}",
            ]);
        }

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

    public function myBids()
    {
        $user = Auth::user();
        if ($user->role_type === 'arsitek') {
            $arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
            if (!$arsitek) return response()->json(['data' => []]);
            $bids = \App\Models\BidArsitek::with(['project'])->where('arsitek_id', $arsitek->id)->orderBy('created_at', 'desc')->get();
            return response()->json(['data' => $bids]);
        } elseif ($user->role_type === 'kontraktor') {
            $kontraktor = \App\Models\Kontraktor::where('user_id', $user->id)->first();
            if (!$kontraktor) return response()->json(['data' => []]);
            $bids = \App\Models\BidKontraktor::with(['project'])->where('kontraktor_id', $kontraktor->id)->orderBy('created_at', 'desc')->get();
            return response()->json(['data' => $bids]);
        }

        return response()->json(['data' => []]);
    }
}
