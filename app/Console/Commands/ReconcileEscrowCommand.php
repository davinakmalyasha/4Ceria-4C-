<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectPaymentTermin;
use App\Services\ProjectFinancialService;
use App\Services\TerminPlanService;
use App\Support\Money;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Check that the escrow agrees with the ledger that is supposed to explain it.
 *
 * WHY A SECOND DIAGNOSTIC
 * -----------------------
 * `money:detect-duplicates` answers "are there structurally impossible rows?".
 * This answers a different question: "do the ARITHMETIC INVARIANTS hold?".
 *
 * The distinction matters because a wrong figure and a missing figure look the
 * same from inside the application. Every dashboard total is derived from the
 * same ledger, so if the ledger disagrees with `projects.budget` the whole UI
 * is SELF-CONSISTENTLY WRONG and no amount of reading the app will reveal it.
 * The invariants can only be checked from outside, which is what this does.
 *
 * THE INVARIANTS, AND WHY EACH ONE EXISTS
 * --------------------------------------
 * 1. CEILING == SUM(deposit) - SUM(adjustment_down).
 *    B10 made `budget` impossible to write without a ledger row, so this is
 *    now checkable for the first time. Before that the ceiling was a free
 *    column anyone could edit, which is exactly why it had to be reconciled.
 *
 * 2. `available` (ceiling - disbursed) MUST NOT BE NEGATIVE.
 *    It cannot go negative through `deductBudget` — the affordability check
 *    refuses — but it CAN through any path that writes the ceiling directly, so
 *    the assertion belongs here rather than being assumed.
 *
 * 3. NO DISBURSEMENT WITHOUT AN ACTOR.
 *    Added in C2. A payment or refund row with `actor_user_id IS NULL` is not
 *    necessarily wrong (a scheduled settlement), but a `refund` with no actor
 *    is the shape arbitration most needs to be able to attribute, so it is
 *    surfaced separately.
 *
 * 4. PLAN SUMS vs THE NEGOTIATED CONTRACT VALUE, per role.
 *    `TerminPlanService` now enforces this on the binding path, so a violation
 *    means either pre-existing data written before C1 or a write path that
 *    bypasses the guard. Both are worth knowing.
 *
 * 5. RETENTION RECORDED BUT NOT RELEASED.
 *    `retention_amount` has exactly one write site and it hardcodes 0, so this
 *    is expected to report nothing until D1 lands. It is included so the
 *    invariant is pinned BEFORE retention becomes real, rather than discovered
 *    afterwards.
 *
 * READ-ONLY, ALWAYS
 * -----------------
 * Everything here is a SELECT. There is no `--fix`, deliberately: a repair tool
 * for the escrow needs an owner decision about WHICH figure is correct, and
 * guessing on someone's money is worse than reporting. `--fix` should only ever
 * be added alongside an explicit, per-finding decision.
 */
class ReconcileEscrowCommand extends Command
{
    protected $signature = 'money:reconcile
        {--project= : Restrict the scan to one project id}
        {--details : Print each offending project, not just the count}';

    protected $description = 'Verify escrow arithmetic invariants against the ledger (read-only)';

    public function handle(): int
    {
        $projectId = $this->option('project');
        $details = (bool) $this->option('details');
        $problems = 0;

        $projects = Project::query()
            ->when($projectId, fn ($q) => $q->where('id', $projectId))
            ->orderBy('id')
            ->get();

        $this->newLine();
        $this->components->info('Escrow reconciliation — every figure below is derived from the ledger');
        $this->newLine();

        $problems += $this->checkCeilingMatchesLedger($projects, $details);
        $problems += $this->checkAvailableIsNotNegative($projects, $details);
        $problems += $this->checkDisbursementsHaveActors($details, $projectId);
        $problems += $this->checkPlansAgainstContracts($projects, $details);
        $problems += $this->checkRetentionNeverReleased($details, $projectId);

        $this->newLine();
        if ($problems === 0) {
            $this->components->info('All escrow invariants hold.');

            return self::SUCCESS;
        }

        $this->components->error("{$problems} invariant violation(s) found. Nothing was written.");

        return self::FAILURE;
    }

