<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectMilestone extends Model
{
    protected $fillable = [
        'project_id', 
        'arsitek_id', 
        'kontraktor_id', 
        'title', 
        'description', 
        'start_date', 
        'due_date', 
        'is_completed'
    ];

    protected $casts = [
        'is_completed' => 'boolean',
        'start_date' => 'date',
        'due_date' => 'date',
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
}
