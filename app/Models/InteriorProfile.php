<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InteriorProfile extends Model
{
    use HasFactory;

    protected $table = 'interior_profiles';

    protected $fillable = [
        'user_id',
        'nama',
        'no_telp',
        'foto',
        'file_portofolio',
        'file_sertifikat',
        'spesialisasi',
        'deskripsi',
        'lokasi',
        'pengalaman_tahun',
        'rate_harga',
        'verification_status',
        'rejection_reason',
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

    public function getAverageRatingAttribute(): float
    {
        return round($this->ratings()->avg('rating') ?: 0, 1);
    }

    public function getReviewCountAttribute(): int
    {
        return $this->ratings()->count();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function ratings()
    {
        return $this->hasMany(InteriorRating::class, 'interior_id');
    }

    public function projects()
    {
        return $this->hasMany(Project::class, 'selected_interior_id');
    }

    public function bids()
    {
        return $this->hasMany(BidInterior::class, 'interior_id');
    }
}
