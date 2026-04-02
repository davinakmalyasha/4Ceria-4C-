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
        'id_house'
    ];

    public function house(){
        return $this->belongsTo(House::class, 'id_house');
    }
    public function roomPic(){
        return $this->hasMany(RoomPic::class, 'id_room');
    }

}
