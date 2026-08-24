<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Traits\HandlesProjectAuthorization;

class ProjectPaymentTerminController extends Controller
{
    use HandlesProjectAuthorization;

    public function getPaymentTermins(Project $project)
    {
        return response()->json(['data' => $project->paymentTermins()->with('milestone')->get()]);
    }

    public function storePaymentTermin(Request $request, Project $project)
    {
        $user = Auth::user();

        // Professionals or PM can create termins
        if ($user->role_type === 'user') {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'label' => 'required|string|max:255',
            'percentage' => 'required|numeric|min:0|max:100',
            'amount' => 'required|integer|min:0',
            'trigger_description' => 'nullable|string|max:255',
            // SECURITY: payments can never be created directly in a paid state;
            // paid is reserved for the proof-upload / verification flows.
            'status' => 'nullable|string|in:locked,pending,invoice_sent',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
            'role_type' => 'nullable|string|in:arsitek,kontraktor,mep,interior,notaris',
        ]);

        $requestedRole = $request->role_type;

        // SECURITY: only the owner or assigned PM may create termins attributed
        // to ANOTHER role; professionals always create termins for their own role.
        $canActForOthers = $user->id === $project->user_id
            || ($user->role_type === 'project_manager' && $project->pm_id === $user->id);
        if (!$canActForOthers) {
            $requestedRole = $user->role_type;
        }

        $termin = $project->paymentTermins()->create([
            'label' => $request->label,
            'percentage' => $request->percentage,
            'amount' => $request->amount,
            'trigger_description' => $request->trigger_description,
            'status' => $request->status ?? 'locked',
            'milestone_id' => $request->milestone_id,
            'notes' => $request->notes,
            'role_type' => $requestedRole ?? $user->role_type,
            'recipient_id' => ($requestedRole && $requestedRole !== $user->role_type) ? null : $user->id,
        ]);
        

        $this->logActivity($project, 'termin_added', "Payment termin added: {$request->label}");

        return response()->json(['data' => $termin->load('milestone')]);
    }

    public function updatePaymentTermin(Request $request, Project $project, ProjectPaymentTermin $termin)
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

        $request->validate([
            'label' => 'nullable|string|max:255',
            'percentage' => 'nullable|numeric|min:0|max:100',
            'amount' => 'nullable|integer|min:0',
            'trigger_description' => 'nullable|string|max:255',
            // SECURITY: paid is a verification-flow outcome, never self-service.
            'status' => 'nullable|string|in:locked,pending,invoice_sent',
            'milestone_id' => 'nullable|exists:project_milestones,id',
            'notes' => 'nullable|string|max:1000',
        ]);

        $updateData = $request->only(['label', 'percentage', 'amount', 'trigger_description', 'status', 'milestone_id', 'notes']);

        // If status changes to 'paid', record the timestamp
        if (isset($updateData['status']) && $updateData['status'] === 'paid' && $termin->status !== 'paid') {
            $updateData['paid_at'] = now();

            // Record in budget ledger (Link professional verification to balance reduction)
            \App\Models\ProjectBudgetTransaction::updateOrCreate(
                [
                    'project_id' => $project->id,
                    'reference_model' => 'App\Models\ProjectPaymentTermin',
                    'reference_id' => $termin->id,
                ],
                [
                    'transaction_type' => 'payment',
                    'amount' => $termin->amount,
                    'title' => "Paid Termin: {$termin->label} (Verified by Recipient)",
                    'transaction_date' => now(),
                ]
            );
        }
        

        $termin->update($updateData);

        return response()->json(['data' => $termin->load('milestone')]);
    }

    public function uploadProof(Request $request, Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();

        // Binding check: the termin must belong to THIS project.
        if ((int) $termin->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id === $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only project owner or assigned PM can upload proof.'], 403);
        }

        $request->validate([
            'payment_proof' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:2048', // 2MB max
        ]);

        if ($request->hasFile('payment_proof')) {
            $path = $request->file('payment_proof')->store('proofs/termins', 'public');
            $termin->update([
                'payment_proof_path' => $path,
                'status' => 'verifying',
            ]);

            $this->logActivity($project, 'termin_proof_uploaded', "Payment proof uploaded for: {$termin->label}");

            return response()->json(['message' => 'Proof uploaded! Awaiting professional verification.', 'data' => $termin]);
        }

        return response()->json(['message' => 'File upload failed.'], 400);
    }

    public function verifyPayment(Request $request, Project $project, ProjectPaymentTermin $termin)
    {
        $user = Auth::user();

        // Binding check: the termin must belong to THIS project.
        if ((int) $termin->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // Only the recipient (professional) or PM can verify
        $isRecipient = $termin->recipient_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;

        if (!$isRecipient && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only the recipient professional can verify this payment.'], 403);
        }

        $request->validate([
            'action' => 'required|in:accept,reject',
            'notes' => 'nullable|string|max:500',
        ]);

        return DB::transaction(function () use ($termin, $request, $project) {
            if ($request->action === 'accept') {
                $termin->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                    'notes' => $request->notes,
                ]);

                // Log in financial ledger
                \App\Models\ProjectBudgetTransaction::updateOrCreate(
                    [
                        'project_id' => $project->id,
                        'reference_model' => 'App\Models\ProjectPaymentTermin',
                        'reference_id' => $termin->id,
                    ],
                    [
                        'transaction_type' => 'payment',
                        'amount' => $termin->amount,
                        'title' => "Paid Termin: {$termin->label} (Verified)",
                        'transaction_date' => now(),
                    ]
                );

                // If this is the FIRST termin (DP), we might want to activate the BID status to 'accepted'
                $this->checkAndActivateBid($project, $termin);

                $this->logActivity($project, 'termin_verified', "Payment verified for: {$termin->label}");
            } else {
                $termin->update([
                    'status' => 'pending', // Reset to pending
                    'payment_proof_path' => null, // Clear bad proof
                    'notes' => $request->notes,
                ]);

                $this->logActivity($project, 'termin_rejected', "Payment rejected for: {$termin->label}");
            }

            return response()->json(['message' => 'Payment status updated.', 'data' => $termin]);
        });
    }

    private function checkAndActivateBid(Project $project, ProjectPaymentTermin $termin)
    {
        // Find the bid related to this termin and role
        $bidModel = match ($termin->role_type) {
            'arsitek' => \App\Models\BidArsitek::class,
            'kontraktor' => \App\Models\BidKontraktor::class,
            'notaris' => \App\Models\BidNotaris::class,
            'interior' => \App\Models\BidInterior::class,
            'project_manager' => \App\Models\BidProjectManager::class,
            'structural' => \App\Models\BidStructural::class,
            'mep' => \App\Models\BidMep::class,
            default => null,
        };

        if (!$bidModel) return;

        $bid = $bidModel::where('project_id', $project->id)
            ->where('status', 'awaiting_payment')
            ->first();

        if ($bid) {
            $bid->update(['status' => 'accepted']);
            
            // Also update the project's selected IDs if not already done
            if ($termin->role_type === 'arsitek') $project->update(['selected_arsitek_id' => $bid->arsitek_id]);
            if ($termin->role_type === 'kontraktor') $project->update(['selected_kontraktor_id' => $bid->kontraktor_id]);
            if ($termin->role_type === 'project_manager') $project->update(['pm_id' => $bid->pm->user_id]);
        }
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
