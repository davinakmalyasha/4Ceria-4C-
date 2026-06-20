<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\ClearsProfessionalCache;

class Arsitek extends Model
{
    use HasFactory, ClearsProfessionalCache;

    protected $table = 'arsiteks';

    protected $fillable = [
        'user_id',
        'nama',
        'no_telp',
        'rate_harga',
        'spesialisasi',
        'deskripsi',
        'lokasi',
        'pengalaman_tahun',
        'file_portofolio',
        'file_sertifikat',
        'pendidikan',
        'alasan_hire',
        'verification_status',
        'rejection_reason',
        'foto',
        'reliability_score',
        'entity_type',
        'company_name',
        'company_license',
        'identity_number',
        'npwp_number',
        'siup_number',
        'npwp',
        'siup',
    ];

    protected $appends = ['average_rating', 'review_count'];

    public function getAverageRatingAttribute()
    {
        if (isset($this->attributes['average_rating'])) {
            return round((float)$this->attributes['average_rating'], 1);
        }
        if (isset($this->attributes['ratings_avg_rating'])) {
            return round((float)$this->attributes['ratings_avg_rating'], 1);
        }
        if ($this->relationLoaded('ratings')) {
            return round($this->ratings->avg('rating') ?: 0, 1);
        }
        return \Illuminate\Support\Facades\Cache::remember("arsitek:{$this->id}:avg_rating", 3600, function() {
            return round($this->ratings()->avg('rating') ?: 0, 1);
        });
    }

    public function getReviewCountAttribute()
    {
        if (isset($this->attributes['review_count'])) {
            return (int)$this->attributes['review_count'];
        }
        if (isset($this->attributes['ratings_count'])) {
            return (int)$this->attributes['ratings_count'];
        }
        if ($this->relationLoaded('ratings')) {
            return $this->ratings->count();
        }
        return \Illuminate\Support\Facades\Cache::remember("arsitek:{$this->id}:review_count", 3600, function() {
            return $this->ratings()->count();
        });
    }

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
