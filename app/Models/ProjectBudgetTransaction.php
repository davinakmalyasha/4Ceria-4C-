<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectBudgetTransaction extends Model
{
    use HasFactory;

    protected $table = 'project_budget_transactions';

    protected $fillable = [
        'project_id',
        'transaction_type',
        'amount',
        'title',
        'reference_model',
        'reference_id',
        'transaction_date',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'transaction_date' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
