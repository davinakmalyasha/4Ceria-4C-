<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectManager extends Model
{
    use HasFactory;

    protected $table = 'project_managers';

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
        return $this->belongsTo(User::class, 'user_id');
    }

    public function ratings()
    {
        return $this->hasMany(PMRating::class, 'pm_id');
    }

    public function bids()
    {
        return $this->hasMany(BidProjectManager::class, 'pm_id');
    }

    public function projects()
    {
        return $this->hasMany(Project::class, 'pm_id', 'user_id');
    }
}
