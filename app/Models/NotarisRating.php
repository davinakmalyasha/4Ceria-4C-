<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class NotarisRating extends Model
{
    use HasFactory;

    protected $table = 'notaris_ratings';

    protected $fillable = [
        'project_id',
        'reviewer_id',
        'notaris_id',
        'rating',
        'komentar',
    ];

    protected static function boot()
    {
        parent::boot();

        static::saved(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("notaris:{$rating->notaris_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("notaris:{$rating->notaris_id}:review_count");
            \App\Traits\ClearsProfessionalCache::clearProfessionalCache();
        });

        static::deleted(function ($rating) {
            \Illuminate\Support\Facades\Cache::forget("notaris:{$rating->notaris_id}:avg_rating");
            \Illuminate\Support\Facades\Cache::forget("notaris:{$rating->notaris_id}:review_count");
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

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class, 'notaris_id');
    }
}
