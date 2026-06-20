<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KontraktorRating extends Model
{
    protected $fillable = [
        'user_id', 'kontraktor_id', 'project_id', 'rating', 'komentar',
    ];

    protected static function boot()
    {
        parent::boot();

        static::saved(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("kontraktor:{$rating->kontraktor_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("kontraktor:{$rating->kontraktor_id}:review_count");
            \App\Traits\ClearsProfessionalCache::clearProfessionalCache();
        });

        static::deleted(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("kontraktor:{$rating->kontraktor_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("kontraktor:{$rating->kontraktor_id}:review_count");
            \App\Traits\ClearsProfessionalCache::clearProfessionalCache();
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class, 'kontraktor_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
