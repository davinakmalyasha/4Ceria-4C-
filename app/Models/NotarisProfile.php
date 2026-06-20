<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\ClearsProfessionalCache;

class NotarisProfile extends Model
{
    use HasFactory, ClearsProfessionalCache;

    protected $table = 'notaris_profiles';

    protected $fillable = [
        'user_id',
        'nama',
        'no_telp',
        'foto',
        'nomor_sk',
        'wilayah_kerja',
        'spesialisasi',
        'deskripsi',
        'lokasi',
        'pengalaman_tahun',
        'rate_harga',
        'file_sertifikat',
        'verification_status',
        'rejection_reason',
        'reliability_score',
        'entity_type',
        'company_name',
        'company_license',
        'identity_number',
        'npwp_number',
        'siup_number',
        'file_portofolio',
        'npwp',
        'siup',
    ];

    protected $appends = ['average_rating', 'review_count', 'is_verified'];

    public function getIsVerifiedAttribute(): bool
    {
        return $this->verification_status === 'verified';
    }

    public function getAverageRatingAttribute(): float
    {
        if (isset($this->attributes['average_rating'])) {
            return (float) round((float)$this->attributes['average_rating'], 1);
        }
        if (isset($this->attributes['ratings_avg_rating'])) {
            return (float) round((float)$this->attributes['ratings_avg_rating'], 1);
        }
        if ($this->relationLoaded('ratings')) {
            return (float) round($this->ratings->avg('rating') ?: 0, 1);
        }
        return (float) \Illuminate\Support\Facades\Cache::remember("notaris:{$this->id}:avg_rating", 3600, function() {
            return round($this->ratings()->avg('rating') ?: 0, 1);
        });
    }

    public function getReviewCountAttribute(): int
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
        return (int) \Illuminate\Support\Facades\Cache::remember("notaris:{$this->id}:review_count", 3600, function() {
            return $this->ratings()->count();
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function ratings()
    {
        return $this->hasMany(NotarisRating::class, 'notaris_id');
    }

    public function projects()
    {
        return $this->hasMany(Project::class, 'selected_notaris_id');
    }

    public function bids()
    {
        return $this->hasMany(BidNotaris::class, 'notaris_id');
    }

    public function services()
    {
        return $this->hasMany(NotarisService::class, 'notaris_id');
    }

    public function consultations()
    {
        return $this->hasMany(NotarisConsultation::class, 'notaris_id');
    }
}
