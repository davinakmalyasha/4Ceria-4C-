<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectMilestone extends Model
{
    // Regulatory Type Constants
    public const TYPE_LEGAL_SPK = 'legal_spk';
    public const TYPE_LEGAL_PBG = 'legal_pbg';
    public const TYPE_LEGAL_AS_BUILT = 'legal_as_built';
    public const TYPE_LEGAL_SLF = 'legal_slf';
    public const TYPE_TECHNICAL_DRAWING = 'tech_drawing';
    public const TYPE_CONSTRUCTION_PROGRESS = 'cons_progress';

    protected $fillable = [
        'project_id',
        'arsitek_id',
        'kontraktor_id',
        'notaris_id',
        'interior_id',
        'pm_id',
        'structural_id',
        'mep_id',
        'title',
        'type',
        'content',
        'description',
        'image',
        'sort_order',
        'start_date',
        'due_date',
        'is_completed',
        'approval_status',
        'revision_notes',
        'phase_context',
        'pm_verified_at',
        'lead_pro_verified_at',
        'review_note',
        'review_status',
    ];

    protected $casts = [
        'is_completed' => 'boolean',
        'start_date' => 'date',
        'due_date' => 'date',
        'content' => 'array',
    ];

    /**
     * Get validated gallery files from the content array.
     */
    public function getApprovedFiles(): array
    {
        $content = $this->content ?? [];
        if (!is_array($content) || !isset($content['gallery'])) {
            return [];
        }
        return array_filter($content['gallery'], fn($f) => is_string($f) && !empty($f));
    }

    /**
     * Get resolved absolute URLs for gallery files.
     */
    public function getGalleryUrlsAttribute(): array
    {
        $files = $this->getApprovedFiles();
        $urls = [];
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        
        foreach ($files as $path) {
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
        if (isset($array['content']) && is_array($array['content']) && isset($array['content']['gallery'])) {
            $array['content']['gallery'] = $this->gallery_urls;
        }
        return $array;
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function arsitek()
    {
        return $this->belongsTo(Arsitek::class);
    }

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class);
    }

    public function pm()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id');
    }

    public function structural()
    {
        return $this->belongsTo(StructuralEngineer::class, 'structural_id');
    }

    public function mep()
    {
        return $this->belongsTo(MepEngineer::class, 'mep_id');
    }

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class, 'notaris_id');
    }

    public function interior()
    {
        return $this->belongsTo(InteriorProfile::class, 'interior_id');
    }

    public function linkedTermin()
    {
        return $this->hasOne(ProjectPaymentTermin::class, 'milestone_id');
    }

    public function changeOrders()
    {
        return $this->hasMany(ProjectChangeOrder::class, 'milestone_id');
    }
}
