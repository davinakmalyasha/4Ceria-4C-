<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\HasNegotiationHistory;

class BidMep extends Model
{
    protected $table = 'bids_mep';

    use HasFactory, HasNegotiationHistory;

    protected $fillable = [
        'project_id', 'mep_id', 'price', 'fee_type', 'unit_price', 'quantity', 'calculated_total',
        'proposal', 'status', 'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3',
        'scopes', 'deliverables', 'payment_status', 'paid_at',
        'offered_by_id', 'fee_agreed_at', 'negotiation_count',
        'verification_notes', 'payment_proof_path', 'is_recommended', 'interview_notes',
        'proposed_termins', 'proposed_milestones'
    ];

    protected $casts = [
        'scopes' => 'array',
        'deliverables' => 'array',
        'proposed_termins' => 'array',
        'proposed_milestones' => 'array',
        'paid_at' => 'datetime',
        'fee_agreed_at' => 'datetime',
        'is_recommended' => 'boolean',
    ];

    public function offeredBy()
    {
        return $this->belongsTo(User::class, 'offered_by_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function mepEngineer()
    {
        return $this->belongsTo(MepEngineer::class, 'mep_id');
    }
}
