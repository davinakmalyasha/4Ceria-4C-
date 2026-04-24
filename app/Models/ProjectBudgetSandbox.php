<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectBudgetSandbox extends Model
{
    use HasFactory;

    protected $table = 'project_budget_sandbox';

    protected $fillable = [
        'project_id',
        'title',
        'estimated_amount',
        'is_active',
    ];

    protected $casts = [
        'estimated_amount' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
