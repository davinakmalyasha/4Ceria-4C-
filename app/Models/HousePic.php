<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HousePic extends Model
{
    protected $table = 'house_pic';

    protected $fillable = [
        'file_name',
        'dir',
        'size',
        'id_house',
    ];

    public function house()
    {
        return $this->belongsTo(House::class, 'id_house');
    }
}
