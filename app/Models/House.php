<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class House extends Model
{
    protected $table = 'house';

    protected $fillable = [
        'name',
        'price',
        'house_desc',
        'width',
        'length',
        'br',
        'ba',
        'floors',
        'coordinate',
        'street_name',
        'kelurahan',
        'kecamatan',
        'kab_kota',
        'province',
        'postal_code',
        'views',
        'id_user',

    ];

    public $timestamps = true;

    public function room()
    {
        return $this->hasMany(Room::class, 'id_house');
    }

    public function housePic()
    {
        return $this->hasMany(HousePic::class, 'id_house');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'id_user');
    }
}
