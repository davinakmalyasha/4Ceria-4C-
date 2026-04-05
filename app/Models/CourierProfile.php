<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourierProfile extends Model
{
    protected $fillable = ['user_id', 'vehicle_type', 'license_plate', 'is_active'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
