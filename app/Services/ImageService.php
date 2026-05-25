<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class ImageService
{
    /**
     * Convert an uploaded image to WebP format reactively, keeping transparency intact.
     * Fallbacks to standard storage if conversion fails.
     *
     * @param UploadedFile $file
     * @param string $directory
     * @param int $quality
     * @return string
     */
    public static function convertToWebp(UploadedFile $file, string $directory, int $quality = 80): string
    {
        $tempPath = $file->getRealPath();
        $mime = $file->getMimeType();
        $image = null;

        // Load image based on mime type
        if ($mime === 'image/jpeg' || $mime === 'image/jpg') {
            $image = @imagecreatefromjpeg($tempPath);
        } elseif ($mime === 'image/png') {
            $image = @imagecreatefrompng($tempPath);
            if ($image) {
                imagepalettetotruecolor($image);
                imagealphablending($image, true);
                imagesavealpha($image, true);
            }
        } elseif ($mime === 'image/gif') {
            $image = @imagecreatefromgif($tempPath);
        } elseif ($mime === 'image/webp') {
            $image = @imagecreatefromwebp($tempPath);
        }

        // Fallback to load from string if mime check is inconclusive
        if (!$image) {
            $content = file_get_contents($tempPath);
            $image = @imagecreatefromstring($content);
        }

        if ($image) {
            $filename = uniqid('img_') . '_' . time() . '.webp';
            $storageDir = storage_path('app/public/' . $directory);

            if (!file_exists($storageDir)) {
                mkdir($storageDir, 0755, true);
            }

            $targetPath = $storageDir . '/' . $filename;
            
            // Save as WebP
            if (imagewebp($image, $targetPath, $quality)) {
                imagedestroy($image);
                return $directory . '/' . $filename;
            }
            imagedestroy($image);
        }

        // GD Fallback: save original if conversion fails
        return $file->store($directory, 'public');
    }
}
