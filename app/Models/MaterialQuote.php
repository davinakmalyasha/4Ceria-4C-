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
   'total_weight',
   'payment_proof_path',
   'paid_at',
   'payment_verified_by',
   'payment_verified_at',
   'payment_notes',
   ];
   
protected $casts = [
   'latitude' => 'float',
   'longitude' => 'float',
   'total_weight' => 'decimal:2',
   'shipping_cost' => 'decimal:2',
   'items' => 'array',
   'total_amount' => 'decimal:2',
   'paid_at' => 'datetime',
   'payment_verified_at' => 'datetime',
   'payment_verified_by' => 'integer',
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
