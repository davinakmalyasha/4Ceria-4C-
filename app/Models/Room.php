<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Room extends Model
{
    protected $table = 'rooms';

    protected $fillable = [
        'name',
        'type',
        'width',
        'length',
        'desc',
        'id_house',
    ];

    protected static function booted(): void
    {
        static::saved(function ($room) {
            $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
            if ($supportsTags) {
                \Illuminate\Support\Facades\Cache::tags(['houses'])->flush();
            } else {
                \Illuminate\Support\Facades\Cache::flush();
            }
        });

        static::deleted(function ($room) {
            $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
            if ($supportsTags) {
                \Illuminate\Support\Facades\Cache::tags(['houses'])->flush();
            } else {
                \Illuminate\Support\Facades\Cache::flush();
            }
        });
    }

    public function house()
    {
        return $this->belongsTo(House::class, 'id_house');
    }

    public function roomPic()
    {
        return $this->hasMany(RoomPic::class, 'id_room');
    }
}
