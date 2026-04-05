<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MaterialImage extends Model
{
    use HasFactory;

    protected $fillable = [
        'material_id',
        'image_path',
    ];

    public function material()
    {
        return $this->belongsTo(Material::class);
    }
}
