<?php

use App\Support\LedgerReference;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Canonicalise the ledger's reference spellings and void the duplicates they
 * allowed.
 *
 * THE DEFECT
 * ----------
 * `project_budget_transactions.reference_model` is part of the unique index
 * that makes the ledger idempotent:
 *
 *     budget_tx_reference_unique (project_id, reference_model, reference_id,
 *                                 transaction_type)
 *
 * That index can only dedupe two writes of the same movement if both use the
 * same spelling of the model. They did not.
 *
 * The live database held BOTH spellings of ONE payment:
 *
 *     id 5619  'ProjectAddendum'             payment  Rp 5 500 000  09:20:39
 *     id 5918  'App\Models\ProjectAddendum'   payment  Rp 5 500 000  10:07:54
 *
 * Same project (14975), same addendum (934), same type, same amount, same
 * title — one payment, booked twice. Because the strings differ, the unique
 * index could not see them as the same movement, and `paidTotalMoney()` —
 * which sums every disbursement row — counted Rp 5 500 000 twice. The escrow
 * on that project was understated by exactly that amount.
 *
 * The `2026_08_25` normalisation migration could not help: it ran on
 * 2026-08-25, and these rows were written on 2026-10-02 by a code path that
 * has since been removed from the codebase.
 *
 * WHAT THIS MIGRATION DOES
 * ------------------------
 * 1. Adds the three `voided_*` columns, so a voided row can be recognised,
 *    explained and audited.
 *
 * 2. Finds every group of rows that refer to the SAME movement, comparing by
 *    the CANONICAL spelling — which is how a short/FQCN pair is seen as the
 *    pair it is.
 *
 * 3. VOIDS the extras. "Voided" means: the amount becomes 0, the original
 *    amount is preserved in `voided_original_amount`, `voided_at` records when
 *    it happened, `voided_duplicate_of_id` points at the row that was kept,
 *    and `reference_id` becomes NULL so the voided row steps out of the unique
 *    index's way.
 *
 *    The row is NOT deleted. The ledger is the audit trail, and a row that
 *    was written is evidence that a write happened. Zeroing the amount is
 *    what makes every figure right WITHOUT a single aggregate having to
 *    remember to exclude voided rows — which is the failure mode that made
 *    this class of bug invisible in the first place.
 *
 * 4. Normalises every remaining row's `reference_model` and `reverses_model`
 *    to the canonical spelling.
 *
 * WHICH ROW IS KEPT
 * ------------------
 * The one with the GREATEST id — the last write, which is the settled one.
 * The earlier rows are artefacts of write paths that no longer exist.
 *
 * For the live pair this also keeps the row whose `transaction_date`
 * (2026-10-01 10:07:54) matches addendum 934's `paid_at` exactly, so the
 * surviving ledger row and the domain record agree.
 *
 * THE GOING-FORWARD GUARANTEE
 * ---------------------------
 * This migration fixes the DATA. The CODE is fixed by
 * `ProjectBudgetTransaction`'s saving hook, which canonicalises
 * `reference_model` on every write — so no code path can reintroduce a
 * second spelling, and the existing unique index becomes an effective guard
 * instead of a decoration.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ---------------------------------------------------------------
        // 1. The voided_* columns.
        // ---------------------------------------------------------------
        if (! Schema::hasColumn('project_budget_transactions', 'voided_at')) {
            Schema::table('project_budget_transactions', function ($table) {
                $table->timestamp('voided_at')->nullable()->after('actor_role');
                $table->unsignedBigInteger('voided_duplicate_of_id')->nullable()->after('voided_at');
                $table->decimal('voided_original_amount', 24, 2)->nullable()->after('voided_duplicate_of_id');
            });
        }

        // ---------------------------------------------------------------
        // 2. Find the duplicate groups, comparing by CANONICAL spelling.
        //
        // The canonical expression is the same rule the application now
        // applies in `LedgerReference::canonical()`: an `App\Models\` prefix
        // is added to a bare short name, and an already-prefixed name is
        // left alone.
        //
        // THE PREFIX IS COMPARED WITH `SUBSTRING(...) = '...'`, NOT WITH
        // `LIKE`. MySQL's LIKE treats the backslash as an ESCAPE character,
        // so the pattern `App\\Models\\%` matches the literal text
        // "AppModels%" — and NEVER a class name. The first draft of this
        // migration used LIKE, the prefix test silently failed, the two
        // spellings were grouped separately, and the duplicate was never
        // found. `=` has no escape processing, so it compares the text.
        // ---------------------------------------------------------------
        $canonical = <<<'SQL'
            CASE
                WHEN reference_model IS NULL THEN NULL
                WHEN SUBSTRING(reference_model, 1, 11) = 'App\\Models\\' THEN reference_model
                ELSE CONCAT('App\\Models\\', reference_model)
            END
        SQL;

        $groups = DB::select(
            "SELECT project_id,
                    {$canonical} AS canonical_model,
                    reference_id,
                    transaction_type,
                    COUNT(*) AS row_count,
                    MAX(id) AS keep_id
               FROM project_budget_transactions
              WHERE reference_model IS NOT NULL
                AND reference_id IS NOT NULL
                AND voided_at IS NULL
              GROUP BY project_id, canonical_model, reference_id, transaction_type
             HAVING row_count > 1"
        );

        foreach ($groups as $group) {
            // The losers are the OTHER rows of the same canonical group.
            //
            // The canonical model has to be part of the match: `reference_id`
            // alone is ambiguous — `App\Models\BidArsitek` id 42 and
            // `App\Models\BidKontraktor` id 42 are different rows belonging to
            // different tables, and matching on the id alone would void one of
            // them.
            $losers = DB::select(
                "SELECT id, amount
                   FROM project_budget_transactions
                  WHERE project_id = ?
                    AND reference_id = ?
                    AND transaction_type <=> ?
                    AND id <> ?
                    AND voided_at IS NULL
                    AND ({$canonical}) = ?",
                [$group->project_id, $group->reference_id, $group->transaction_type, $group->keep_id, $group->canonical_model]
            );

            foreach ($losers as $loser) {
                // The canonical spelling is what the KEEPING row already has,
                // so the losers are matched by reference_id + type. The
                // reference_id is the same for both spellings, which is the
                // whole point.
                DB::update(
                    'UPDATE project_budget_transactions
                        SET voided_original_amount = amount,
                            amount = 0,
                            voided_at = ?,
                            voided_duplicate_of_id = ?,
                            reference_id = NULL,
                            title = LEFT(CONCAT(?, title), 255)
                      WHERE id = ?',
                    [
                        now(),
                        $group->keep_id,
                        '[VOIDED — duplicate ledger reference #' . $group->keep_id . '] ',
                        $loser->id,
                    ]
                );
            }
        }

        // ---------------------------------------------------------------
        // 3. Canonicalise the remaining rows.
        //
        // Safe now: the rows that would have collided have been voided, and
        // a voided row's `reference_id` is NULL, so it steps out of the
        // unique index's way.
        // ---------------------------------------------------------------
        // The namespace prefix is compared with `SUBSTRING(...) = '...'`, NOT
        // with `LIKE`: MySQL's LIKE treats the backslash as an escape
        // character, so a LIKE pattern never matches a namespaced class name.
        //
        // The queries below use NOWDOC so the SQL text reaches MySQL exactly
        // as written. In a double-quoted PHP string `"App\\Models\\"` is
        // `App\Models\`, and in an SQL string literal `'App\Models\'` the
        // backslash ESCAPES THE QUOTE — the literal is unterminated and the
        // comparison silently matches nothing.
        $shortNames = DB::select(
            <<<'SQL'
                SELECT DISTINCT reference_model AS model
                  FROM project_budget_transactions
                 WHERE reference_model IS NOT NULL
                   AND SUBSTRING(reference_model, 1, 11) <> 'App\\Models\\'
            SQL
        );

        foreach ($shortNames as $row) {
            $canonicalModel = LedgerReference::canonical($row->model);

            if ($canonicalModel === null || $canonicalModel === $row->model) {
                continue;
            }

            DB::update(
                'UPDATE project_budget_transactions
                    SET reference_model = ?
                  WHERE reference_model = ?',
                [$canonicalModel, $row->model]
            );
        }

        $shortReversals = DB::select(
            <<<'SQL'
                SELECT DISTINCT reverses_model AS model
                  FROM project_budget_transactions
                 WHERE reverses_model IS NOT NULL
                   AND SUBSTRING(reverses_model, 1, 11) <> 'App\\Models\\'
            SQL
        );

        foreach ($shortReversals as $row) {
            $canonicalModel = LedgerReference::canonical($row->model);

            if ($canonicalModel === null || $canonicalModel === $row->model) {
                continue;
            }

            DB::update(
                'UPDATE project_budget_transactions
                    SET reverses_model = ?
                  WHERE reverses_model = ?',
                [$canonicalModel, $row->model]
            );
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('project_budget_transactions', 'voided_at')) {
            return;
        }

        // Restore the voided amounts before the evidence is removed.
        DB::update(
            'UPDATE project_budget_transactions
                SET amount = voided_original_amount,
                    voided_at = NULL,
                    voided_duplicate_of_id = NULL,
                    voided_original_amount = NULL
              WHERE voided_at IS NOT NULL'
        );

        Schema::table('project_budget_transactions', function ($table) {
            $table->dropColumn(['voided_at', 'voided_duplicate_of_id', 'voided_original_amount']);
        });
    }
};
