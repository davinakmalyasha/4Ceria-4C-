<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Provinces extends Model
{
    protected $table = 'provinces';

    protected $fillable = ['name'];

    public $timestamps = false;

    public function Regions()
    {
        return $this->hasMany(Regions::class, 'id_province');
    }
}
