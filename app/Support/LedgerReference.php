<?php

namespace App\Support;

/**
 * The canonical spelling of a ledger reference.
 *
 * WHY THIS EXISTS
 * ---------------
 * `project_budget_transactions.reference_model` is part of the unique index
 * that makes the ledger idempotent:
 *
 *     budget_tx_reference_unique (project_id, reference_model, reference_id,
 *                                 transaction_type)
 *
 * That index can only dedupe two writes of the SAME movement if both use the
 * SAME spelling of the model. And they did not.
 *
 * The live database held BOTH spellings of one payment:
 *
 *     id 5619  reference_model = 'ProjectAddendum'             payment 5 500 000
 *     id 5918  reference_model = 'App\Models\ProjectAddendum'   payment 5 500 000
 *
 * Same project, same addendum (934), same type, same amount — one payment,
 * booked twice. Because the strings differ, the unique index could not see
 * them as duplicates, and `paidTotalMoney()` — which sums every disbursement
 * row — counted Rp 5 500 000 twice. The escrow on that project was understated
 * by exactly that amount.
 *
 * The normalisation lived INSIDE `ProjectFinancialService::recordTransaction()`,
 * so it only protected the writers that went through that method. Any writer
 * that reached the table another way wrote whatever spelling it liked, and
 * the hole was invisible until it cost a project's escrow.
 *
 * THE RULE
 * -------
 * A ledger reference is spelled `App\Models\<ShortName>`, always. This class
 * is the one place that decides, and `ProjectBudgetTransaction` calls it on
 * every save, so a code path CANNOT write a non-canonical spelling — not by
 * accident, not by omission, not by a future refactor.
 *
 * The short name is what the human-facing tools print, because
 * `App\Models\ProjectAddendum` in a reconciliation report is noise.
 */
final class LedgerReference
{
    /**
     * The namespace every ledger reference lives in.
     */
    private const NAMESPACE = 'App\\Models\\';

    /**
     * The canonical spelling of a reference, or null when there is none.
     *
     * Accepts either spelling and returns the canonical one:
     *
     *     'ProjectAddendum'           -> 'App\Models\ProjectAddendum'
     *     'App\Models\ProjectAddendum' -> 'App\Models\ProjectAddendum'
     *
     * A class outside `App\Models` keeps its own namespace — the ledger may
     * legitimately reference something else, and silently rewriting it into
     * `App\Models` would point the reference at a class that does not exist.
     */
    public static function canonical(?string $model): ?string
    {
        if ($model === null) {
            return null;
        }

        $model = trim($model);

        if ($model === '') {
            return null;
        }

        // Already canonical?
        if (str_starts_with($model, self::NAMESPACE)) {
            return $model;
        }

        // A short name.
        if (! str_contains($model, '\\')) {
            return self::NAMESPACE.$model;
        }

        // Some other namespace — keep it, but normalise the leading separator.
        return ltrim($model, '\\');
    }

    /**
     * The short name of a reference: `ProjectAddendum`.
     *
     * This is what the reconciliation reports print.
     */
    public static function shortName(?string $model): ?string
    {
        if ($model === null || trim($model) === '') {
            return null;
        }

        $model = trim($model);
        $position = strrpos($model, '\\');

        return $position === false ? $model : substr($model, $position + 1);
    }

    /**
     * Every spelling that refers to the same thing, for a query that has to
     * match rows written before the canonical form was enforced.
     *
     * @return list<string>
     */
    public static function spellings(?string $model): array
    {
        $canonical = self::canonical($model);

        if ($canonical === null) {
            return [];
        }

        $spellings = [$canonical];
        $short = self::shortName($canonical);

        if ($short !== null && $short !== $canonical) {
            $spellings[] = $short;
        }

        return array_values(array_unique($spellings));
    }
}
