<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoomPic extends Model
{
    protected $table = 'rooms_pic';

    protected $fillable = [
        'file_name',
        'dir',
        'size',
        'id_room',
    ];

    public function room()
    {
        return $this->belongsTo(Room::class, 'id_room');
    }
}
