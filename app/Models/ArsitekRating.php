<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ArsitekRating extends Model
{
    protected $fillable = [
        'user_id', 'arsitek_id', 'project_id', 'rating', 'komentar'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

   public function arsitek()
{
    return $this->belongsTo(Arsitek::class, 'arsitek_id');
}

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
