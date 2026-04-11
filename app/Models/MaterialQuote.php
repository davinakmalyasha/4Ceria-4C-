<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaterialQuote extends Model
{
    use \Illuminate\Database\Eloquent\Factories\HasFactory;

    protected $fillable = [
        'user_id', 
        'supplier_id', 
        'project_id', 
        'items', 
        'delivery_address', 
        'total_amount', 
        'shipping_cost',
        'delivery_method',
        'status', 
        'note',
        'latitude',
        'longitude',
        'address_detail',
        'total_weight'
    ];

    protected $casts = [
        'items' => 'array',
        'total_amount' => 'decimal:2',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
