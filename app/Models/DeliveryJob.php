<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DeliveryJob extends Model
{
    use HasFactory;

    protected $fillable = [
        'quote_id',
        'order_id',
        'logistics_id',
        'pickup_address',
        'dropoff_address',
        'status',
        'agreed_fee',
        'estimated_weight',
        'pickup_photos',
        'delivery_photos',
    ];

    protected $casts = [
        'pickup_photos' => 'array',
        'delivery_photos' => 'array',
        'agreed_fee' => 'decimal:2',
    ];

    public function quote()
    {
        return $this->belongsTo(MaterialQuote::class, 'quote_id');
    }

    public function order()
    {
        return $this->belongsTo(MaterialOrder::class, 'order_id');
    }

    public function logistics()
    {
        return $this->belongsTo(User::class, 'logistics_id');
    }
}
