<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MaterialOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'supplier_id',
        'project_id',
        'status',
        'total_price',
        'shipping_cost',
        'whatsapp_order_id',
        'delivery_method',
        'payment_proof_path',
        'notes',
        'paid_at',
        'ready_for_pickup_at',
        'shipped_at',
        'delivered_at',
        'completed_at',
        'latitude',
        'longitude',
        'delivery_address',
        'address_detail',
        'delivery_documentation_path',
        'is_stock_decremented',
        'total_weight',
    ];

    protected $casts = [
        'total_price' => 'decimal:2',
        'shipping_cost' => 'decimal:2',
        'paid_at' => 'datetime',
        'ready_for_pickup_at' => 'datetime',
        'shipped_at' => 'datetime',
        'delivered_at' => 'datetime',
        'completed_at' => 'datetime',
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

    public function items()
    {
        return $this->hasMany(MaterialOrderItem::class, 'order_id');
    }
    
    public function review()
    {
        return $this->hasOne(MaterialOrderReview::class, 'order_id');
    }

    public function deliveryJob()
    {
        return $this->hasOne(DeliveryJob::class, 'order_id');
    }
}
