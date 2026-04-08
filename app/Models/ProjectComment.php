<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectComment extends Model
{
    protected $fillable = ['project_id', 'user_id', 'message', 'parent_id'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function parent()
    {
        return $this->belongsTo(ProjectComment::class, 'parent_id');
    }

    public function replies()
    {
        return $this->hasMany(ProjectComment::class, 'parent_id');
    }
}
