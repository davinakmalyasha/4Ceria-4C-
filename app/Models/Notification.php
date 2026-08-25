<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;

class Notification extends Model
{
    use Prunable;

    protected $fillable = [
        'user_id',
        'type',
        'title',
        'body',
        'data',
        'read_at',
    ];

    protected $casts = [
        'data' => 'array',
        'read_at' => 'datetime',
    ];

    /**
     * PERF: one notification row per chat message — without pruning this
     * table grows forever and drags the hottest unread-count queries.
     * Prune read notifications older than 90 days (unread are kept).
     */
    public function prunable(): Builder
    {
        return static::where('read_at', '<=', now()->subDays(90));
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
