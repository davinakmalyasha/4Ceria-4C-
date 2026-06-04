<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\HasNegotiationHistory;

class BidArsitek extends Model
{
    use HasFactory, HasNegotiationHistory;

    protected $table = 'bids_arsitek';

    protected $fillable = [
        'project_id', 'arsitek_id', 'price', 'price_max', 'proposal', 'status',
        'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3',
        'payment_status', 'paid_at', 'scopes', 'deliverables',
        'fee_type', 'unit_price', 'quantity', 'calculated_total',
        'offered_by_id', 'fee_agreed_at', 'negotiation_count',
        'verification_notes', 'payment_proof_path', 'is_recommended',
        'proposed_termins', 'proposed_milestones', 'proposed_team'
    ];

    protected $casts = [
        'scopes' => 'array',
        'deliverables' => 'array',
        'proposed_termins' => 'array',
        'proposed_milestones' => 'array',
        'proposed_team' => 'array',
        'fee_agreed_at' => 'datetime',
        'price_max' => 'decimal:2',
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

    public function arsitek()
    {
        return $this->belongsTo(Arsitek::class, 'arsitek_id', 'id');
    }
}
