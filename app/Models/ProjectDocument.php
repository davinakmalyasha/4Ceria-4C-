<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectDocument extends Model
{
    protected $fillable = ['project_id', 'uploader_id', 'file_name', 'file_path', 'file_type'];

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploader_id');
    }
}
