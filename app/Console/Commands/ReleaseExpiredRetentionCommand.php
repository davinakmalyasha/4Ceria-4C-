<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Services\ProjectFinancialService;
use App\Services\RetentionService;
use App\Support\Money;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Release expired retention balances.
 *
 * WHY A COMMAND RATHER THAN A CONTROLLER OR A MIDDLEWARE
 * ------------------------------------------------------
 * A retention balance becomes releasable by the passage of TIME, not by a user
 * action. There is no request to hang it off, and a request-triggered release
 * would mean money sits unreleased until someone happens to load the right page.
 *
 * So it is a scheduled command, which also makes it re-runnable: if the app was
 * down on the day the warranty expired, the next run picks it up. Idempotency is
 * therefore part of the contract, not a nicety -- see `markReleased()` below.
 *
 * THE RULES, IN ORDER
 * -------------------
 *   1. The warranty must have EXPIRED (`projects.warranty_end_at` in the past).
 *      Read from the recorded date, never recomputed, so the date the client was
 *      shown on the BAST is the date money is released against.
 *   2. No claim may still be CONTESTING the balance. `open` and `fixing` block;
 *      `resolved` and `closed` do not, because the work was done and its cost
 *      settled -- holding retention for a resolved claim would strand money that
 *      nobody is contesting any more.
 *   3. The write goes through ProjectFinancialService, never a direct insert, so
 *      the release appears in the same ledger as everything else and
 *      `money:reconcile` can see it. That is the whole point of the ledger.
 *
 * IDEMPOTENCY
 * -----------
 * Each stage is marked released in the same transaction that writes the ledger
 * row, and a stage with `retention_released_at` set is skipped. Re-running after a
 * partial failure therefore resumes rather than double-paying.
 */
class ReleaseExpiredRetentionCommand extends Command
{
    protected $signature = 'escrow:release-retention
                            {--project= : Limit to one project id}
                            {--dry-run : Report what would be released, write nothing}';

    protected $description = 'Release retention balances whose warranty period has expired and which are not contested by an open claim';

    public function handle(RetentionService $retention, ProjectFinancialService $financial): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $projects = Project::query()
            ->whereNotNull('warranty_end_at')
            ->where('warranty_end_at', '<', now())
            ->when($this->option('project'), fn ($q, $id) => $q->whereKey($id))
            ->get();

        $releasedStages = 0;
        $releasedTotal = Money::zero();
        $skippedBlocked = 0;
        $skippedNothingHeld = 0;

        foreach ($projects as $project) {
            $blocking = $retention->blockingClaims($project);

            if ($blocking->isNotEmpty()) {
                // Reported rather than silently skipped: "money was withheld" is
                // the answer an operator needs when asked why a balance has not
                // moved, and an unexplained zero looks like a bug.
                $this->line(sprintf(
                    '  project %d: %d blocking claim(s) [%s] - held back',
                    $project->id,
                    $blocking->count(),
                    $blocking->pluck('status')->unique()->implode(', '),
                ));
                $skippedBlocked++;

                continue;
            }

            $stages = $project->paymentTermins()
                ->where('retention_amount', '>', 0)
                ->whereNull('retention_released_at')
                ->get();

            if ($stages->isEmpty()) {
                $skippedNothingHeld++;

                continue;
            }

            foreach ($stages as $stage) {
                $amount = Money::fromColumn($stage->retention_amount);

                if (! $amount->isPositive()) {
                    continue;
                }

                if ($dryRun) {
                    $this->line(sprintf(
                        '  project %d stage %d: WOULD release %s (%s)',
                        $project->id, $stage->id,
                        $this->rupiah($amount), $stage->label,
                    ));

                    $releasedStages++;
                    $releasedTotal = $releasedTotal->add($amount);

                    continue;
                }

                try {
                    $written = DB::transaction(function () use ($project, $stage, $amount, $financial) {
                        // Re-read inside the transaction and bail if another
                        // replica released it between our read and this write.
                        // Two replicas run every schedule (see the `onOneServer()`
                        // notes in routes/console.php), so this is not theoretical.
                        $fresh = $stage->fresh();

                        if ($fresh->retention_released_at !== null) {
                            return null;
                        }

                        // The escrow must be able to cover the release. It should
                        // be, because retention was withheld from the same
                        // ceiling -- but a project whose budget was reduced after
                        // the fact could not be, and returning false rather than
                        // throwing leaves the stage unreleased for the next run.
                        //
                        // THE TYPE MUST BE `retention_release`, NOT `payment`.
                        //
                        // `deductBudget()` dedupes on (project_id, reference_id,
                        // transaction_type, reference_model). The termin's own
                        // payment already occupies (this project, this termin,
                        // 'payment', ProjectPaymentTermin). Releasing under the
                        // same type therefore MATCHED that row, returned `true`
                        // WITHOUT INSERTING, and the command marked the stage
                        // released and reported success -- so the escrow was never
                        // debited and the retention was neither held nor released.
                        // A silent no-op that reports success, which is the worst
                        // of the failure modes AGENTS.md trap 12 warns about.
                        if (! $financial->deductBudget(
                            $project,
                            $amount,
                            'retention_release',
                            "Retention released: {$stage->label} (warranty expired)",
                            \App\Models\ProjectPaymentTermin::class,
                            $stage->id,
                        )) {
                            return null;
                        }

                        // Marked in the SAME transaction as the ledger row, so the
                        // two cannot disagree.
                        $fresh->update([
                            'retention_released_at' => now(),
                            'retention_released_amount' => $amount->toDecimal(),
                        ]);

                        return $amount;
                    });
                } catch (\Throwable $e) {
                    // One project's failure must not abort the sweep.
                    Log::error('Retention release failed', [
                        'project_id' => $project->id,
                        'termin_id' => $stage->id,
                        'exception' => $e,
                    ]);

                    $this->error("  project {$project->id} stage {$stage->id}: FAILED - " . $e->getMessage());

                    continue;
                }

                if ($written === null) {
                    continue;
                }

                $releasedStages++;
                $releasedTotal = $releasedTotal->add($written);

                $this->line(sprintf(
                    '  project %d stage %d: released %s (%s)',
                    $project->id, $stage->id, $this->rupiah($written), $stage->label,
                ));
            }
        }

        $this->newLine();
        $this->info(sprintf(
            '%s %d stage(s), total %s',
            $dryRun ? 'WOULD RELEASE' : 'Released',
            $releasedStages,
            $this->rupiah($releasedTotal),
        ));

        $this->line(sprintf(
            'projects scanned %d | skipped (blocking claim) %d | skipped (nothing held) %d',
            $projects->count(), $skippedBlocked, $skippedNothingHeld,
        ));

        return self::SUCCESS;
    }

    /**
     * Human-readable rupiah for command output.
     *
     * `Money::__toString()` returns the raw DECIMAL column representation, which is
     * correct for storage and unreadable in a terminal. Formatting is a display
     * concern, so it lives here rather than on the money value object -- `Money` is
     * deliberately free of locale formatting for exactly that reason.
     */
    private function rupiah(Money $amount): string
    {
        return 'Rp ' . number_format($amount->toFloat(), 0, ',', '.');
    }
}