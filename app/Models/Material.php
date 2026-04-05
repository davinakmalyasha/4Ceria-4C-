<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Material extends Model
{
    use HasFactory;

    protected $fillable = [
        'supplier_id',
        'name',
        'description',
        'price',
        'unit',
        'category',
        'stock',
        'is_available',
        'image_path',
        'specifications',
    ];

    protected $casts = [
        'specifications' => 'array',
        'is_available' => 'boolean',
        'price' => 'decimal:2',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function images()
    {
        return $this->hasMany(MaterialImage::class);
    }
}
