<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectRequirement extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'user_id',
        'name',
        'quantity_required',
        'estimated_unit_cost',
        'quantity_procured_externally',
        'external_cost',
        'quantity_on_site',
        'quantity_used',
        'unit',
        'quality_level',
        'notes',
        'purpose',
        'category',
        'image_path',
        'bom_type',
        'folder_id',
    ];

    protected $casts = [
        'quantity_required' => 'decimal:2',
        'estimated_unit_cost' => 'decimal:2',
        'quantity_procured_externally' => 'decimal:2',
        'external_cost' => 'decimal:2',
        'quantity_on_site' => 'decimal:2',
        'quantity_used' => 'decimal:2',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function orderItems()
    {
        return $this->hasMany(MaterialOrderItem::class, 'requirement_id');
    }

    public function procurementRequests()
    {
        return $this->hasMany(ProjectProcurementRequest::class, 'requirement_id');
    }

    public function histories()
    {
        return $this->hasMany(ProjectRequirementHistory::class, 'project_requirement_id');
    }

    public function folder()
    {
        return $this->belongsTo(ProjectMaterialFolder::class, 'folder_id');
    }
}
