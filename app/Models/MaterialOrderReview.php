<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MaterialOrderReview extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'supplier_id',
        'order_id',
        'rating',
        'comment',
        'delivery_rating',
        'delivery_comment',
        'delivery_user_id',
        'image_paths',
        'delivery_image_paths',
    ];

    protected $casts = [
        'image_paths' => 'array',
        'delivery_image_paths' => 'array',
    ];

    protected static function booted(): void
    {
        static::saved(function ($review) {
            $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
            if ($supportsTags) {
                \Illuminate\Support\Facades\Cache::tags(['suppliers'])->flush();
            } else {
                \Illuminate\Support\Facades\Cache::flush();
            }
        });

        static::deleted(function ($review) {
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

    public function deliveryUser()
    {
        return $this->belongsTo(User::class, 'delivery_user_id');
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function order()
    {
        return $this->belongsTo(MaterialOrder::class, 'order_id');
    }
}
