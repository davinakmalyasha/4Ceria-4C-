<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectSchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'phase_slug',
        'target_start_date',
        'target_end_date',
        'actual_start_date',
        'actual_end_date',
        'progress_percentage',
        'status',
        'notes'
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
