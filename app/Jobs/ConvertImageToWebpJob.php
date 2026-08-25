<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use App\Services\ImageService;

class ConvertImageToWebpJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $tempPath;
    protected $directory;
    protected $modelClass;
    protected $modelId;
    protected $attribute;

    /**
     * Disk the source image lives on ('local' temp upload or 'public'
     * already-stored original awaiting async conversion).
     */
    protected $sourceDisk;

    /**
     * Create a new job instance.
     */
    public function __construct(string $tempPath, string $directory, string $modelClass, int $modelId, string $attribute, string $sourceDisk = 'local')
    {
        $this->tempPath = $tempPath;
        $this->directory = $directory;
        $this->modelClass = $modelClass;
        $this->modelId = $modelId;
        $this->attribute = $attribute;
        $this->sourceDisk = $sourceDisk;
    }

    /**
     * Execute the job.
     */
    public function handle()
    {
        if ($this->sourceDisk === 'public') {
            $this->handlePublicSource();
            return;
        }

        if (!Storage::disk('local')->exists($this->tempPath)) {
            return;
        }

        $fullPath = Storage::disk('local')->path($this->tempPath);

        // Convert image using path-based helper
        $path = ImageService::convertPathToWebp($fullPath, $this->directory);

        if ($path) {
            $model = $this->modelClass::find($this->modelId);
            if ($model) {
                // Delete old file if exists
                $oldValue = $model->{$this->attribute};
                if ($oldValue && Storage::disk('public')->exists($oldValue)) {
                    Storage::disk('public')->delete($oldValue);
                }
                $model->update([$this->attribute => $path]);
            }
        }

        // Clean up temp file from local disk
        Storage::disk('local')->delete($this->tempPath);
    }

    /**
     * Source already lives on the public disk (stored synchronously so the
     * UI shows it immediately); convert it and swap the model attribute,
     * deleting the heavyweight original afterwards.
     */
    private function handlePublicSource(): void
    {
        $disk = Storage::disk('public');

        if (!$disk->exists($this->tempPath)) {
            return;
        }

        // GD needs a real local file — pull one down for s3-backed disks.
        if (config('filesystems.disks.public.driver') === 's3') {
            $localTemp = tempnam(sys_get_temp_dir(), 'imgsrc_');
            file_put_contents($localTemp, $disk->get($this->tempPath));
            $fullPath = $localTemp;
        } else {
            $fullPath = $disk->path($this->tempPath);
        }

        try {
            $path = ImageService::convertPathToWebp($fullPath, $this->directory);

            if ($path) {
                $model = $this->modelClass::find($this->modelId);
                if ($model) {
                    $oldValue = $model->{$this->attribute};
                    $model->update([$this->attribute => $path]);

                    if ($oldValue && $oldValue !== $path && $disk->exists($oldValue)) {
                        $disk->delete($oldValue);
                    }
                }
            }
        } finally {
            if (isset($localTemp) && is_file($localTemp)) {
                @unlink($localTemp);
            }
        }
    }
}
