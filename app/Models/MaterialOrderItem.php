<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MaterialOrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id',
        'material_id',
        'requirement_id',
        'quantity',
        'price_at_order',
    ];

    protected $casts = [
        'price_at_order' => 'decimal:2',
    ];

    public function order()
    {
        return $this->belongsTo(MaterialOrder::class, 'order_id');
    }

    public function material()
    {
        return $this->belongsTo(Material::class);
    }

    public function requirement()
    {
        return $this->belongsTo(ProjectRequirement::class, 'requirement_id');
    }
}
