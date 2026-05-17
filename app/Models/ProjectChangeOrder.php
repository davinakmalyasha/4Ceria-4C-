<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectChangeOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id', 'requested_by', 'role_type', 'milestone_id', 'title', 'description',
        'cost_impact', 'time_impact_days', 'status',
        'pm_notes', 'owner_notes', 'approved_at',
    ];

    protected $casts = [
        'cost_impact' => 'decimal:2',
        'approved_at' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function milestone()
    {
        return $this->belongsTo(ProjectMilestone::class);
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
