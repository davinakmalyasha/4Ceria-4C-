<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Read-only diagnostics for the money ledger and the seven bid tables.
 *
 * Replaces `refinement-tests/detect-duplicate-keys.php`, which grouped the
 * ledger on three columns while the unique index is now four
 * `(project_id, reference_model, reference_id, transaction_type)`. Because one
 * `payment` row plus one `refund` row per reference is CORRECT under the
 * current index, the old script flagged every legitimate reversal pair as a
 * "duplicate" — so it was both stale and actively misleading.
 *
 * Everything here is a SELECT. Nothing writes.
 */
class DetectDuplicateKeysCommand extends Command
{
    protected $signature = 'money:detect-duplicates
        {--project= : Restrict the ledger scan to one project id}
        {--details : Print each offending row, not just the group count}';

    protected $description = 'Report duplicate ledger references, duplicate bids and unreconciled payment states (read-only)';

    /**
     * The seven parallel bid tables and the column holding the professional's
     * profile id. NOTE: structural/MEP store `structural_id` / `mep_id`, not
     * `structural_engineer_id` / `mep_engineer_id` — the same convention trap
     * documented in AGENTS.md.
     *
     * @var array<string, string>
     */
    private const BID_TABLES = [
        'bids_arsitek' => 'arsitek_id',
        'bids_kontraktor' => 'kontraktor_id',
        'bids_notaris' => 'notaris_id',
        'bids_interior' => 'interior_id',
        'bids_project_manager' => 'pm_id',
        'bids_structural' => 'structural_id',
        'bids_mep' => 'mep_id',
    ];

    /**
     * The canonical FQCN spelling the ledger uses after
     * `2026_08_25_000001_normalize_ledger_reference_models`.
     *
     * @var array<string, string>
     */
    private const PAYMENT_MODELS = [
        'bids_arsitek' => 'App\Models\BidArsitek',
        'bids_kontraktor' => 'App\Models\BidKontraktor',
        'bids_notaris' => 'App\Models\BidNotaris',
        'bids_interior' => 'App\Models\BidInterior',
        'bids_project_manager' => 'App\Models\BidProjectManager',
        'bids_structural' => 'App\Models\BidStructural',
        'bids_mep' => 'App\Models\BidMep',
        'termin' => 'App\Models\ProjectPaymentTermin',
        'addendum' => 'App\Models\ProjectAddendum',
        'material_order' => 'App\Models\MaterialOrder',
    ];

    public function handle(): int
    {
        $projectId = $this->option('project');
        $details = (bool) $this->option('details');
        $problems = 0;

        $this->newLine();
        $this->components->twoColumnDetail('<info>1. Duplicate ledger references</info>', '(one payment + one refund per reference is correct)');
        $problems += $this->scanLedgerDuplicates($projectId, $details);

        $this->newLine();
        $this->components->twoColumnDetail('<info>2. Duplicate bids (same professional, same project)</info>', '');
        $problems += $this->scanDuplicateBids($details);

        $this->newLine();
        $this->components->twoColumnDetail('<info>3. Paid rows with no ledger entry</info>', '(the ledger can only be trusted if these are empty)');
        $problems += $this->scanUnledgeredPayments();

        $this->newLine();
        $this->components->twoColumnDetail('<info>4. Refunds exceeding the payment they reverse</info>', '');
        $problems += $this->scanOverRefunds();

        $this->newLine();
        $this->components->twoColumnDetail('<info>5. Full user roster</info>', '');
        $this->listUsers();

        $this->newLine();
        if ($problems === 0) {
            $this->components->info('No integrity problems detected.');

            return self::SUCCESS;
        }

        $this->components->error("{$problems} integrity problem group(s) found.");

        return self::FAILURE;
    }

