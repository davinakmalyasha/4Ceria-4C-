<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;

class StorageFallbackController extends Controller
{
    /**
     * Intercept storage requests that fail to resolve on the web server level.
     * Redirects to S3 pre-signed URLs in production or serves local files in dev.
     */
    public function handle($path)
    {
        // Security check: prevent directory traversal
        if (str_contains($path, '..')) {
            abort(404);
        }

        $disk = Storage::disk('public');

        if (!$disk->exists($path)) {
            abort(404);
        }

        // If using S3-compatible cloud storage, redirect to a pre-signed URL
        if (config('filesystems.disks.public.driver') === 's3') {
            try {
                $temporaryUrl = $disk->temporaryUrl($path, now()->addHour());
                return redirect()->away($temporaryUrl);
            } catch (\Exception $e) {
                // Fallback in case of driver misconfiguration
                abort(404, 'Cloud storage error.');
            }
        }

        // Otherwise (local development), serve the local file directly if it exists
        return response()->file($disk->path($path));
    }
}
