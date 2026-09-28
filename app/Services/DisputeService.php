<?php

namespace App\Services;

use App\Models\BidArsitek;
use App\Models\BidInterior;
use App\Models\BidKontraktor;
use App\Models\BidMep;
use App\Models\BidNotaris;
use App\Models\BidProjectManager;
use App\Models\BidStructural;
use App\Models\DisputeMessage;
use App\Models\MaterialOrder;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectAddendum;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectDispute;
use App\Models\ProjectPaymentTermin;
use App\Models\ProjectSubProfessional;
use App\Models\ProjectTermination;
use App\Models\User;
use App\Traits\HandlesProjectAuthorization;
use Exception;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Dispute / arbitration center.
 *
 * While a dispute on a project is `open`, all payment verification and
 * budget mark-paid paths are frozen (assertNoOpenDispute). Admins close a
 * dispute with one of five maximal actions: dismiss, release_payment,
 * record_refund, terminate_project, custom.
 */
class DisputeService
{
    use HandlesProjectAuthorization;

    public const CATEGORIES = ['payment', 'quality', 'termination', 'delay', 'other'];

    /** Payment types accepted by PaymentVerificationController. */
    public const PAYMENT_TYPES = [
        'termin', 'addendum', 'material',
        'arsitek_bid', 'kontraktor_bid', 'notaris_bid', 'interior_bid',
        'pm_bid', 'structural_bid', 'mep_bid',
    ];

    public const EVIDENCE_MIMES = 'jpg,jpeg,png,webp,pdf';
    public const EVIDENCE_MAX_KB = 10240;

    public const ADMIN_ACTIONS = [
        'dismiss', 'release_payment', 'record_refund', 'terminate_project', 'custom',
    ];

