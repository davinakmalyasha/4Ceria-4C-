<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectPaymentTermin extends Model
{
    use HasFactory;

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
        'paid_at',
        'notes',
        'retention_amount',
        'net_amount',
        'retention_notes',
        'verification_notes',
    ];

    protected $casts = [
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
