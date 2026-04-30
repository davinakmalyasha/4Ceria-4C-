<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\Notification;
use App\Models\BidStructural;
use App\Models\BidMep;
use Illuminate\Support\Facades\DB;

class ProjectEngineeringService
{
    protected $financialService;

    public function __construct(ProjectFinancialService $financialService)
    {
        $this->financialService = $financialService;
    }

    /**
     * Finalize the hiring process for an engineer, including budget deduction and bid management.
     */
    public function finalizeHiring(Project $project, ProjectAddendum $addendum): bool
    {
        return DB::transaction(function () use ($project, $addendum) {
            $totalDeduction = $addendum->amount;

            // Step 1: Deduct Budget (Leverages existence check in FinancialService)
            $success = $this->financialService->deductBudget(
                $project,
                $totalDeduction,
                'adjustment_down',
                ucwords($addendum->recommended_bid_type) . " Engineering Hire Authorization",
                "ProjectAddendum",
                $addendum->id
            );

            if (!$success) {
                return false;
            }

            // Step 2: Update Bids and Project Roles
            $bidType = $addendum->recommended_bid_type;
            $bidId = $addendum->recommended_bid_id;

            if ($bidType === 'structural') {
                $bid = BidStructural::with('structuralEngineer')->findOrFail($bidId);
                $bid->update(['status' => 'accepted']);
                BidStructural::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);
                $project->update(['structural_id' => $bid->structural_id]);
                $bidderUserId = $bid->structuralEngineer->user_id;
            } elseif ($bidType === 'mep') {
                $bid = BidMep::with('mepEngineer')->findOrFail($bidId);
                $bid->update(['status' => 'accepted']);
                BidMep::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);
                $project->update(['mep_id' => $bid->mep_id]);
                $bidderUserId = $bid->mepEngineer->user_id;
            } else {
                throw new \Exception('Invalid bid type in addendum.');
            }

            // Step 3: Update Addendum Status
            $addendum->update(['status' => 'approved_unpaid']);

            // Step 4: Send Notification
            Notification::create([
                'user_id' => $bidderUserId,
                'type' => 'bid_accepted',
                'title' => 'Engineering Bid Accepted!',
                'body' => "Your bid for project \"{$project->title}\" has been authorized by the owner.",
                'data' => ['project_id' => $project->id],
            ]);

            return true;
        });
    }
}
