<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotarisService extends Model
{
    protected $fillable = ['notaris_id', 'title', 'price', 'description'];

    /** Money is a fixed-point string, never a float — see App\Support\Money. */
    protected $casts = [
        'price' => 'decimal:2',
    ];

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class);
    }
}
