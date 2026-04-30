<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectWarrantyClaim extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'reporter_id',
        'title',
        'description',
        'images',
        'status',
        'cost_impact',
        'resolved_at',
    ];

    protected $casts = [
        'images' => 'array',
        'resolved_at' => 'datetime',
        'cost_impact' => 'decimal:2',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function reporter()
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }
}
