<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PhoneNumber extends Model
{
    protected $table = 'phone_user';

    protected $fillable = [
        'contact',
        'id_user',
        'id_contact',
    ];

    public function User()
    {
        return $this->belongsTo(User::class, 'id_user');
    }

    public $timestamps = false;
}
