<?php

namespace App\Models;

use App\Support\TaggedCache;

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
        TaggedCache::flush('houses');


            }
        });

        static::deleted(function ($room) {
            $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
            if ($supportsTags) {
        TaggedCache::flush('houses');


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
