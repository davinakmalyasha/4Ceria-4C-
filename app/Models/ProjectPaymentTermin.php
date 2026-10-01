<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use App\Services\RetentionService;
use App\Support\Money;

class ProjectPaymentTermin extends Model
{
    use HasFactory;

    /**
     * Compute the retention split on creation, so it cannot be forgotten.
     *
     * WHY A HOOK RATHER THAN SIX CALL SITES
     * --------------------------------------
     * A payment stage is created in six places (ProjectController x3,
     * ProjectPaymentTerminController, ProjectChangeOrderController, and the
     * termin-plan path). The failure this fixes is precisely that ONE of them
     * remembered to write `retention_amount` -- and it wrote `0` -- while the
     * other five wrote nothing at all. So the invariant lived nowhere.
     *
     * Filling it in `creating` means a new stage cannot be minted with an
     * inconsistent split, and adding a seventh creation site needs no change here
     * at all. Same principle as App\Support\Hire: one implementation, so it cannot
     * drift.
     *
     * EXPLICIT VALUES ARE RESPECTED. A caller that sets `retention_amount`
     * deliberately is making a commercial decision -- `ProjectChangeOrderController`
     * sets 0 because a change order is extra scope, not retention-bearing -- and
     * the hook must not overrule it. So the split is only computed when the key is
     * absent entirely.
     *
     * THE INVARIANT: `retention_amount + net_amount === amount`, exactly. Money is
     * never `null` on either column, so a stage is never partially specified.
     */
    protected static function booted(): void
    {
        static::creating(function (self $termin) {
            if (array_key_exists('retention_amount', $termin->getAttributes())) {
                return; // deliberate; leave it alone
            }

            $gross = Money::fromColumn($termin->amount ?? 0);
            $split = app(RetentionService::class)->split($gross);

            $termin->retention_amount = $split['retention']->toDecimal();
            $termin->net_amount = $split['net']->toDecimal();
        });
    }

    protected $fillable = [
        'project_id',
        'role_type',
        'recipient_id',
        'label',
        'percentage',
        'amount',
        'trigger_description',
        'status',
        'milestone_id',
        'change_order_id',
        'paid_at',
        'notes',
        'retention_amount',
        'net_amount',
        // Release bookkeeping. `retention_released_at` being NULL is what
        // "still held" means, and it is what
        // `escrow:release-retention` filters on so a repeated run cannot pay
        // twice. See migration 2026_10_01_000012.
        'retention_released_at',
        'retention_released_amount',
        'retention_notes',
        'verification_notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'retention_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'retention_released_amount' => 'decimal:2',
        'retention_released_at' => 'datetime',
        'refunded_amount' => 'decimal:2',
        'paid_at' => 'datetime',
        'percentage' => 'decimal:2',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function recipient()
    {
        return $this->belongsTo(User::class, 'recipient_id');
    }

    public function milestone()
    {
        return $this->belongsTo(ProjectMilestone::class);
    }
}
