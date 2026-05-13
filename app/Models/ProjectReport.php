<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'phase_slug',
        'created_by',
        'summary',
        'progress_percentage',
        'budget_health',
        'site_photos',
        'attachments',
        'published_at',
    ];

    protected $casts = [
        'site_photos' => 'array',
        'attachments' => 'array',
        'published_at' => 'datetime',
        'progress_percentage' => 'integer',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
