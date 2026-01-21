<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BidKontraktor extends Model
{
    protected $table = 'bids_kontraktor';
    use HasFactory;

    protected $fillable = [
        'project_id', 'kontraktor_id', 'price', 'proposal', 'status'
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class, 'kontraktor_id');
    }
}
