<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KontraktorRating extends Model
{
    protected $fillable = [
        'user_id', 'kontraktor_id', 'project_id', 'rating', 'komentar'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class, 'kontraktor_id');
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
