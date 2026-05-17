<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectDelay extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'phase_slug',
        'days',
        'reason',
        'category',
        'logged_at'
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
