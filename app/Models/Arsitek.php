<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;


class Arsitek extends Model
{
    use HasFactory;

    protected $table = 'arsiteks'; 

    protected $fillable = [
         'user_id', 'nama', 'no_telp', 'rate_harga', 'spesialisasi', 'deskripsi', 'lokasi', 'pengalaman_tahun',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
    
    public function riwayatProjects()
{
    return $this->hasMany(RiwayatProject::class);
}
public function ratings()
{
    return $this->hasMany(ArsitekRating::class, 'arsitek_id');
}

public function projects()
{
    return $this->hasMany(Project::class, 'selected_arsitek_id');
}


}
