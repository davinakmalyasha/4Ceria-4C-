<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FirmMember extends Model
{
    protected $table = 'firm_members';

    protected $fillable = [
        'firm_owner_id',
        'member_user_id',
        'role_in_firm',
        'status',
        'invited_at',
        'accepted_at',
    ];

    protected $casts = [
        'invited_at'  => 'datetime',
        'accepted_at' => 'datetime',
    ];

    /* ── Relations ── */

    public function firmOwner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'firm_owner_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(User::class, 'member_user_id');
    }

    /* ── Scopes ── */

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeInvited($query)
    {
        return $query->where('status', 'invited');
    }
}
