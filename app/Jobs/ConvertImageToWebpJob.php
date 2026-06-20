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
     * Create a new job instance.
     */
    public function __construct(string $tempPath, string $directory, string $modelClass, int $modelId, string $attribute)
    {
        $this->tempPath = $tempPath;
        $this->directory = $directory;
        $this->modelClass = $modelClass;
        $this->modelId = $modelId;
        $this->attribute = $attribute;
    }

    /**
     * Execute the job.
     */
    public function handle()
    {
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
}
