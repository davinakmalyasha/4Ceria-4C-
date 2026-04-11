<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class NotarisProfile extends Model
{
    use HasFactory;

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
}
