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



    public function approveAddendum(Project $project, ProjectAddendum $addendum)
    {
        $user = Auth::user();

        // Binding check: the addendum must belong to THIS project.
        if ((int) $addendum->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if (!$this->isProjectOwner($project, $user) && !($user->role_type === 'project_manager' && $project->pm_id === $user->id)) {
            return response()->json(['message' => 'Unauthorized. Only the Owner or PM can approve addendums.'], 403);
        }

        if ($addendum->status !== 'pending_approval') {
            return response()->json(['message' => 'This addendum is not pending approval.'], 400);
        }

        return DB::transaction(function () use ($project, $addendum) {
            if ($addendum->amount > 0) {
                // Transition to approved_unpaid (Awaiting Payment) so the client must upload payment proof.
                // The actual budget transaction recording will happen in PaymentVerificationService upon successful verification.
                $addendum->update([
                    'status' => 'approved_unpaid',
                    'paid_at' => null
                ]);

                // Create the SubProfessional record immediately so the specialist gets the project on their dashboard and can verify the payment themselves!
                if (in_array($addendum->type, ['specialist_assignment', 'specialist_request']) && ($addendum->team_member_id || $addendum->assigned_user_id)) {
                    $subRole = $addendum->specialist_type ?: $addendum->role_type; // 'structural', 'mep' or 'interior'
                    $specialistUserId = null;
                    $specialistName = '';

                    if ($addendum->assigned_user_id) {
                        $sUser = \App\Models\User::find($addendum->assigned_user_id);
                        if ($sUser) {
                            $specialistUserId = $sUser->id;
                            $specialistName = $sUser->name;
                        }
                    } else {
                        $teamMember = \App\Models\TeamMember::find($addendum->team_member_id);
                        if ($teamMember) {
                            $specialistName = $teamMember->name;
                        }
                    }

                    if ($specialistName || $specialistUserId) {
                        \App\Models\ProjectSubProfessional::updateOrCreate(
                            [
                                'project_id' => $project->id,
                                'sub_role' => $subRole,
                            ],
                            [
                                'user_id' => $specialistUserId,
                                'parent_role' => ($addendum->user?->role_type === 'kontraktor') ? 'kontraktor' : 'arsitek',
                                'assigned_by' => $addendum->user_id,
                                'status' => 'invited',
                                'rate' => $addendum->amount,
                                'lead_pro_notes' => "Assigned via Paid Addendum: {$specialistName}",
                                'hired_at' => null,
                            ]
                        );

                        if ($specialistUserId) {
                            \App\Models\Notification::create([
                                'user_id' => $specialistUserId,
                                'type' => 'sub_professional_invite',
                                'title' => 'New Sub-Professional Invitation',
                                'body' => "You have been invited as a {$subRole} for \"{$project->title}\".",
                                'data' => [
                                    'project_id' => $project->id,
                                ],
                            ]);
                        }
                    }
                }
            } else {
                $addendum->update(['status' => 'approved']);
                // Approved addendums count toward budget math — touch the
                // project so the cached calculateBudgetSummary invalidates.
                $project->touch();
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

        // Binding check: the addendum must belong to THIS project.
        if ((int) $addendum->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

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
