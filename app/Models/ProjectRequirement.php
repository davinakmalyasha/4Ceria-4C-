<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectRequirement extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'name',
        'quantity_required',
        'quantity_on_site',
        'quantity_used',
        'unit',
        'notes',
    ];

    protected $casts = [
        'quantity_required' => 'decimal:2',
        'quantity_on_site' => 'decimal:2',
        'quantity_used' => 'decimal:2',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function orderItems()
    {
        return $this->hasMany(MaterialOrderItem::class, 'requirement_id');
    }
}
