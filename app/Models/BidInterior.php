<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BidInterior extends Model
{
    use HasFactory;

    protected $table = 'bids_interior';

    protected $fillable = [
        'project_id',
        'interior_id',
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

    public function interior()
    {
        return $this->belongsTo(InteriorProfile::class, 'interior_id');
    }
}
