<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectAddendum;
use App\Models\BidNotaris;
use App\Models\ProjectActivityLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Traits\HandlesProjectAuthorization;

class ProjectAddendumController extends Controller
{
    use HandlesProjectAuthorization;

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

        return DB::transaction(function () use ($project, $milestone, $content, $items, $itemIndex, $item) {
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

    public function approveAddendum(Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        if (!$this->isProjectOwner($project, $user) && !($user->role_type === 'project_manager' && $project->pm_id === $user->id)) {
            return response()->json(['message' => 'Unauthorized. Only the Owner or PM can approve addendums.'], 403);
        }

        if ($addendum->status !== 'pending_approval') {
            return response()->json(['message' => 'This addendum is not pending approval.'], 400);
        }

        return DB::transaction(function () use ($project, $addendum) {
            if ($addendum->amount > 0) {
                $financialService = app(\App\Services\ProjectFinancialService::class);
                $success = $financialService->deductBudget(
                    $project,
                    (float)$addendum->amount,
                    'payment',
                    "Approved Addendum: {$addendum->title}",
                    "ProjectAddendum",
                    $addendum->id
                );

                if (!$success) {
                    return response()->json(['message' => 'Insufficient project budget to approve this addendum.'], 400);
                }

                $addendum->update([
                    'status' => 'paid',
                    'paid_at' => now()
                ]);
            } else {
                $addendum->update(['status' => 'approved']);
            }

            // Special handling for procurement addendums
            if ($addendum->procurement_request_id) {
                $addendum->procurementRequest()->update(['status' => 'approved']);
            }

            // Notification
            Notification::create([
                'user_id' => $addendum->user_id,
                'type' => 'addendum_approved',
                'title' => 'Addendum Approved',
                'body' => "Your addendum \"{$addendum->title}\" has been approved.",
                'data' => ['project_id' => $project->id, 'addendum_id' => $addendum->id],
            ]);

            $this->logActivity($project, 'addendum_approved', "Approved addendum: {$addendum->title}");

            return response()->json(['data' => $addendum]);
        });
    }

    public function rejectAddendum(Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();
        if (!$this->isProjectOwner($project, $user) && !($user->role_type === 'project_manager' && $project->pm_id === $user->id)) {
            return response()->json(['message' => 'Unauthorized. Only the Owner or PM can reject addendums.'], 403);
        }

        if ($addendum->status !== 'pending_approval') {
            return response()->json(['message' => 'This addendum is not pending approval.'], 400);
        }

        $addendum->update(['status' => 'rejected']);

        // Notification
        Notification::create([
            'user_id' => $addendum->user_id,
            'type' => 'addendum_rejected',
            'title' => 'Addendum Rejected',
            'body' => "Your addendum \"{$addendum->title}\" was rejected.",
            'data' => ['project_id' => $project->id, 'addendum_id' => $addendum->id],
        ]);

        $this->logActivity($project, 'addendum_rejected', "Rejected addendum: {$addendum->title}");

        return response()->json(['data' => $addendum]);
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
        if (!$this->isProjectOwner($project, $user) && !($user->role_type === 'project_manager' && $this->isHiredProfessional($project, $user))) {
            return response()->json(['message' => 'Unauthorized. Only the Owner or PM can verify disbursements.'], 403);
        }

        if ($addendum->status !== 'pending_approval') {
            return response()->json(['message' => 'Addendum is not pending verification.'], 422);
        }

        if ($request->status === 'paid') {
            return DB::transaction(function () use ($project, $addendum, $request) {
                $totalDeduction = $addendum->amount;

                $financialService = app(\App\Services\ProjectFinancialService::class);
                $success = $financialService->deductBudget(
                    $project,
                    $totalDeduction,
                    'payment',
                    "Legal Disbursement for {$addendum->title}",
                    "ProjectAddendum",
                    $addendum->id
                );

                if (!$success) {
                    return response()->json(['message' => 'Insufficient project budget to disburse this amount.'], 400);
                }

                $addendum->update([
                    'status' => 'paid',
                    'paid_at' => now()
                ]);

                $this->logActivity($project, 'legal_disbursement_verified', "{$request->status} disbursement order '{$addendum->title}'");

                return response()->json(['data' => $addendum]);
            });
        }
        
        $addendum->update(['status' => 'rejected']);
        $this->logActivity($project, 'legal_disbursement_verified', "{$request->status} disbursement order '{$addendum->title}'");

        return response()->json(['data' => $addendum]);
    }

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

    private function logActivity(Project $project, string $action, string $details): void
    {
        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }
}
