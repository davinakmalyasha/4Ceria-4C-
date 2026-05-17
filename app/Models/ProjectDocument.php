<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectDocument extends Model
{
    protected $fillable = [
        'project_id', 'uploader_id', 'parent_id', 'version', 'file_name', 'file_path', 'file_type', 
        'category', 'status', 'target_role', 'version_label',
        'review_note', 'reviewed_at'
    ];

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploader_id');
    }

    public function parent()
    {
        return $this->belongsTo(ProjectDocument::class, 'parent_id');
    }

    public function revisions()
    {
        return $this->hasMany(ProjectDocument::class, 'parent_id')->orderBy('version', 'asc');
    }
}
