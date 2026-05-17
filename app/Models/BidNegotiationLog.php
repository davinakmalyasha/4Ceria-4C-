<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BidNegotiationLog extends Model
{
    protected $fillable = [
        'bid_id',
        'bid_type',
        'user_id',
        'round_number',
        'snapshot',
        'note',
        'changes_detected',
    ];

    protected $casts = [
        'snapshot' => 'array',
        'changes_detected' => 'array',
    ];

    public function bid()
    {
        return $this->morphTo();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
