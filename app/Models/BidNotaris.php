<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BidNotaris extends Model
{
    use HasFactory;

    protected $table = 'bids_notaris';

    protected $fillable = [
        'project_id',
        'notaris_id',
        'price',
        'proposal',
        'status',
        'estimated_duration',
        'duration_unit',
        'attachment_1',
        'attachment_2',
        'attachment_3',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class, 'notaris_id');
    }
}
