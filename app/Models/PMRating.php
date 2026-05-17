<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PMRating extends Model
{
    protected $table = 'p_m_ratings';

    protected $fillable = [
        'project_id',
        'user_id',
        'pm_id',
        'rating',
        'komentar',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function projectManager()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id');
    }

    public function pm()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id');
    }
}