    private function scanLedgerDuplicates(?int $projectId, bool $details): int
    {
        // Group by the CANONICAL spelling of the reference model.
        //
        // The first draft of this scan grouped by the raw `reference_model`
        // string, so it compared 'ProjectAddendum' with
        // 'App\Models\ProjectAddendum' and concluded they were different
        // references. That is exactly how the duplicate it was written to
        // detect went unnoticed: the live database held both spellings of one
        // Rp 5 500 000 payment, and the scan reported "none".
        //
        // The canonical expression is the same rule the application applies in
        // `App\Support\LedgerReference::canonical()`. The prefix is compared
        // with SUBSTRING rather than LIKE, because MySQL's LIKE treats the
        // backslash as an escape character and would never match a namespaced
        // class name.
        //
        // VOIDED rows are excluded: a voided row has had its amount zeroed
        // and its reference_id nulled, precisely so it stops being a
        // duplicate. Counting it would report the fix as the fault.
        $canonical = <<<'SQL'
            CASE
                WHEN reference_model IS NULL THEN NULL
                WHEN SUBSTRING(reference_model, 1, 11) = 'App\\Models\\' THEN reference_model
                ELSE CONCAT('App\\Models\\', reference_model)
            END
        SQL;

        // The alias is NOT `reference_model`.
        //
        // MySQL resolves a GROUP BY column name to the TABLE COLUMN, not to
        // the select alias, when both exist. Aliasing the expression
        // `reference_model` therefore grouped by the RAW column — the very
        // spelling this scan exists to ignore — and the scan reported "none"
        // on a database that held the duplicate.
        $query = DB::table('project_budget_transactions')
            ->selectRaw("project_id, {$canonical} AS canonical_reference, reference_id, transaction_type, COUNT(*) AS row_count")
            ->whereNotNull('reference_model')
            ->whereNotNull('reference_id')
            ->whereNull('voided_at')
            ->groupBy('project_id', 'canonical_reference', 'reference_id', 'transaction_type')
            ->havingRaw('row_count > 1');

        if ($projectId !== null) {
            $query->where('project_id', $projectId);
        }

        $groups = $query->get();

        if ($groups->isEmpty()) {
            $this->line('  none');

            return 0;
        }

        foreach ($groups as $group) {
            $this->line(sprintf(
                '  <fg=red>project %d</> %s#%d type=%s appears <options=bold>%d</> times',
                $group->project_id,
                class_basename((string) $group->canonical_reference),
                (int) $group->reference_id,
                (string) $group->transaction_type,
                (int) $group->row_count
            ));
        }

        return $groups->count();
    }

    private function scanDuplicateBids(bool $details): int
    {
        $total = 0;

        foreach (self::BID_TABLES as $table => $column) {
            if (! DB::getSchemaBuilder()->hasTable($table) || ! DB::getSchemaBuilder()->hasColumn($table, $column)) {
                continue;
            }

            $groups = DB::table($table)
                ->selectRaw("project_id, {$column} AS professional_id, COUNT(*) AS row_count")
                ->groupBy('project_id', $column)
                ->havingRaw('row_count > 1')
                ->get();

            if ($groups->isEmpty()) {
                continue;
            }

            $total += $groups->count();

            foreach ($groups as $group) {
                $this->line(sprintf(
                    '  <fg=red>%s</> project %d professional %d bid <options=bold>%d</> times',
                    $table,
                    $group->project_id,
                    $group->professional_id,
                    $group->row_count
                ));
            }
        }

        return $total;
    }

    /**
     * A row asserting `paid` with no corresponding `payment` ledger row is the
     * exact failure mode of `ProjectBudgetController::markPaid` discarding the
     * return value of `recordPayment()` when the escrow could not cover it.
     */
    private function scanUnledgeredPayments(): int
    {
        $total = 0;

        foreach (self::PAYMENT_MODELS as $label => $model) {
            $table = $this->tableFor($model);

            if ($table === null || ! DB::getSchemaBuilder()->hasTable($table)) {
                continue;
            }

            $ledgerSub = DB::table('project_budget_transactions')
                ->select(DB::raw('1'))
                ->whereColumn('reference_id', "{$table}.id")
                // Both spellings, because the ledger's canonical form is the
                // FQCN and a row written before the canonicalisation (or by a
                // path that bypassed the model's guard) carries the short
                // name. Matching only one of them would report a payment as
                // unledgered when it is not.
                ->where(function ($q) use ($model) {
                    $q->where('reference_model', $model)
                        ->orWhere('reference_model', class_basename($model));
                })
                ->where('transaction_type', 'payment')
                ->whereNull('voided_at');

            $query = DB::table($table)->whereNotExists($ledgerSub);

            if (DB::getSchemaBuilder()->hasColumn($table, 'payment_status')) {
                $query->where('payment_status', 'paid');
            } elseif (DB::getSchemaBuilder()->hasColumn($table, 'status')) {
                $query->where('status', 'paid');
            } else {
                continue;
            }

            $rows = $query->select("{$table}.id", "{$table}.project_id")->limit(50)->get();

            if ($rows->isEmpty()) {
                continue;
            }

            $total += $rows->count();
            $ids = $rows->pluck('id')->implode(', ');

            $this->line("  <fg=red>{$label}</> ({$table}): " . $rows->count() . " row(s) marked paid with no ledger entry — ids {$ids}");
        }

        return $total;
    }