    /**
     * Open a new dispute on the project (one open dispute per project).
     */
    public function open(Project $project, User $user, array $data, ?ProjectTermination $termination = null): ProjectDispute
    {
        $existing = ProjectDispute::where('project_id', $project->id)
            ->where('status', 'open')
            ->first();

        if ($existing) {
            throw new Exception(
                "Project already has open dispute #{$existing->id} (\"{$existing->title}\"). Payments stay frozen until it is resolved.",
                409
            );
        }

        $dispute = ProjectDispute::create([
            'project_id' => $project->id,
            'opened_by' => $user->id,
            'termination_id' => $termination?->id,
            'category' => $data['category'],
            'title' => $data['title'],
            'description' => $data['description'],
            'disputed_amount' => $data['disputed_amount'] ?? null,
            'payment_type' => $data['payment_type'] ?? null,
            'payment_id' => $data['payment_id'] ?? null,
            'status' => 'open',
        ]);

        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'dispute_opened',
            'details' => "Sengketa \"{$dispute->title}\" dibuka oleh {$user->name}. Pembayaran dibekukan sampai diselesaikan admin.",
        ]);

        $this->notifyRecipients($project, $user->id, 'dispute_opened', 'Dispute Opened — Payments Frozen',
            "\"{$dispute->title}\" was opened on \"{$project->title}\". All project payments are frozen until an admin resolves the dispute.",
            ['project_id' => $project->id, 'dispute_id' => $dispute->id]);

        return $dispute;
    }

    /**
     * Escalation entry point: a rejected mutual termination becomes a real
     * dispute row (idempotent — returns the existing open dispute if any).
     */
    public function escalateFromTermination(Project $project, ProjectTermination $termination, User $user): ProjectDispute
    {
        $existing = ProjectDispute::where('project_id', $project->id)
            ->where('status', 'open')
            ->first();

        if ($existing) {
            return $existing;
        }

        return $this->open($project, $user, [
            'category' => 'termination',
            'title' => 'Escalated mutual termination',
            'description' => "Mutual termination request #{$termination->id} was rejected and escalated to platform arbitration.\n\nOriginal reason: {$termination->reason}",
        ], $termination);
    }

    /**
     * Freeze gate: throws 422 while an open dispute exists on the project.
     * Called from uploadProof / verifyProof / markPaid.
     */
    public function assertNoOpenDispute(Project $project): void
    {
        $dispute = ProjectDispute::where('project_id', $project->id)
            ->where('status', 'open')
            ->first();

        if ($dispute) {
            throw new Exception(
                "Payments are frozen: dispute #{$dispute->id} (\"{$dispute->title}\") is open on this project. An admin must resolve it first.",
                422
            );
        }
    }

    public function isAdmin(User $user): bool
    {
        return $user->role_type === 'admin' || $user->hasRole('admin');
    }

    public function canAccess(ProjectDispute $dispute, User $user): bool
    {
        return $this->isAdmin($user)
            || $this->isProjectOwner($dispute->project, $user)
            || $this->isHiredProfessional($dispute->project, $user);
    }

    /**
     * Post a thread message (participants + admins while the dispute is open).
     */
    public function reply(ProjectDispute $dispute, User $user, string $body, ?UploadedFile $file = null): DisputeMessage
    {
        if (! $this->canAccess($dispute, $user)) {
            throw new Exception('Unauthorized.', 403);
        }

        if ($dispute->status !== 'open') {
            throw new Exception('This dispute is closed; the thread no longer accepts messages.', 422);
        }

        $evidencePath = null;
        $originalName = null;

        if ($file) {
            $evidencePath = $file->store('disputes/'.$dispute->id, 'railway');
            $originalName = mb_substr($file->getClientOriginalName(), 0, 255);
        }

        $message = DisputeMessage::create([
            'dispute_id' => $dispute->id,
            'user_id' => $user->id,
            'body' => $body,
            'evidence_path' => $evidencePath,
            'evidence_original_name' => $originalName,
        ]);

        $this->notifyRecipients($dispute->project, $user->id, 'dispute_reply', 'New Dispute Message',
            "{$user->name} replied on dispute \"{$dispute->title}\" ({$dispute->project->title}).",
            ['project_id' => $dispute->project_id, 'dispute_id' => $dispute->id]);

        return $message;
    }

    /**
     * Opener (or admin) withdraws an open dispute — unfreezes payments.
     */
    public function withdraw(ProjectDispute $dispute, User $user): ProjectDispute
    {
        if ((int) $dispute->opened_by !== (int) $user->id && ! $this->isAdmin($user)) {
            throw new Exception('Only the dispute opener can withdraw it.', 403);
        }

        if ($dispute->status !== 'open') {
            throw new Exception('This dispute is already closed.', 422);
        }

        $dispute->update([
            'status' => 'withdrawn',
            'resolution' => 'withdrawn',
            'resolution_notes' => 'Withdrawn by the opener.',
            'resolved_by' => $user->id,
            'resolved_at' => now(),
        ]);

        ProjectActivityLog::create([
            'project_id' => $dispute->project_id,
            'user_id' => $user->id,
            'action' => 'dispute_withdrawn',
            'details' => "Sengketa \"{$dispute->title}\" ditarik oleh {$user->name}. Pembayaran dicabut pembekuannya.",
        ]);

        $this->notifyRecipients($dispute->project, $user->id, 'dispute_resolved', 'Dispute Withdrawn',
            "Dispute \"{$dispute->title}\" was withdrawn. Payments are unfrozen.",
            ['project_id' => $dispute->project_id, 'dispute_id' => $dispute->id]);

        return $dispute->fresh();
    }

    /**
     * Admin arbitration. Closes the dispute with one of ADMIN_ACTIONS.
     *
     * dismiss           -> close, unfreeze, nothing moves
     * release_payment   -> force-accept the linked payment (full verifyProof
     *                      accept path: budget check, ledger, activation)
     * record_refund     -> negative ledger reversal + underlying payment
     *                      flipped to `refunded` (money moves off-platform)
     * terminate_project -> project status cancelled
     * custom            -> free-form resolution notes
     */
    public function adminAction(ProjectDispute $dispute, User $admin, string $action, ?string $notes = null, ?float $amount = null): ProjectDispute
    {
        if (! $this->isAdmin($admin)) {
            throw new Exception('Unauthorized. Admin access required.', 403);
        }

        if ($dispute->status !== 'open') {
            throw new Exception('This dispute is already closed.', 422);
        }

        if (! in_array($action, self::ADMIN_ACTIONS, true)) {
            throw new Exception('Unknown dispute action.', 422);
        }

        $project = $dispute->project;

        return DB::transaction(function () use ($dispute, $admin, $action, $notes, $amount, $project) {
            $resolution = $action;
            $status = $action === 'dismiss' ? 'dismissed' : 'resolved';
            $logDetails = match ($action) {
                'dismiss' => "Sengketa \"{$dispute->title}\" ditolak/di-dismiss oleh {$admin->name}. Pembayaran dicabut pembekuannya.",
                'release_payment' => "Sengketa \"{$dispute->title}\" diselesaikan: pembayaran terkait DISETUJUI oleh {$admin->name}.",
                'record_refund' => "Sengketa \"{$dispute->title}\" diselesaikan: refund Rp " . number_format((float) $amount, 0, ',', '.') . " dicatat oleh {$admin->name}.",
                'terminate_project' => "Sengketa \"{$dispute->title}\" diselesaikan: proyek DIHENTIKAN oleh {$admin->name}.",
                'custom' => "Sengketa \"{$dispute->title}\" diselesaikan (custom) oleh {$admin->name}.",
            };

            if ($action === 'release_payment') {
                if (! $dispute->payment_type || ! $dispute->payment_id) {
                    throw new Exception('This dispute has no linked payment to release. Use dismiss, refund, terminate, or custom.', 422);
                }

                app(PaymentVerificationService::class)->verifyProof(
                    $project,
                    $dispute->payment_type,
                    (int) $dispute->payment_id,
                    $admin,
                    'accept',
                    $notes ?? 'Released by admin arbitration.',
                    true // adminOverride — skips the payee/PM authorization check
                );
            }

            if ($action === 'record_refund') {
                if (! $amount || $amount <= 0) {
                    throw new Exception('A positive refund amount is required.', 422);
                }

                // A refund must be tied to the payment being returned.
                // Previously the cap was the PROJECT's total payments, so an
                // admin could refund pro A's termin out of pro B's money and
                // repeat the same refund from a second dispute.
                if (! $dispute->payment_type || ! $dispute->payment_id) {
                    throw new Exception(
                        'Link the disputed payment before recording a refund. Without it the platform cannot tell which payment is being returned.',
                        422
                    );
                }

                $payment = $this->resolvePaymentModel($dispute->payment_type, (int) $dispute->payment_id, $project->id);

                if (! $payment) {
                    throw new Exception('The linked payment no longer exists on this project.', 422);
                }

                // How much of THAT payment was actually disbursed.
                $paidForPayment = (float) ProjectBudgetTransaction::where('project_id', $project->id)
                    ->where('reference_model', get_class($payment))
                    ->where('reference_id', $payment->id)
                    ->whereIn('transaction_type', ['payment', 'refund'])
                    ->sum('amount');

                if ($paidForPayment <= 0) {
                    throw new Exception(
                        'That payment was never disbursed, so there is nothing to refund.',
                        422
                    );
                }

                // Durable, lock-guarded accounting of what has already been
                // returned — prevents a second dispute from refunding the same
                // money again.
                $alreadyRefunded = (float) ($payment->refunded_amount ?? 0);
                $refundable = $paidForPayment - $alreadyRefunded;

                if ($amount > $refundable + 0.01) {
                    throw new Exception(
                        'Refund exceeds what is still refundable on this payment. Paid: Rp '
                        .number_format($paidForPayment, 0, ',', '.').', already refunded: Rp '
                        .number_format($alreadyRefunded, 0, ',', '.').', refundable: Rp '
                        .number_format(max($refundable, 0), 0, ',', '.').'.',
                        422
                    );
                }

                if ($dispute->disputed_amount !== null && $amount > (float) $dispute->disputed_amount + 0.01) {
                    throw new Exception(
                        'Refund ('.number_format($amount, 0, ',', '.').') exceeds the disputed amount recorded on this dispute ('
                        .number_format((float) $dispute->disputed_amount, 0, ',', '.').').',
                        422
                    );
                }

                // Reversal row: a negative `refund` attributed to the PAYMENT it
                // reverses. The widened unique index
                // (project_id, reference_model, reference_id, transaction_type)
                // permits exactly one payment + one refund per reference, so
                // the same reversal can never be written twice.
                ProjectBudgetTransaction::create([
                    'project_id' => $project->id,
                    'transaction_type' => 'refund',
                    'amount' => -$amount,
                    'title' => "Dispute #{$dispute->id} refund: ".$this->paymentLabel($dispute),
                    'reference_model' => get_class($payment),
                    'reference_id' => $payment->id,
                    'transaction_date' => now(),
                ]);

                $payment->refunded_amount = $alreadyRefunded + $amount;

                // Flip the payment state: 'refunded' only once fully returned,
                // otherwise it stays 'paid' with a partial refund recorded.
                $fullyRefunded = ($alreadyRefunded + $amount) >= $paidForPayment - 0.01;

                if ($fullyRefunded && ($payment->payment_status ?? $payment->status) === 'paid') {
                    // Bids carry BOTH payment_status and status — only flip the
                    // payment field, else we clobber the lifecycle status.
                    if (isset($payment->payment_status)) {
                        $payment->payment_status = 'refunded';
                    } elseif (isset($payment->status)) {
                        $payment->status = 'refunded';
                    }
                }

                $payment->save();
            }

            if ($action === 'terminate_project') {
                $project->update(['status' => 'cancelled']);
            }

            if ($action === 'custom' && ! $notes) {
                throw new Exception('Resolution notes are required for a custom resolution.', 422);
            }

            $dispute->update([
                'status' => $status,
                'resolution' => $resolution,
                'resolution_notes' => $notes,
                'resolved_by' => $admin->id,
                'resolved_at' => now(),
            ]);

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $admin->id,
                'action' => 'dispute_resolved',
                'details' => $logDetails,
            ]);

            $project->touch();

            $this->notifyRecipients($project, $admin->id, 'dispute_resolved', 'Dispute Resolved',
                "Dispute \"{$dispute->title}\" on \"{$project->title}\" was closed ({$resolution}). Payments are unfrozen.",
                ['project_id' => $project->id, 'dispute_id' => $dispute->id]);

            return $dispute->fresh();
        });
    }

    /**
     * Owner / PM / hired-pro / sub-professional user ids for notifications.
     * PM trap honored: projects.pm_id is a USER id; selected_* are PROFILE ids.
     */
    private function participantUserIds(Project $project): array
    {
        $ids = [(int) $project->user_id];

        if ($project->pm_id) {
            $ids[] = (int) $project->pm_id;
        }

        $lookups = [
            'selected_arsitek_id' => fn ($id) => \App\Models\Arsitek::find($id)?->user_id,
            'selected_kontraktor_id' => fn ($id) => \App\Models\Kontraktor::find($id)?->user_id,
            'selected_notaris_id' => fn ($id) => \App\Models\NotarisProfile::find($id)?->user_id,
            'selected_interior_id' => fn ($id) => \App\Models\InteriorProfile::find($id)?->user_id,
            'structural_id' => fn ($id) => \App\Models\StructuralEngineer::find($id)?->user_id,
            'mep_id' => fn ($id) => \App\Models\MepEngineer::find($id)?->user_id,
        ];

        foreach ($lookups as $column => $resolver) {
            if ($project->{$column}) {
                $uid = $resolver($project->{$column});
                if ($uid) {
                    $ids[] = (int) $uid;
                }
            }
        }

        $subs = ProjectSubProfessional::where('project_id', $project->id)
            ->where('status', 'active')
            ->pluck('user_id');

        foreach ($subs as $uid) {
            if ($uid) {
                $ids[] = (int) $uid;
            }
        }

        return array_values(array_unique(array_filter($ids)));
    }

    /**
     * Notify every participant + every admin except the sender.
     */
    private function notifyRecipients(Project $project, int $exceptUserId, string $type, string $title, string $body, array $data): void
    {
        try {
            $recipients = $this->participantUserIds($project);

            $admins = User::where('role_type', 'admin')
                ->orWhereHas('roles', fn ($q) => $q->where('name', 'admin'))
                ->pluck('id');

            foreach ($admins as $adminId) {
                $recipients[] = (int) $adminId;
            }

            foreach (array_unique($recipients) as $uid) {
                if ($uid === $exceptUserId) {
                    continue;
                }

                Notification::create([
                    'user_id' => $uid,
                    'type' => $type,
                    'title' => $title,
                    'body' => $body,
                    'data' => $data,
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('Dispute notification failed: '.$e->getMessage());
        }
    }

    /**
     * Human label for a dispute's linked payment (used in ledger titles and
     * admin messages).
     */
    private function paymentLabel(ProjectDispute $dispute): string
    {
        $payment = $this->resolvePaymentModel(
            (string) $dispute->payment_type,
            (int) $dispute->payment_id,
            (int) $dispute->project_id
        );

        if (! $payment) {
            return (string) $dispute->payment_type.' #'.$dispute->payment_id;
        }

        return (string) ($payment->label ?? $payment->title ?? $payment->store_name ?? ('#'.$payment->id));
    }

    /**
     * Resolve the payment model behind a dispute's payment_type/payment_id.
     */
    private function resolvePaymentModel(string $type, int $id, int $projectId)
    {
        return match ($type) {
            'termin' => ProjectPaymentTermin::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'addendum' => ProjectAddendum::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'material' => MaterialOrder::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'arsitek_bid' => BidArsitek::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'kontraktor_bid' => BidKontraktor::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'notaris_bid' => BidNotaris::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'interior_bid' => BidInterior::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'pm_bid' => BidProjectManager::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'structural_bid' => BidStructural::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            'mep_bid' => BidMep::where('id', $id)->where('project_id', $projectId)->lockForUpdate()->first(),
            default => null,
        };
    }

    /**
     * Signed URL for dispute thread evidence (private railway disk).
     *
     * SECURITY: the presigned response forces the object's stored
     * Content-Type and Content-Disposition. Without pinning both, an uploaded
     * HTML/SVG would render as an active document on the storage origin for
     * every participant and admin who clicks "view evidence" — stored XSS
     * inside the dispute-resolution flow. `evidence` is now restricted to
     * images/pdf at validation time as well (see EVIDENCE_MIMES).
     */
    public function evidenceUrl(DisputeMessage $message): string
    {
        if (! $message->evidence_path) {
            throw new Exception('This message has no evidence attachment.', 404);
        }

        $disk = Storage::disk('railway');

        if (! $disk->exists($message->evidence_path)) {
            throw new Exception('Evidence file not found.', 404);
        }

        $extension = strtolower(pathinfo($message->evidence_path, PATHINFO_EXTENSION));
        $contentType = match ($extension) {
            'pdf' => 'application/pdf',
            'webp' => 'image/webp',
            'jpg', 'jpeg' => 'image/jpeg',
            default => 'application/octet-stream',
        };

        return $disk->temporaryUrl(
            $message->evidence_path,
            now()->addMinutes(15),
            [
                'ResponseContentType' => $contentType,
                'ResponseContentDisposition' => 'attachment; filename="'.basename($message->evidence_original_name ?: 'evidence.'.$extension).'"',
            ]
        );
    }
}
