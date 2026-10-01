<?php

namespace App\Services;

use App\Models\Project;
use App\Support\Money;

/**
 * The platform's own fee, itemised on the ledger.
 *
 * WHAT THIS IS, AND WHY IT IS OFF BY DEFAULT
 * ------------------------------------------
 * The shipped product copy states, in `commonDocs.ts`:
 *
 *     "4Ceria does not currently charge a platform fee. That is a deliberate
 *      current state, not a hidden charge, and we would rather tell you plainly
 *      than list fees that do not exist in the product."
 *
 *     "If a future release introduces a platform fee, it will be itemised on the
 *      project ledger next to the payment it applies to, not deducted invisibly."
 *
 * So this service implements exactly that promise, and ships switched OFF:
 * `ESCROW_PLATFORM_FEE_PERCENT` defaults to 0, so the copy above remains literally
 * true until someone deliberately enables it.
 *
 * IT IS NOT DEDUCTED INVISIBLY
 * -----------------------------
 * The fee is a SEPARATE ledger row, of type `platform_fee`, written next to the
 * payment it applies to. It is never folded into the payment figure. Three reasons,
 * in order of importance:
 *
 *  1. A client who sees "Paid Architect Base Fee Rp 40.000.000" and can find a
 *     matching "Platform fee (1%) Rp 400.000" underneath it can reconcile the two.
 *     A single combined figure cannot be reconciled and is how "hidden fees" begin.
 *  2. The professional's obligation is unchanged. The fee is charged to the CLIENT
 *     out of escrow; it is not taken out of what the professional is owed. Same
 *     principle as retention, and it is why `deductBudget()` is called with a
 *     separate amount rather than by reducing the payment.
 *  3. The unique ledger index is (project_id, reference_model, reference_id,
 *     transaction_type). A fee recorded as another `payment` against the same
 *     termin would collide with the payment it applies to and be silently dropped
 *     as a duplicate.
 *
 * DOUBLE-CHARGING
 * ----------------
 * The fee inherits `deductBudget()`'s existing dedupe, which keys on the same
 * tuple. So calling this twice for one payment returns false the second time and
 * writes nothing -- the fee is charged once per payment, without this class
 * needing its own guard.
 */
class PlatformFeeService
{
    /**
     * The configured percentage, clamped to a sane range.
     *
     * A negative fee would be a rebate and an absurd one would exceed the payment
     * it applies to, so both are clamped rather than trusted.
     */
    public function percent(): float
    {
        $percent = (float) config('escrow.platform_fee_percent', 0);

        return max(0.0, min($percent, 100.0));
    }

    public function isEnabled(): bool
    {
        return $this->percent() > 0.0;
    }

    /**
     * The fee for a gross amount, or zero when disabled.
     *
     * Computed the same way as retention -- and for the same reason: `net` is
     * derived by subtraction so the figures cannot drift apart by a sen.
     */
    public function feeOn(Money $gross): Money
    {
        if (! $this->isEnabled() || ! $gross->isPositive()) {
            return Money::zero();
        }

        $basisPoints = (int) round($this->percent() * 100);

        return $gross->multiplyBy($basisPoints)->divideBy(10000);
    }

    /**
     * Record the fee for a payment, itemised beside it.
     *
     * @param  string  $refModel  the reference the fee belongs to (e.g. the bid or
     *                            termin class), so it sits next to its payment
     * @return Money  what was recorded, or zero when the fee is off
     */
    public function recordFor(Project $project, Money $gross, string $refModel, int $refId, string $subjectLabel): Money
    {
        $fee = $this->feeOn($gross);

        if (! $fee->isPositive()) {
            return Money::zero();
        }

        $written = app(ProjectFinancialService::class)->deductBudget(
            $project,
            $fee,
            'platform_fee',
            sprintf(
                'Platform fee (%s%%): %s',
                rtrim(rtrim(number_format($this->percent(), 2, ',', '.'), '0'), ','),
                $subjectLabel
            ),
            $refModel,
            $refId,
        );

        // False means either the fee is already recorded (the dedupe) or the
        // escrow cannot cover it. Neither should abort the payment itself: a
        // platform fee it cannot collect is the platform's problem, not a reason to
        // fail the professional's payment. Reported so it is visible.
        if (! $written) {
            logger()->warning('Platform fee not recorded', [
                'project_id' => $project->id,
                'reference_model' => $refModel,
                'reference_id' => $refId,
                'fee' => $fee->toDecimal(),
            ]);

            return Money::zero();
        }

        return $fee;
    }
}