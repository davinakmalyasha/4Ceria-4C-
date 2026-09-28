<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DisputeMessage extends Model
{
    protected $table = 'dispute_messages';

    protected $fillable = [
        'dispute_id',
        'user_id',
        'body',
        'evidence_path',
        'evidence_original_name',
    ];

    public function dispute(): BelongsTo
    {
        return $this->belongsTo(ProjectDispute::class, 'dispute_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
