<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BidStructural extends Model
{
    protected $table = 'bids_structural';

    use HasFactory;

    protected $fillable = [
        'project_id', 'structural_id', 'price', 'fee_type', 'unit_price', 'quantity', 'calculated_total',
        'proposal', 'status', 'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3',
        'scopes', 'deliverables', 'payment_status', 'paid_at'
    ];

    protected $casts = [
        'scopes' => 'array',
        'deliverables' => 'array',
        'paid_at' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function structuralEngineer()
    {
        return $this->belongsTo(StructuralEngineer::class, 'structural_id');
    }
}
