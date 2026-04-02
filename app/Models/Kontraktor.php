<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Kontraktor extends Model
{
    use HasFactory;

    protected $table = 'kontraktors'; 

    protected $fillable = [
         'user_id', 'nama', 'no_telepon', 'alamat', 'jenis', 'nama_perusahaan', 'npwp', 'siup', 'pengalaman', 'spesialisasi', 'rate_harga', 'pendidikan', 'alasan_hire', 'verification_status', 'rejection_reason', 'foto'
    ];

    protected $appends = ['average_rating', 'review_count'];

    public function getAverageRatingAttribute()
    {
        return round($this->ratings()->avg('rating') ?: 0, 1);
    }

    public function getReviewCountAttribute()
    {
        return $this->ratings()->count();
    }

    
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }
    public function spesialisasis()
{
    return $this->belongsToMany(Spesialisasi::class, 'kontraktor_spesialisasi', 'kontraktor_id', 'spesialisasi_id');
}

    public function pengajuanSpesialisasi()
{
    return $this->hasMany(PengajuanSpesialisasi::class);
}
public function riwayatProjects()
{
    return $this->hasMany(RiwayatProject::class);
}
public function ratings()
{
    return $this->hasMany(KontraktorRating::class, 'kontraktor_id', 'id');
}

public function projects()
{
    return $this->hasMany(Project::class, 'selected_kontraktor_id', 'id');
}


}
