<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'transaction_date' => 'datetime',
        'reverses_id' => 'integer',
    ];

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
}
