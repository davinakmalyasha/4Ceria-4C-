<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotarisService extends Model
{
    protected $fillable = ['notaris_id', 'title', 'price', 'description'];

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class);
    }
}
