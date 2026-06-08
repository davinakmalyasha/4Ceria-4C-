<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectDailyLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'user_id',
        'log_date',
        'weather',
        'worker_count',
        'activities',
        'issues',
        'photos',
    ];

    protected $casts = [
        'photos' => 'array',
        'log_date' => 'date',
    ];

    /**
     * Get resolved absolute URLs for daily log photos.
     */
    public function getPhotoUrlsAttribute(): array
    {
        $photos = $this->photos ?? [];
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
            $array['photos'] = $this->photo_urls;
        }
        return $array;
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
