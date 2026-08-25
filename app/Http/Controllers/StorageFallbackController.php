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
        // Security checks: prevent directory traversal and null-byte injection
        if (str_contains($path, '..') || str_contains($path, "\0")) {
            abort(404);
        }

        // SECURITY: certificates/* and kyc/* live on the PRIVATE railway disk
        // and are only ever viewed by their owner or an admin via
        // SecureVerificationDocumentController (authorized 5-minute presigns).
        // The previous anonymous fallback presign branch for portfolios/* was
        // removed: file_portofolio is KYC-grade (several flows store the KTP
        // scan / NPWP there), so no prefix of the private bucket is publicly
        // presigned anymore.

        try {
            $disk = Storage::disk('public');

            if (config('filesystems.disks.public.driver') === 's3') {
                // If using S3-compatible cloud storage, redirect straight to a
                // pre-signed URL (no existence HEAD — same net result, 1 less RTT).
                $temporaryUrl = $disk->temporaryUrl($path, now()->addHour());
                return redirect()->away($temporaryUrl);
            }

            // Otherwise (local development), serve the local file directly if it exists
            if (!$disk->exists($path)) {
                abort(404);
            }

            return response()->file($disk->path($path));
        } catch (\Exception $e) {
            abort(404, 'File not found or storage error.');
        }
    }
}
