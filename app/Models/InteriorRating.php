<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InteriorRating extends Model
{
    use HasFactory;

    protected $table = 'interior_ratings';

    protected $fillable = [
        'project_id',
        'reviewer_id',
        'interior_id',
        'rating',
        'komentar',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function interior()
    {
        return $this->belongsTo(InteriorProfile::class, 'interior_id');
    }
}
