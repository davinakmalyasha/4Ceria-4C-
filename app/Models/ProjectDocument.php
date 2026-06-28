<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectDocument extends Model
{
    protected $fillable = [
        'project_id', 'uploader_id', 'parent_id', 'version', 'file_name', 'description', 'file_path', 'file_type', 
        'category', 'status', 'target_role', 'version_label',
        'review_note', 'reviewed_at'
    ];

    protected $appends = ['file_url'];

    public function getFileUrlAttribute()
    {
        if (empty($this->file_path)) {
            return null;
        }

        // Check if the path points to supabase stored items
        if (str_starts_with($this->file_path, 'contracts/') || str_starts_with($this->file_path, 'verifications/') || $this->category === 'spk') {
            if (\Illuminate\Support\Facades\Storage::disk('supabase')->exists($this->file_path)) {
                return \Illuminate\Support\Facades\Storage::disk('supabase')->temporaryUrl($this->file_path, now()->addMinutes(15));
            }
        }

        if (str_starts_with($this->file_path, 'http://') || str_starts_with($this->file_path, 'https://')) {
            return $this->file_path;
        }

        try {
            return \Illuminate\Support\Facades\Storage::disk('public')->temporaryUrl($this->file_path, now()->addHours(24));
        } catch (\Throwable $e) {
            return \Illuminate\Support\Facades\Storage::disk('public')->url($this->file_path);
        }
    }

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
