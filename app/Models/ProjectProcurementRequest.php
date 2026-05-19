<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectProcurementRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'requirement_id',
        'requested_by',
        'quantity_needed',
        'estimated_unit_cost',
        'estimated_cost',
        'message',
        'offer_to_buy',
        'status',
        'pm_note',
    ];

    protected $casts = [
        'quantity_needed' => 'decimal:2',
        'estimated_unit_cost' => 'decimal:2',
        'estimated_cost' => 'decimal:2',
        'offer_to_buy' => 'boolean',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function requirement()
    {
        return $this->belongsTo(ProjectRequirement::class, 'requirement_id');
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function addendums()
    {
        return $this->hasMany(ProjectAddendum::class, 'procurement_request_id');
    }
}