    /**
     * 1. projects.budget must equal the ceiling movements on the ledger.
     *
     * `deposit` raises the ceiling, `adjustment_down` lowers it, and
     * `payment` must NOT appear here — a payment is deducted from `available`,
     * not from the ceiling, so counting it would double-count the same movement
     * (see ProjectFinancialService::DISBURSEMENT_TYPES).
     */
    private function checkCeilingMatchesLedger($projects, bool $details): int
    {
        $this->components->twoColumnDetail(
            '<info>1. Ceiling matches the ledger</info>',
            '(projects.budget == SUM(deposit) - SUM(adjustment_down))'
        );

        $violations = 0;

        foreach ($projects as $project) {
            $rows = ProjectBudgetTransaction::where('project_id', $project->id)
                ->whereIn('transaction_type', ['deposit', 'adjustment_down'])
                ->get(['transaction_type', 'amount']);

            // A project with NO ceiling movements cannot be reconciled: the
            // opening figure was never recorded. That is reported separately
            // rather than counted as drift, because "unknown" and "wrong" are
            // different problems with different fixes.
            if ($rows->isEmpty()) {
                continue;
            }

            $expected = Money::zero();
            foreach ($rows as $row) {
                $amount = Money::fromColumn($row->amount);
                $expected = $row->transaction_type === 'deposit'
                    ? $expected->add($amount)
                    : $expected->subtract($amount);
            }

            $actual = Money::fromColumn($project->budget);

            if ($expected->equals($actual)) {
                continue;
            }

            $violations++;

            if ($details) {
                $this->line(sprintf(
                    '  project %-5d  column Rp %-18s ledger Rp %-18s drift %s',
                    $project->id,
                    $actual->toDecimal(),
                    $expected->toDecimal(),
                    $actual->subtract($expected)->toDecimal()
                ));
            }
        }

        $unrecorded = $projects->filter(fn ($p) => ! $this->hasCeilingRows($p->id))->count();
        $this->reportCount($violations, $unrecorded > 0
            ? "({$unrecorded} project(s) have no ceiling row, so cannot be reconciled)"
            : '');

        return $violations;
    }

    /**
     * 2. The available balance must never be negative.
     *
     * `deductBudget` refuses an unaffordable payment, so this should be
     * structurally impossible. It is checked rather than assumed because the
     * ceiling is a COLUMN: anything that writes it directly can put the project
     * in a state the write-path guard would never create.
     */
    private function checkAvailableIsNotNegative($projects, bool $details): int
    {
        $this->components->twoColumnDetail(
            '<info>2. Available balance is not negative</info>',
            '(ceiling - disbursed >= 0)'
        );

        $violations = 0;
        $financial = app(ProjectFinancialService::class);

        foreach ($projects as $project) {
            $available = $financial->availableMoney($project);

            if (! $available->isNegative()) {
                continue;
            }

            $violations++;

            if ($details) {
                $this->line(sprintf(
                    '  project %-5d  available %s  (ceiling %s, disbursed %s)',
                    $project->id,
                    $available->toDecimal(),
                    Money::fromColumn($project->budget)->toDecimal(),
                    $financial->paidTotalMoney($project->id)->toDecimal()
                ));
            }
        }

        $this->reportCount($violations);

        return $violations;
    }

    /**
     * 3. Every disbursement should name a human, and every refund MUST.
     *
     * Split deliberately. A `payment` with no actor is usually a scheduled or
     * system-initiated movement and is only informational. A `refund` with no
     * actor is a real gap: refunds are issued by an arbitrator, and C2 exists
     * precisely so that "who issued this" is answerable from the ledger alone.
     */
    private function checkDisbursementsHaveActors(bool $details, ?string $projectId): int
    {
        $this->components->twoColumnDetail(
            '<info>3. Disbursements name an actor</info>',
            '(a refund with no actor cannot be attributed)'
        );

        // Scoped by `--project` like every other check. Two unscoped queries in
        // one command is how a `--project=1` run ends up reporting findings
        // from other projects, which is worse than reporting none.
        $scope = fn ($q) => $projectId
            ? $q->where('project_id', $projectId)
            : $q;

        $anonymousPayments = $scope(
            ProjectBudgetTransaction::where('transaction_type', 'payment')->whereNull('actor_user_id')
        )->count();

        $anonymousRefunds = $scope(
            ProjectBudgetTransaction::where('transaction_type', 'refund')->whereNull('actor_user_id')
        )->count();

        if ($details && ($anonymousPayments || $anonymousRefunds)) {
            foreach (
                $scope(
                    ProjectBudgetTransaction::whereNull('actor_user_id')
                        ->whereIn('transaction_type', ['payment', 'refund'])
                )
                    ->orderBy('id')
                    ->get(['id', 'project_id', 'transaction_type', 'amount', 'title'])
                as $row
            ) {
                $this->line(sprintf(
                    '  ledger #%-6d project %-5d %-16s Rp %-16s %s',
                    $row->id,
                    $row->project_id,
                    $row->transaction_type,
                    Money::fromColumn($row->amount)->toDecimal(),
                    $row->title
                ));
            }
        }

        // Only unattributable REFUNDS are a violation. An anonymous payment is
        // a legitimate system movement and is reported, not failed.
        if ($anonymousPayments > 0) {
            $this->line("  {$anonymousPayments} payment row(s) have no human actor (expected for system-initiated movements)");
        }

        $this->reportCount($anonymousRefunds, $anonymousRefunds > 0 ? '(refunds must be attributable)' : '');

        return $anonymousRefunds;
    }

