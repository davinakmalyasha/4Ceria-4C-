<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectPaymentTermin;
use App\Support\Money;
use Carbon\CarbonInterface;

/**
 * Retention: the slice of a payment stage withheld until the warranty expires.
 *
 * WHY THIS EXISTS
 * ---------------
 * `project_payment_termins` has carried `retention_amount` and `net_amount` since
 * they were added, and had exactly ONE write site:
 *
 *     'retention_amount' => 0,
 *     'net_amount'       => $changeOrder->cost_impact,
 *
 * So retention was a display-only fiction: the columns read 0 forever, nothing was
 * ever held back, and no balance could be released because none was ever created.
 * `money:reconcile` was written to report exactly this ("`retention_amount` has one
 * write site and it hardcodes 0").
 *
 * WHAT RETENTION IS NOT
 * ---------------------
 * It is NOT a discount. The professional is owed the FULL `amount`; retention
 * changes only WHEN part of it is disbursable. So:
 *
 *     amount           the gross obligation, unchanged
 *     retention_amount the part held until the warranty expires
 *     net_amount       the part payable now
 *
 * and `retention_amount + net_amount === amount` always. `money:reconcile` asserts
 * that invariant, which is what makes this safe to add money arithmetic to.
 *
 * The arithmetic goes through App\Support\Money throughout: a percentage of a
 * rupiah figure is exactly where a float multiply would drift by a sen and leave
 * the two halves not summing to the gross.
 */
class RetentionService
{
    /**
     * Split a gross stage amount into (retention, net).
     *
     * Idempotent and total: the two parts always re-sum to the gross exactly.
     *
     * @return array{retention: \App\Support\Money, net: \App\Support\Money}
     */
    public function split(Money $gross): array
    {
        $percent = max(0.0, (float) config('escrow.retention_percent', 5));

        if ($percent <= 0.0 || ! $gross->isPositive()) {
            return ['retention' => Money::zero(), 'net' => $gross];
        }

        // `multiplyBy()` takes an int factor, and the percentage is fractional.
        // So the gross is scaled by the percentage in hundredths of a percent and
        // the remainder is forced back onto `net` rather than being rounded away:
        // under-allocating to retention would mean releasing money the warranty
        // was supposed to protect.
        $basisPoints = (int) round($percent * 100);

        $retention = $gross->multiplyBy($basisPoints)->divideBy(10000);

        return [
            'retention' => $retention,
            // Computed as gross MINUS retention rather than gross TIMES (1 - p),
            // so the sum is exact by construction. A float would leave a gap of up
            // to one sen between the halves and the gross.
            'net' => $gross->subtract($retention),
        ];
    }

    /**
     * What a termin payment should actually debit.
     *
     * READS THE PERSISTED SPLIT, never recomputes it. The stage was split once,
     * when it was created, at the retention rate the parties agreed to. If the
     * configured rate is changed afterwards, a recompute would silently move the
     * professional's net -- and the figure would no longer match the one they
     * accepted at negotiation. The stored `net_amount` is the contract; this
     * reads the contract.
     *
     * Legacy rows (created before D1) have `net_amount` of 0 because the column
     * did not exist. For those the gross is returned: they carry no retention to
     * withhold, so there is nothing to split, and paying 0 for a stage the client
     * approved would be a far worse answer than paying what was contracted.
     *
     * @return array{net: Money, retention: Money}
     */
    public function forTermin(ProjectPaymentTermin $termin): array
    {
        $gross = Money::fromColumn($termin->amount);
        $net = Money::fromColumn($termin->net_amount);
        $retention = Money::fromColumn($termin->retention_amount);

        if (! $net->isPositive() && $retention->isPositive()) {
            // A half-written split is not a legacy row, it is corruption. Paying
            // the gross would overpay; the honest answer is to hold back the
            // recorded retention and let `money:reconcile` flag the stage.
            return ['net' => $gross->subtract($retention), 'retention' => $retention];
        }

        if (! $net->isPositive() && ! $retention->isPositive()) {
            return ['net' => $gross, 'retention' => Money::zero()];
        }

        return ['net' => $net, 'retention' => $retention];
    }

    /**
     * Apply retention to a stage and persist the split.
     *
     * Safe to call more than once for the same stage: recomputes from `amount`
     * rather than from the previous split, so a rate change applies cleanly and a
     * repeated call is a no-op.
     *
     * @param  string|null  $notes  why retention is held, shown to the professional
     */
    public function applyTo(ProjectPaymentTermin $termin, ?string $notes = null): ProjectPaymentTermin
    {
        $gross = Money::fromColumn($termin->amount);

        $split = $this->split($gross);

        $termin->update([
            'retention_amount' => $split['retention']->toDecimal(),
            'net_amount' => $split['net']->toDecimal(),
            'retention_notes' => $notes ?? $termin->retention_notes,
        ]);

        return $termin->refresh();
    }

    /**
     * The warranty expiry for a project, from its recorded end date.
     *
     * Read from the row rather than recomputed from `finalized_at`, so the date
     * the client was shown on the BAST is the date the money is actually released
     * against. Recomputing would let the two drift the moment the window config
     * changes, which would move money on a date nobody agreed to.
     */
    public function warrantyEndsAt(Project $project): ?CarbonInterface
    {
        return $project->warranty_end_at;
    }

    public function warrantyDays(): int
    {
        return (int) config('escrow.warranty_days', 180);
    }

    /**
     * Has the warranty expired for this project?
     */
    public function isExpired(Project $project): bool
    {
        $endsAt = $this->warrantyEndsAt($project);

        return $endsAt !== null && $endsAt->isPast();
    }

    /**
     * Warranty claims that still block a release.
     *
     * A `resolved` claim does NOT block: the work was done and its cost settled,
     * so holding the retention for it would strand money that is no longer
     * contested.
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\ProjectWarrantyClaim>
     */
    public function blockingClaims(Project $project)
    {
        $states = (array) config('escrow.blocking_claim_states', ['open', 'fixing']);

        return $project->warrantyClaims()
            ->whereIn('status', $states)
            ->get();
    }

    /**
     * The retention held across the whole project.
     */
    public function totalHeld(Project $project): Money
    {
        return $project->paymentTermins()
            ->where('retention_amount', '>', 0)
            ->get()
            ->reduce(
                fn (Money $carry, ProjectPaymentTermin $t) => $carry->add(Money::fromColumn($t->retention_amount)),
                Money::zero()
            );
    }

    /**
     * The retention that is actually releasable: held, past the warranty date, and
     * not contested by an open claim.
     */
    public function releasableOn(Project $project): Money
    {
        if (! $this->isExpired($project)) {
            return Money::zero();
        }

        if ($this->blockingClaims($project)->isNotEmpty()) {
            return Money::zero();
        }

        return $this->totalHeld($project);
    }
}