<?php

namespace App\Models;

use App\Support\LedgerReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per movement against a project's escrow.
 *
 * The ledger is the audit record. It is the reason a figure can be explained
 * after the fact, so every column here is written on purpose:
 *
 *   transaction_type  deposit | adjustment_down | payment | refund
 *   amount            signed. `deposit`/`adjustment_down` are stored POSITIVE
 *                     and move the `projects.budget` ceiling, so they are
 *                     deliberately excluded from `available()`. `payment` is
 *                     positive, `refund` negative.
 *   reference_*       the thing this row is ABOUT, and the dedupe key.
 *                     For `payment` that is the payment. For `refund` it is
 *                     the DISPUTE — so the unique index
 *                     (project_id, reference_model, reference_id,
 *                     transaction_type) gives "one reversal per dispute",
 *                     which is the idempotency arbitration actually needs.
 *   reverses_*        for a `refund` only: the PAYMENT being returned. Keeping
 *                     this separate from `reference_*` is what allows a payment
 *                     to be refunded across several disputes instead of only
 *                     ever once.
 *   voided_*          a row that was VOIDED because it duplicated another
 *                     movement (see `voided_at`).
 */
class ProjectBudgetTransaction extends Model
{
    use HasFactory;

    protected $table = 'project_budget_transactions';

    protected $fillable = [
        'project_id',
        'transaction_type',
        'amount',
        'title',
        'reference_model',
        'reference_id',
        'reverses_model',
        'reverses_id',
        'transaction_date',
        // Who caused this movement. Deliberately NOT a foreign key: this table is
        // an immutable historical record, so deleting a user must not erase the
        // fact that they moved the money.
        'actor_user_id',
        'actor_role',
        // Set by the migration that voided a duplicate movement. Not written
        // by ordinary application code — a row is voided, never un-voided.
        'voided_at',
        'voided_duplicate_of_id',
        'voided_original_amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'transaction_date' => 'datetime',
        'reverses_id' => 'integer',
        'actor_user_id' => 'integer',
        'voided_at' => 'datetime',
        'voided_duplicate_of_id' => 'integer',
        'voided_original_amount' => 'decimal:2',
    ];

    /**
     * ONE canonical spelling of `reference_model`, enforced on every write.
     *
     * WHY THIS IS HERE AND NOT IN THE SERVICE
     * ---------------------------------------
     * The normalisation used to live inside
     * `ProjectFinancialService::recordTransaction()`. That protected the
     * writers that went through that method and nothing else — and the
     * dedupe index is only effective when EVERY writer agrees on the
     * spelling.
     *
     * The live database proved it:
     *
     *     id 5619  'ProjectAddendum'            payment 5 500 000
     *     id 5918  'App\Models\ProjectAddendum'  payment 5 500 000
     *
     * One payment, two spellings, so the unique index could not see them as
     * the same movement and the escrow was understated by Rp 5 500 000.
     *
     * A model-level guard closes the whole class: whatever a caller writes,
     * whatever path it takes, the column ends up canonical. See
     * `App\Support\LedgerReference`.
     */
    protected static function booted(): void
    {
        static::saving(function (self $transaction): void {
            $transaction->reference_model = LedgerReference::canonical($transaction->reference_model);
            $transaction->reverses_model = LedgerReference::canonical($transaction->reverses_model);
        });
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * A reversal names the payment it returns.
     */
    public function reverses()
    {
        return $this->morphTo('reverses', 'reverses_model', 'reverses_id');
    }

    public function isReversal(): bool
    {
        return $this->transaction_type === 'refund';
    }

    /**
     * The user who caused this movement, if a human did.
     *
     * NULL means no human actor — a scheduled settlement, a reconciliation
     * repair, or a system-generated opening balance. That is a real answer, not
     * missing data, which is why the column is nullable rather than defaulted to
     * some system user.
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    /**
     * Was a person behind this row at all?
     *
     * Lets `money:reconcile` separate "system-initiated, expected" from
     * "money moved and nobody can say who", which are very different findings.
     */
    public function hasHumanActor(): bool
    {
        return $this->actor_user_id !== null;
    }
}
