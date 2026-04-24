<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BidProjectManager extends Model
{
    use HasFactory;

    protected $table = 'bids_project_manager';

    protected $fillable = [
        'project_id',
        'pm_id',
        'price',
        'proposal',
        'status',
        'estimated_duration',
        'duration_unit',
        'fee_type',
        'scopes',
        'deliverables',
        'payment_status',
        'paid_at',
        'unit_price',
        'quantity',
        'calculated_total'
    ];

    protected $casts = [
        'scopes' => 'array',
        'deliverables' => 'array',
        'price' => 'decimal:2',
        'paid_at' => 'datetime'
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function pm()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id');
    }
}
