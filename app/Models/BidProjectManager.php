<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use App\Traits\HasNegotiationHistory;

class BidProjectManager extends Model
{
    use HasFactory, HasNegotiationHistory;

    protected $table = 'bids_project_manager';
    
    protected $attributes = [
        'duration_unit' => 'weeks',
        'status' => 'pending',
        'payment_status' => 'unpaid',
    ];

    protected $fillable = [
        'project_id',
        'pm_id',
        'price',
        'price_max',
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
        'calculated_total',
        'offered_by_id',
        'fee_agreed_at',
        'negotiation_count',
        'verification_notes',
        'payment_proof_path',
        'proposed_termins',
        'proposed_milestones',
        'attachment_1',
        'attachment_2',
        'attachment_3'
    ];

    protected $casts = [
        'scopes' => 'array',
        'deliverables' => 'array',
        'price' => 'decimal:2',
        'price_max' => 'decimal:2',
        'paid_at' => 'datetime',
        'fee_agreed_at' => 'datetime',
        'proposed_termins' => 'array',
        'proposed_milestones' => 'array'
    ];

    public function offeredBy()
    {
        return $this->belongsTo(User::class, 'offered_by_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function pm()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id');
    }

    public function projectManager()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id');
    }
}
