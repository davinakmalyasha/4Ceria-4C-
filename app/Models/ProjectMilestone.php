<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectMilestone extends Model
{
    protected $fillable = ['project_id', 'title', 'is_completed'];

    protected $casts = [
        'is_completed' => 'boolean',
    ];
}
