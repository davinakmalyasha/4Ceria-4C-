<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class NotarisRating extends Model
{
    use HasFactory;

    protected $table = 'notaris_ratings';

    protected $fillable = [
        'project_id',
        'reviewer_id',
        'notaris_id',
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

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class, 'notaris_id');
    }
}
