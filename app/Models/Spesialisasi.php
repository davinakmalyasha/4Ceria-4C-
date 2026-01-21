<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Spesialisasi extends Model
{
    protected $table = 'spesialisasi';
    
    use HasFactory;
    protected $fillable = ['nama'];

    public function kontraktors()
    {
        return $this->belongsToMany(Kontraktor::class, 'kontraktor_spesialisasi');
    }
    
}
