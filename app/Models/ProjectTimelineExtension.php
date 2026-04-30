<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectTimelineExtension extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'requester_id',
        'reason',
        'description',
        'days_requested',
        'status',
        'original_deadline',
        'new_deadline_date',
        'pm_notes',
        'owner_notes',
    ];

    protected $casts = [
        'original_deadline' => 'date',
        'new_deadline_date' => 'date',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requester_id');
    }
}
