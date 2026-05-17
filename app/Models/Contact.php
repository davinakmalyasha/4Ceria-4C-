<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    protected $table = 'contact';

    protected $fillable = [
        'name',
        'url',
        'banner_dir',
        'size',
    ];

    public $timestamps = false;

    public function PhoneNumber()
    {
        return $this->hasMany(PhoneNumber::class, 'id_contact');
    }
}
