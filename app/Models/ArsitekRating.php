<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ArsitekRating extends Model
{
    protected $fillable = [
        'reviewer_id', 'arsitek_id', 'project_id', 'rating', 'komentar',
    ];

    protected static function boot()
    {
        parent::boot();

        static::saved(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("arsitek:{$rating->arsitek_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("arsitek:{$rating->arsitek_id}:review_count");
            \App\Traits\ClearsProfessionalCache::clearProfessionalCache();
        });

        static::deleted(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("arsitek:{$rating->arsitek_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("arsitek:{$rating->arsitek_id}:review_count");
            \App\Traits\ClearsProfessionalCache::clearProfessionalCache();
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function arsitek()
    {
        return $this->belongsTo(Arsitek::class, 'arsitek_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
