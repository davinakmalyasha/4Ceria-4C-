<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectDailyLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'user_id',
        'log_date',
        'weather',
        'worker_count',
        'activities',
        'issues',
        'photos',
    ];

    protected $casts = [
        'photos' => 'array',
        'log_date' => 'date',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
