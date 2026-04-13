<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotarisConsultation extends Model
{
    protected $fillable = ['notaris_id', 'user_id', 'schedule_date', 'status', 'notes'];

    protected $casts = [
        'schedule_date' => 'datetime',
    ];

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
