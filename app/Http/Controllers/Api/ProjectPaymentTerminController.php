<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectActivityLog;
use App\Services\DisputeService;
use App\Services\TerminPlanService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Traits\HandlesProjectAuthorization;

class ProjectPaymentTerminController extends Controller
{
    use HandlesProjectAuthorization;

    public function getPaymentTermins(Project $project)
    {
        // SECURITY: financial records — owner or hired professionals only.
        if (! $this->authorizeProjectAccess($project)) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json(['data' => $project->paymentTermins()->with('milestone')->get()]);
    }

    public function storePaymentTermin(Request $request, Project $project, TerminPlanService $planService)
    {
        $user = Auth::user();

        // SECURITY (was: only `role_type !== 'user'`), which let ANY professional
        // on the platform mint a payment stage on ANY project with an arbitrary
        // amount and themselves as recipient_id — which PaymentVerificationService
        // then authorized on `recipient_id`, so the same attacker could mark it
        // paid and write a ledger row. This is a money-forgery chain, so a
        // payment schedule now requires actual project participation.
        $isOwner = (int) $project->user_id === (int) $user->id;
        $isPM = $user->role_type === 'project_manager' && (int) $project->pm_id === (int) $user->id;

        if (!$isOwner && !$isPM && ! $this->isHiredProfessional($project, $user)) {
            return response()->json([
                'message' => 'Unauthorized. Only the project owner, the assigned Project Manager, or a hired professional on this project may create a payment schedule.',
            ], 403);
        }

        // DISPUTE FREEZE: while a dispute is open the payment plan is contested.
        app(DisputeService::class)->assertNoOpenDispute($project);

        $request->validate([
            'label' => 'required|string|max:255',
            'percentage' => 'required|numeric|min:0|max:100',
            'amount' => 'required|integer|min:0|max:99999999999999',
            'trigger_description' => 'nullable|string|max:255',
            // SECURITY: payments can never be created directly in a paid state;
            // paid is reserved for the proof-upload / verification flows.
            'status' => 'nullable|string|in:locked,pending,invoice_sent',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
            'role_type' => 'nullable|string|in:arsitek,kontraktor,mep,interior,notaris,structural,project_manager',
        ]);

        $requestedRole = $request->role_type;

        // SECURITY: only the owner or assigned PM may create termins attributed
        // to ANOTHER role; professionals always create termins for their own role.
        $canActForOthers = $isOwner || $isPM;
        if (!$canActForOthers) {
            $requestedRole = $user->role_type;
        }

        $effectiveRole = $requestedRole ?? $user->role_type;

        // A stage may never push the plan past the negotiated contract value.
        try {
            $planService->assertWithinContractValue($project, $effectiveRole, (float) $request->amount);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $termin = $project->paymentTermins()->create([
            'label' => $request->label,
            'percentage' => $request->percentage,
            'amount' => $request->amount,
            'trigger_description' => $request->trigger_description,
            'status' => $request->status ?? 'locked',
            'milestone_id' => $request->milestone_id,
            'notes' => $request->notes,
            'role_type' => $effectiveRole,
            'recipient_id' => ($requestedRole && $requestedRole !== $user->role_type) ? null : $user->id,
        ]);
        

        $this->logActivity($project, 'termin_added', "Payment termin added: {$request->label}");

        return response()->json(['data' => $termin->load('milestone')], 201);
    }

    public function updatePaymentTermin(Request $request, Project $project, ProjectPaymentTermin $termin, TerminPlanService $planService)
    {
        $user = Auth::user();

        // Binding check: the termin must belong to THIS project.
        if ((int) $termin->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $isAuthor = $termin->recipient_id === $user->id;
        $isOwner = $project->user_id === $user->id;
        // BUGFIX: projects.pm_id stores the PM's USER id — comparing it to the
        // PM's PROFILE id (as before) never matched for the real assigned PM.
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isAuthor && !$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // DISPUTE FREEZE: plan edits are contested while a dispute is open.
        app(DisputeService::class)->assertNoOpenDispute($project);

        $request->validate([
            'label' => 'nullable|string|max:255',
            'percentage' => 'nullable|numeric|min:0|max:100',
            'amount' => 'nullable|integer|min:0|max:99999999999999',
            'trigger_description' => 'nullable|string|max:255',
            // SECURITY: paid is a verification-flow outcome, never self-service.
            'status' => 'nullable|string|in:locked,pending,invoice_sent',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
        ]);

        $updateData = $request->only(['label', 'percentage', 'amount', 'trigger_description', 'status', 'milestone_id', 'notes']);

        try {
            // Never re-plan a stage the payer already funded or is verifying —
            // otherwise the payee could change the amount after the owner
            // uploaded a proof for a different figure.
            $planService->assertNoInFlightDrift($project, [$updateData + ['id' => $termin->id]], $termin->role_type);

            if (array_key_exists('amount', $updateData)) {
                $planService->assertWithinContractValue(
                    $project,
                    $termin->role_type,
                    (float) $updateData['amount'],
                    $termin->id
                );
            }
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $termin->update($updateData);

        return response()->json(['data' => $termin->load('milestone')]);
    }





    public function linkMilestone(Request $request, Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();

        // Binding check: the termin must belong to THIS project.
        if ((int) $termin->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // Authorization: Recipient of the termin or PM
        if ($termin->recipient_id !== $user->id && $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'milestone_id' => 'required|exists:project_milestones,id'
        ]);

        // Check if this termin is already linked to another milestone
        // Or if the target milestone is already linked to another termin for this professional
        $milestoneLinked = ProjectPaymentTermin::where('milestone_id', $request->milestone_id)
            ->where('role_type', $termin->role_type)
            ->where('id', '!=', $termin->id)
            ->exists();
            
        if ($milestoneLinked) {
            return response()->json(['message' => 'This work phase is already linked to another payment.'], 422);
        }

        $termin->update([
            'milestone_id' => $request->milestone_id
        ]);

        return response()->json(['message' => 'Payment linked successfully.', 'data' => $termin]);
    }

    public function unlinkMilestone(Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();

        // Binding check: the termin must belong to THIS project.
        if ((int) $termin->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($termin->recipient_id !== $user->id && $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $termin->update(['milestone_id' => null]);
        return response()->json(['message' => 'Payment unlinked.']);
    }

    public function deletePaymentTermin(Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();

        // Binding check: the termin must belong to THIS project.
        if ((int) $termin->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $isOwner = $project->user_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        // SECURITY: a hired professional may only delete termins of their OWN
        // role (previously any hired contractor could delete other roles' termins).
        // Never allow deleting termins with money in flight.
        if (!$isOwner && !$isPM) {
            $isHiredForThisRole = $user->role_type === 'kontraktor'
                && (int) $project->selected_kontraktor_id === (int) optional($user->kontraktor)->id
                && $termin->role_type === 'kontraktor';

            if (!$isHiredForThisRole) {
                return response()->json(['message' => 'Unauthorized. You can only delete your own role payment terms.'], 403);
            }
        }

        if (in_array($termin->status, ['verifying', 'paid'])) {
            return response()->json(['message' => 'Cannot delete a payment term with an ongoing or completed payment.'], 422);
        }

        $termin->delete();
        return response()->json(['message' => 'Deleted']);
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
