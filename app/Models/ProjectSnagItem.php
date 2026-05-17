<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectSnagItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id', 'title', 'description', 'location',
        'severity', 'photos', 'status', 'assigned_role',
        'reported_by', 'resolved_at', 'resolution_note',
    ];

    protected $casts = [
        'photos' => 'array',
        'resolved_at' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function reporter()
    {
        return $this->belongsTo(User::class, 'reported_by');
    }
}
