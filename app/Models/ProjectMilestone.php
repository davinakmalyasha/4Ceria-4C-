<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectMilestone extends Model
{
    protected $fillable = [
        'project_id',
        'arsitek_id',
        'kontraktor_id',
        'notaris_id',
        'interior_id',
        'pm_id',
        'title',
        'type',
        'content',
        'description',
        'image',
        'sort_order',
        'start_date',
        'due_date',
        'is_completed',
        'approval_status',
        'revision_notes',
        'phase_context',
        'pm_verified_at',
    ];

    protected $casts = [
        'is_completed' => 'boolean',
        'start_date' => 'date',
        'due_date' => 'date',
        'content' => 'array',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function arsitek()
    {
        return $this->belongsTo(Arsitek::class);
    }

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class);
    }

    public function pm()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id');
    }

    public function linkedTermin()
    {
        return $this->hasOne(ProjectPaymentTermin::class, 'milestone_id');
    }
}