    /**
     * 4. Each role's plan must total its negotiated contract value.
     *
     * Enforced on the binding path since C1, so a violation here is either
     * pre-C1 data or a write path that bypasses the guard.
     */
    private function checkPlansAgainstContracts($projects, bool $details): int
    {
        $this->components->twoColumnDetail(
            '<info>4. Plans match the negotiated contract</info>',
            '(each role\'s stages total its accepted bid)'
        );

        $plan = app(TerminPlanService::class);
        $violations = 0;

        foreach ($projects as $project) {
            foreach (TerminPlanService::knownRoles() as $role) {
                $contract = $plan->contractValueFor($project, $role);

                if ($contract === null || $contract <= 0) {
                    continue;
                }

                $planned = Money::fromColumn($plan->plannedTotal($project, $role));

                // The same tolerance the guard uses, so this does not disagree
                // with the rule that is actually enforced.
                $limit = Money::of($contract)
                    ->add(Money::of(TerminPlanService::AMOUNT_TOLERANCE));

                if (! $planned->isGreaterThan($limit)) {
                    continue;
                }

                $violations++;

                if ($details) {
                    $this->line(sprintf(
                        '  project %-5d %-15s planned %s of contract %s',
                        $project->id,
                        $role,
                        $planned->toDecimal(),
                        Money::of($contract)->toDecimal()
                    ));
                }
            }
        }

        $this->reportCount($violations);

        return $violations;
    }

    /**
     * 5. Retention must eventually be released.
     *
     * `retention_amount` has one write site and it hardcodes 0, so this reports
     * nothing until D1 makes retention real. It is pinned NOW because the
     * invariant is only checkable once a non-zero value can exist, and finding
     * it after the fact would be too late.
     */
    private function checkRetentionNeverReleased(bool $details, ?string $projectId): int
    {
        $this->components->twoColumnDetail(
            '<info>5. Retention is released, not just recorded</info>',
            '(retention held past warranty expiry with no release)'
        );

        $held = ProjectPaymentTermin::query()
            ->when($projectId, fn ($q) => $q->where('project_id', $projectId))
            ->where('retention_amount', '>', 0)
            ->whereNotIn('status', ['void', 'paid'])
            ->get(['id', 'project_id', 'role_type', 'label', 'retention_amount']);

        // Only a project whose WARRANTY HAS EXPIRED should have released
        // retention. Before expiry, holding it is the correct behaviour.
        $expired = $held->filter(fn ($t) => (function () use ($t) {
            $project = Project::find($t->project_id);

            return $project?->warranty_end_at !== null
                && $project->warranty_end_at->isPast();
        })());

        if ($details) {
            foreach ($expired as $termin) {
                $this->line(sprintf(
                    '  project %-5d %-15s %-24s retained %s',
                    $termin->project_id,
                    $termin->role_type,
                    $termin->label,
                    Money::fromColumn($termin->retention_amount)->toDecimal()
                ));
            }
        }

        $this->reportCount($expired->count(), $held->count() > 0 && $expired->count() === 0
            ? "({$held->count()} retained, warranty still running — correct)"
            : '');

        return $expired->count();
    }

    private function hasCeilingRows(int $projectId): bool
    {
        return ProjectBudgetTransaction::where('project_id', $projectId)
            ->whereIn('transaction_type', ['deposit', 'adjustment_down'])
            ->exists();
    }

    private function reportCount(int $violations, string $note = ''): void
    {
        if ($violations === 0) {
            $this->line('  none');

            return;
        }

        $this->line("  {$violations} violation(s){$note}");
    }
}