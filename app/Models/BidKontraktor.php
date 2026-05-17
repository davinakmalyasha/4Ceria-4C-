<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\HasNegotiationHistory;

class BidKontraktor extends Model
{
    protected $table = 'bids_kontraktor';

    use HasFactory, HasNegotiationHistory;

    protected $fillable = [
        'project_id', 'kontraktor_id', 'price', 'proposal', 'status',
        'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3',
        'construction_method', 'cost_breakdown', 'workforce_count', 'equipment_owned', 
        'warranty_months', 'payment_preference', 'payment_status', 'paid_at', 'scopes', 'deliverables',
        'fee_type', 'unit_price', 'quantity', 'calculated_total',
        'offered_by_id', 'fee_agreed_at', 'negotiation_count',
        'verification_notes', 'payment_proof_path',
        'proposed_termins', 'proposed_milestones', 'proposed_team'
    ];

    protected $casts = [
        'cost_breakdown' => 'array',
        'scopes' => 'array',
        'deliverables' => 'array',
        'proposed_termins' => 'array',
        'proposed_milestones' => 'array',
        'proposed_team' => 'array',
        'fee_agreed_at' => 'datetime',
    ];

    public function offeredBy()
    {
        return $this->belongsTo(User::class, 'offered_by_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class, 'kontraktor_id');
    }
}
