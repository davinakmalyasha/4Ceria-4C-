<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use App\Traits\HasNegotiationHistory;

class BidNotaris extends Model
{
    use HasFactory, HasNegotiationHistory;

    protected $table = 'bids_notaris';

    protected $fillable = [
        'project_id', 'notaris_id', 'price', 'price_max', 'proposal', 'status',
        'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3',
        'tax_estimate', 'selected_services', 'payment_status', 'paid_at',
        'fee_type', 'unit_price', 'quantity', 'calculated_total',
        'offered_by_id', 'fee_agreed_at', 'negotiation_count',
        'verification_notes', 'payment_proof_path', 'is_recommended',
        'proposed_termins', 'proposed_milestones'
    ];

    protected $casts = [
        'selected_services' => 'array',
        'proposed_termins' => 'array',
        'proposed_milestones' => 'array',
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

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class, 'notaris_id');
    }
}
