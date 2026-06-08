<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectSnagItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id', 'title', 'description', 'location',
        'severity', 'photos', 'status', 'assigned_role',
        'reported_by', 'resolved_at', 'resolution_note',
        'resolution_photos',
    ];

    protected $casts = [
        'photos' => 'array',
        'resolved_at' => 'datetime',
        'resolution_photos' => 'array',
    ];

    /**
     * Resolve paths to S3 pre-signed URLs or fallbacks.
     */
    private function resolvePhotoUrls(?array $photos): array
    {
        if (empty($photos)) return [];
        $urls = [];
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        
        foreach ($photos as $path) {
            if (empty($path)) continue;
            if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
                $urls[] = $path;
            } else {
                if (config('filesystems.disks.public.driver') === 's3') {
                    try {
                        $urls[] = $disk->temporaryUrl($path, now()->addHours(24));
                    } catch (\Exception $e) {
                        $urls[] = asset('storage/' . $path);
                    }
                } else {
                    $urls[] = asset('storage/' . $path);
                }
            }
        }
        return $urls;
    }

    /**
     * Convert the model instance to an array.
     */
    public function toArray()
    {
        $array = parent::toArray();
        if (isset($array['photos']) && is_array($array['photos'])) {
            $array['photos'] = $this->resolvePhotoUrls($array['photos']);
        }
        if (isset($array['resolution_photos']) && is_array($array['resolution_photos'])) {
            $array['resolution_photos'] = $this->resolvePhotoUrls($array['resolution_photos']);
        }
        return $array;
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function reporter()
    {
        return $this->belongsTo(User::class, 'reported_by');
    }
}
