<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProjectDispute extends Model
{
    protected $table = 'project_disputes';

    protected $fillable = [
        'project_id',
        'opened_by',
        'termination_id',
        'resolved_by',
        'category',
        'title',
        'description',
        'status',
        'disputed_amount',
        'payment_type',
        'payment_id',
        'resolution',
        'resolution_notes',
        'resolved_at',
    ];

    protected $casts = [
        'disputed_amount' => 'float',
        'resolved_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function termination(): BelongsTo
    {
        return $this->belongsTo(ProjectTermination::class, 'termination_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(DisputeMessage::class, 'dispute_id');
    }

    public function isOpen(): bool
    {
        return $this->status === 'open';
    }
}
