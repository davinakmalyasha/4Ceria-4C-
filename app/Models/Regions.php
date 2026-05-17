<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Regions extends Model
{
    protected $table = 'regions';

    protected $fillable = [
        'name',
        'id_province',
    ];

    public $timestamps = false;

    public function Provinces()
    {
        return $this->belongsTo(Provinces::class, 'id_provinces');
    }
}
