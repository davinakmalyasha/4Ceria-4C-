<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectTermination extends Model
{
    use HasFactory;

    protected $table = 'project_terminations';

    protected $fillable = [
        'project_id',
        'initiator_id',
        'reason',
        'settlement_terms',
        'status',
        'resolution_notes',
        'resolved_by_id',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function initiator()
    {
        return $this->belongsTo(User::class, 'initiator_id');
    }

    public function resolvedBy()
    {
        return $this->belongsTo(User::class, 'resolved_by_id');
    }
}
