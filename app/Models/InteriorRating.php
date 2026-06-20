<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InteriorRating extends Model
{
    use HasFactory;

    protected $table = 'interior_ratings';

    protected $fillable = [
        'project_id',
        'reviewer_id',
        'interior_id',
        'rating',
        'komentar',
    ];

    protected static function boot()
    {
        parent::boot();

        static::saved(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("interior:{$rating->interior_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("interior:{$rating->interior_id}:review_count");
            \App\Traits\ClearsProfessionalCache::clearProfessionalCache();
        });

        static::deleted(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("interior:{$rating->interior_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("interior:{$rating->interior_id}:review_count");
            \App\Traits\ClearsProfessionalCache::clearProfessionalCache();
        });
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function interior()
    {
        return $this->belongsTo(InteriorProfile::class, 'interior_id');
    }
}
