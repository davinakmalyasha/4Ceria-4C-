<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Project;
use App\Models\BidProjectManager;
use App\Models\Notification;
use App\Models\ProjectBudgetTransaction;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class BidProjectManagerController extends Controller
{
    public function store(Request $request, Project $project, \App\Services\BidCalculationService $calculationService)
    {
        $user = Auth::user();
        if ($user->role_type !== 'project_manager') {
            return response()->json(['message' => 'Only Project Managers can submit this bid.'], 403);
        }

        if (!$project->wants_project_manager) {
            return response()->json(['message' => 'This project does not require a Project Manager.'], 400);
        }

        if ($project->pm_id) {
            return response()->json(['message' => 'This project already has an assigned Project Manager.'], 400);
        }

        $existingBid = BidProjectManager::where('project_id', $project->id)
            ->where('pm_id', $user->project_manager->id)
            ->first();

        if ($existingBid) {
            return response()->json(['message' => 'You have already submitted a bid for this project.'], 400);
        }

        $request->validate([
            'price' => 'nullable|numeric|min:0',
            'proposal' => 'required|string',
            'estimated_duration' => 'nullable|integer',
            'duration_unit' => 'nullable|string',
            'fee_type' => 'nullable|string|in:fixed,percentage,unit',
            'unit_price' => 'nullable|numeric|min:0',
            'quantity' => 'nullable|numeric|min:0',
            'scopes' => 'nullable', // JSON string from frontend
            'deliverables' => 'nullable', // JSON string from frontend
        ]);

        $calc = $calculationService->calculate($request->all(), $project);

        $bid = BidProjectManager::create([
            'project_id' => $project->id,
            'pm_id' => $user->project_manager->id,
            'price' => $calc['price'],
            'fee_type' => $calc['fee_type'],
            'unit_price' => $calc['unit_price'],
            'quantity' => $calc['quantity'],
            'calculated_total' => $calc['calculated_total'],
            'proposal' => $request->proposal,
            'estimated_duration' => $request->estimated_duration ?: 1,
            'duration_unit' => $request->duration_unit ?: 'weeks',
            'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
            'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            'status' => 'pending',
        ]);

        Notification::create([
            'user_id' => $project->user_id,
            'type' => 'pm_bid_received',
            'title' => 'Project Manager Bid Received!',
            'body' => "{$user->name} has submitted a proposal to manage your project: \"{$project->title}\".",
            'data' => ['project_id' => $project->id, 'bid_id' => $bid->id],
        ]);

        return response()->json(['message' => 'Bid submitted successfully!', 'bid' => $bid]);
    }

    public function shortlist(Request $request, Project $project, BidProjectManager $bid)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized. Only project owner can shortlist.'], 403);
        }

        if ($bid->status !== 'pending') {
            return response()->json(['message' => 'Bid must be pending to be shortlisted.'], 400);
        }

        DB::beginTransaction();
        try {
            $bid->update(['status' => 'shortlisted']);

            Notification::create([
                'user_id' => $bid->pm->user_id,
                'type' => 'pm_bid_shortlisted',
                'title' => 'Proposal Shortlisted!',
                'body' => "You have been shortlisted for project \"{$project->title}\". The owner wants to discuss your proposal.",
                'data' => ['project_id' => $project->id],
            ]);

            DB::commit();

            $project->load([
                'arsitek.user.phoneNumber',
                'kontraktor.user.phoneNumber',
                'notaris.user.phoneNumber',
                'interior.user.phoneNumber',
                'bidsArsitek.arsitek.user.phoneNumber',
                'bidsKontraktor.kontraktor.user.phoneNumber',
                'bidsNotaris.notaris.user.phoneNumber',
                'bidsInterior.interior.user.phoneNumber',
                'bidsProjectManager.pm.user',
                'images',
                'milestones',
                'user',
                'ratings',
                'kontraktorRating',
                'projectManager.user',
                'paymentTermins'
            ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager']);

            return new \App\Http\Resources\ProjectResource($project);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to shortlist PM.', 'error' => $e->getMessage()], 500);
        }
    }

    public function accept(Request $request, Project $project, BidProjectManager $bid)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if ($project->pm_id) {
            return response()->json(['message' => 'Project already has a Project Manager.'], 400);
        }

        if ($bid->status !== 'shortlisted' && $bid->status !== 'negotiating') {
            return response()->json(['message' => 'You must shortlist or negotiate with this professional first before hiring.'], 422);
        }

        DB::beginTransaction();
        try {
            // Standardize: pm_id in projects table references users.id
            $pmUserId = $bid->pm->user_id;
            $project->update(['pm_id' => $pmUserId]);
            
            $bid->update([
                'status' => 'contract_pending',
                'verification_notes' => $request->verification_notes,
            ]);
            
            // Notification for Aisha (Professional)
            Notification::create([
                'user_id' => $pmUserId,
                'type' => 'pm_hire_initiated',
                'title' => 'Hire Initiated!',
                'body' => "Congratulations! The owner has initiated your hire for: \"{$project->title}\". Please review the SPK and define your payment milestones.",
                'data' => ['project_id' => $project->id, 'bid_id' => $bid->id],
            ]);

            $project->refresh(); 

            // Decline all other PM bids
            BidProjectManager::where('project_id', $project->id)
                ->where('id', '!=', $bid->id)
                ->update(['status' => 'declined']);

            // Send Notification
            Notification::create([
                'user_id' => $pmUserId,
                'type' => 'pm_bid_accepted',
                'title' => 'Proposal Accepted!',
                'body' => "Congratulations! You have been hired as the Project Manager for: \"{$project->title}\".",
                'data' => ['project_id' => $project->id],
            ]);

            DB::commit();

            $project->load([
                'arsitek.user.phoneNumber',
                'kontraktor.user.phoneNumber',
                'notaris.user.phoneNumber',
                'interior.user.phoneNumber',
                'bidsArsitek.arsitek.user.phoneNumber',
                'bidsKontraktor.kontraktor.user.phoneNumber',
                'bidsNotaris.notaris.user.phoneNumber',
                'bidsInterior.interior.user.phoneNumber',
                'bidsProjectManager.pm.user',
                'images',
                'milestones',
                'user',
                'ratings',
                'kontraktorRating',
                'projectManager.user',
                'paymentTermins'
            ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager']);
            return new \App\Http\Resources\ProjectResource($project);
        } catch (\Exception $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error("PM Hire Failed: " . $e->getMessage(), [
                'project_id' => $project->id,
                'bid_id' => $bid->id,
                'error' => $e->getMessage()
            ]);
            return response()->json([
                'message' => 'Failed to hire PM.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function decline(Request $request, Project $project, BidProjectManager $bid)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $bid->update(['status' => 'declined']);
            $project->load([
                'arsitek.user.phoneNumber',
                'kontraktor.user.phoneNumber',
                'notaris.user.phoneNumber',
                'interior.user.phoneNumber',
                'bidsArsitek.arsitek.user.phoneNumber',
                'bidsKontraktor.kontraktor.user.phoneNumber',
                'bidsNotaris.notaris.user.phoneNumber',
                'bidsInterior.interior.user.phoneNumber',
                'bidsProjectManager.pm.user',
                'images',
                'milestones',
                'user',
                'ratings',
                'kontraktorRating',
                'projectManager.user'
            ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager']);
        return new \App\Http\Resources\ProjectResource($project);
    }
}
