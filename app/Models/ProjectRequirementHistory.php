<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectRequirementHistory extends Model
{
    use HasFactory;

    protected $table = 'project_requirement_histories';

    protected $fillable = [
        'project_requirement_id',
        'user_id',
        'type',
        'quantity',
        'notes',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
    ];

    public function requirement()
    {
        return $this->belongsTo(ProjectRequirement::class, 'project_requirement_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
