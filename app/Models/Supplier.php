<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Supplier extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'store_name',
        'address',
        'detail_location',
        'latitude',
        'longitude',
        'no_telp',
        'category',
        'bio',
        'verification_status',
        'rejection_reason',
        'foto',
    ];

    protected static function booted(): void
    {
        static::saved(function ($supplier) {
            $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
            if ($supportsTags) {
                \Illuminate\Support\Facades\Cache::tags(['suppliers'])->flush();
            } else {
                \Illuminate\Support\Facades\Cache::flush();
            }
        });

        static::deleted(function ($supplier) {
            $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
            if ($supportsTags) {
                \Illuminate\Support\Facades\Cache::tags(['suppliers'])->flush();
            } else {
                \Illuminate\Support\Facades\Cache::flush();
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function materials()
    {
        return $this->hasMany(Material::class);
    }

    public function reviews()
    {
        return $this->hasMany(MaterialOrderReview::class);
    }
}
