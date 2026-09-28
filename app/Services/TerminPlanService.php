<?php

namespace App\Services;

use App\Models\Project;
use Exception;
use Illuminate\Support\Collection;

/**
 * Integrity guards for payment plans (`project_payment_termins`).
 *
 * WHY THIS EXISTS: `ProjectPaymentTerminController::storePaymentTermin` only
 * checked that the caller was not a plain owner-role user, so ANY professional
 * on the platform could mint a termin on ANY project with an arbitrary amount
 * and set themselves as `recipient_id` — then self-verify it through
 * `PaymentVerificationService` (which authorizes on `recipient_id`). Combined
 * with the missing proof gate this was a full ledger-forgery chain. This
 * service centralises the invariants so every write path shares them.
 */
class TerminPlanService
{
    public const PERCENTAGE_TOLERANCE = 0.01;
    public const AMOUNT_TOLERANCE = 1000; // Rp

    /**
     * The negotiated contract value for a role, taken from the accepted bid
     * (percentage bids must use `calculated_total`, never the raw `price` —
     * see BidCalculationService and the 2026-08 audit). Returns null when no
     * accepted bid exists yet (pre-contract plan building).
     */
    public function contractValueFor(Project $project, string $roleType): ?float
    {
        $bid = match ($roleType) {
            'arsitek' => $project->bidsArsitek()->whereIn('status', ['accepted', 'active', 'contract_pending', 'awaiting_payment'])->first(),
            'kontraktor' => $project->bidsKontraktor()->whereIn('status', ['accepted', 'active', 'contract_pending', 'awaiting_payment'])->first(),
            'notaris' => $project->bidsNotaris()->whereIn('status', ['accepted', 'active', 'contract_pending', 'awaiting_payment'])->first(),
            'interior' => $project->bidsInterior()->whereIn('status', ['accepted', 'active', 'contract_pending', 'awaiting_payment'])->first(),
            'project_manager' => $project->bidsProjectManager()->whereIn('status', ['accepted', 'active', 'contract_pending', 'awaiting_payment'])->first(),
            'structural' => $project->bidsStructural()->whereIn('status', ['accepted', 'active', 'contract_pending', 'awaiting_payment'])->first(),
            'mep' => $project->bidsMep()->whereIn('status', ['accepted', 'active', 'contract_pending', 'awaiting_payment'])->first(),
            default => null,
        };

        if (! $bid) {
            return null;
        }

        $value = $bid->calculated_total ?? $bid->price ?? null;

        return $value === null ? null : (float) $value;
    }

    /**
     * Total already planned (or paid) for a role, optionally excluding one
     * termin so an edit can be validated against the new value.
     */
    public function plannedTotal(Project $project, string $roleType, ?int $excludeTerminId = null): float
    {
        $query = $project->paymentTermins()
            ->where('role_type', $roleType)
            ->whereNotIn('status', ['void']);

        if ($excludeTerminId) {
            $query->where('id', '!=', $excludeTerminId);
        }

        return (float) $query->sum('amount');
    }

    /**
     * A single termin's amount (or the resulting plan total) may never exceed
     * the negotiated contract value for that role. Without this, a payer
     * approving a "DP" of Rp 900,000,000 against a Rp 50,000,000 contract
     * over-commits the escrow before anyone notices.
     */
    public function assertWithinContractValue(Project $project, string $roleType, float $amount, ?int $excludeTerminId = null): void
    {
        $contractValue = $this->contractValueFor($project, $roleType);

        if ($contractValue === null || $contractValue <= 0) {
            return; // no accepted contract yet — nothing to bound against
        }

        $planned = $this->plannedTotal($project, $roleType, $excludeTerminId) + $amount;

        if ($planned > $contractValue + self::AMOUNT_TOLERANCE) {
            throw new Exception(
                'Payment plan exceeds the negotiated contract value for this role. '
                .'Planned: Rp '.number_format($planned, 0, ',', '.').' of Rp '.number_format($contractValue, 0, ',', '.').'.',
                422
            );
        }
    }

    /**
     * A complete plan must sum to 100% (and its amounts to the contract value).
     * Enforced only where a plan becomes BINDING (signContract), because
     * professionals legitimately build a plan termin-by-terminin before it is
     * complete.
     */
    public function assertPlanComplete(Project $project, string $roleType): void
    {
        $termins = $project->paymentTermins()
            ->where('role_type', $roleType)
            ->whereNotIn('status', ['void'])
            ->get();

        if ($termins->isEmpty()) {
            throw new Exception('No payment schedule exists for this role.', 422);
        }

        $percentage = (float) $termins->sum('percentage');
        if (abs($percentage - 100) > self::PERCENTAGE_TOLERANCE) {
            throw new Exception(
                "Payment schedule must total 100% (currently {$percentage}%).",
                422
            );
        }

        $contractValue = $this->contractValueFor($project, $roleType);
        if ($contractValue !== null && $contractValue > 0) {
            $amount = (float) $termins->sum('amount');
            if (abs($amount - $contractValue) > self::AMOUNT_TOLERANCE) {
                throw new Exception(
                    'Payment schedule total (Rp '.number_format($amount, 0, ',', '.')
                    .') does not match the negotiated contract value (Rp '.number_format($contractValue, 0, ',', '.').').',
                    422
                );
            }
        }
    }

    /**
     * Termins that are already in flight or settled may not be re-planned —
     * the payee could otherwise change the amount AFTER the owner uploaded a
     * proof for a different figure, and the ledger would book a number the
     * proof does not support.
     *
     * @param  Collection|array  $termins  the plan as submitted
     */
    public function assertNoInFlightDrift(Project $project, $termins, string $roleType): void
    {
        $inFlight = $project->paymentTermins()
            ->where('role_type', $roleType)
            ->whereIn('status', ['verifying', 'paid'])
            ->get()
            ->keyBy('id');

        foreach ($termins as $incoming) {
            $id = (int) ($incoming['id'] ?? 0);

            if (! $id || ! $inFlight->has($id)) {
                continue;
            }

            $existing = $inFlight->get($id);

            if (isset($incoming['amount']) && abs((float) $incoming['amount'] - (float) $existing->amount) > 0.5) {
                throw new Exception(
                    "Payment stage \"{$existing->label}\" is already {$existing->status} and its amount can no longer be changed.",
                    422
                );
            }

            if (isset($incoming['percentage']) && abs((float) $incoming['percentage'] - (float) $existing->percentage) > self::PERCENTAGE_TOLERANCE) {
                throw new Exception(
                    "Payment stage \"{$existing->label}\" is already {$existing->status} and its percentage can no longer be changed.",
                    422
                );
            }
        }
    }
}