    private function scanOverRefunds(): int
    {
        // The two sides are joined on the CANONICAL spelling of the
        // reference, for the same reason the duplicate scan groups by it: a
        // payment written as 'ProjectAddendum' and a refund written as
        // 'App\Models\ProjectAddendum' are the same reference, and joining on
        // the raw string would find no pairing at all — so a refund that
        // exceeded its payment would go unreported.
        //
        // The two sides are qualified separately: inside a JOIN, an
        // unqualified column reference is ambiguous, and MySQL would reject
        // the whole statement.
        //
        // The template is a NOWDOC, so the SQL text reaches MySQL exactly as
        // written. In an interpolating heredoc `"App\\Models\\"` becomes
        // `App\Models\`, and in an SQL string literal `'App\Models\'` the
        // backslash ESCAPES THE QUOTE — the literal is unterminated.
        $canonicalTemplate = <<<'SQL'
            CASE
                WHEN %1$s.reference_model IS NULL THEN NULL
                WHEN SUBSTRING(%1$s.reference_model, 1, 11) = 'App\\Models\\' THEN %1$s.reference_model
                ELSE CONCAT('App\\Models\\', %1$s.reference_model)
            END
        SQL;

        $canonicalFor = static fn (string $alias): string => sprintf($canonicalTemplate, $alias);

        $rows = DB::table('project_budget_transactions as refund')
            ->join(
                'project_budget_transactions as payment',
                function ($join) use ($canonicalFor) {
                    $join->on('payment.project_id', '=', 'refund.project_id')
                        ->on(DB::raw($canonicalFor('payment')), '=', DB::raw($canonicalFor('refund')))
                        ->on('payment.reference_id', '=', 'refund.reference_id');
                }
            )
            ->where('refund.transaction_type', 'refund')
            ->where('payment.transaction_type', 'payment')
            ->whereNull('refund.voided_at')
            ->whereNull('payment.voided_at')
            ->groupBy('refund.project_id', 'refund.reference_model', 'refund.reference_id')
            ->selectRaw(
                'refund.project_id, refund.reference_model, refund.reference_id,
                 MAX(payment.amount) AS paid, -SUM(refund.amount) AS refunded'
            )
            ->havingRaw('refunded > paid + 0.01')
            ->get();

        foreach ($rows as $row) {
            $this->line(sprintf(
                '  <fg=red>project %d</> %s#%d refunded %s against a payment of %s',
                $row->project_id,
                class_basename((string) $row->reference_model),
                (int) $row->reference_id,
                number_format((float) $row->refunded, 0, ',', '.'),
                number_format((float) $row->paid, 0, ',', '.')
            ));
        }

        return $rows->count();
    }

    private function listUsers(): void
    {
        $users = User::query()->orderBy('id')->limit(12)->get(['id', 'email', 'role_type']);

        foreach ($users as $user) {
            $this->line(sprintf('  %-5d %-45s %s', $user->id, $user->email, $user->role_type));
        }

        $this->line('  total users: ' . User::count());
        $this->line('  total projects: ' . Project::count());
    }

    private function tableFor(string $model): ?string
    {
        if (! class_exists($model)) {
            return null;
        }

        return (new $model)->getTable();
    }
}
