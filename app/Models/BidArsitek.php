<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BidArsitek extends Model
{
    protected $table = 'bids_arsitek';
    use HasFactory;

    protected $fillable = [
        'project_id', 'arsitek_id', 'price', 'proposal', 'status', 
        'estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3'
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function arsitek()
{
    return $this->belongsTo(Arsitek::class, 'arsitek_id', 'id');
}

}
