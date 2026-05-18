<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use App\Traits\HasNegotiationHistory;

class BidInterior extends Model
{
    use HasFactory, HasNegotiationHistory;

    protected $table = 'bids_interior';

    protected $fillable = [
        'project_id', 'interior_id', 'price', 'price_max', 'proposal', 'status',
        'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3',
        'payment_status', 'paid_at', 'scopes', 'deliverables',
        'fee_type', 'unit_price', 'quantity', 'calculated_total',
        'offered_by_id', 'fee_agreed_at', 'negotiation_count',
        'verification_notes', 'payment_proof_path',
        'proposed_termins', 'proposed_milestones'
    ];

    protected $casts = [
        'scopes' => 'array',
        'deliverables' => 'array',
        'proposed_termins' => 'array',
        'proposed_milestones' => 'array',
        'fee_agreed_at' => 'datetime',
        'price_max' => 'decimal:2',
    ];

    public function offeredBy()
    {
        return $this->belongsTo(User::class, 'offered_by_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function interior()
    {
        return $this->belongsTo(InteriorProfile::class, 'interior_id');
    }
}
