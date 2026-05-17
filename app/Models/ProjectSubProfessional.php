<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectSubProfessional extends Model
{
    use HasFactory;

    protected $table = 'project_sub_professionals';

    protected $fillable = [
        'project_id',
        'user_id',
        'parent_role',
        'sub_role',
        'assigned_by',
        'status',
        'rate',
        'scope_notes',
        'lead_pro_notes',
        'suggested_fee',
        'accepted_at',
        'recommended_at',
        'hired_at',
        'completed_at',
    ];

    protected $casts = [
        'rate' => 'decimal:2',
        'suggested_fee' => 'decimal:2',
        'accepted_at' => 'datetime',
        'recommended_at' => 'datetime',
        'hired_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function assignedByUser()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
