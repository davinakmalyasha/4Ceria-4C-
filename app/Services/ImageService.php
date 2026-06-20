<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class ImageService
{
    /**
     * Resize image if it exceeds max dimensions to optimize file size.
     * Keeps transparency intact.
     */
    private static function resizeImageIfNeeded($image, int $maxDimension = 1200)
    {
        $width = imagesx($image);
        $height = imagesy($image);

        if ($width > $maxDimension || $height > $maxDimension) {
            if ($width > $height) {
                $newWidth = $maxDimension;
                $newHeight = (int) ($height * ($maxDimension / $width));
            } else {
                $newHeight = $maxDimension;
                $newWidth = (int) ($width * ($maxDimension / $height));
            }

            $newImage = imagecreatetruecolor($newWidth, $newHeight);
            
            // Keep transparency for PNG/WebP/GIF
            imagealphablending($newImage, false);
            imagesavealpha($newImage, true);
            
            imagecopyresampled($newImage, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
            imagedestroy($image);
            return $newImage;
        }

        return $image;
    }

    /**
     * Convert an uploaded image to AVIF/WebP format reactively, keeping transparency intact and resizing.
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
            // Resize to 1200px max width/height to save bandwidth
            $image = self::resizeImageIfNeeded($image, 1200);

            $isAvifSupported = function_exists('imageavif');
            $extension = $isAvifSupported ? 'avif' : 'webp';
            $filename = uniqid('img_') . '_' . time() . '.' . $extension;
            $localTempPath = tempnam(sys_get_temp_dir(), 'img_');
            
            $saved = false;
            if ($isAvifSupported) {
                // AVIF quality is generally 30-50 (40 is equivalent to 80 in webp)
                $saved = @imageavif($image, $localTempPath, 40);
            }

            if (!$saved) {
                $saved = @imagewebp($image, $localTempPath, $quality);
                $extension = 'webp';
                $filename = uniqid('img_') . '_' . time() . '.webp';
            }

            if ($saved) {
                imagedestroy($image);
                $targetPath = $directory . '/' . $filename;
                
                // Upload to the public disk (local or Supabase/S3)
                Storage::disk('public')->put($targetPath, file_get_contents($localTempPath));
                
                // Delete local temp file
                @unlink($localTempPath);
                
                return $targetPath;
            }
            imagedestroy($image);
        }

        // GD Fallback: save original if conversion fails
        return $file->store($directory, 'public');
    }

    /**
     * Convert an image file path to AVIF/WebP format, keeping transparency intact and resizing.
     *
     * @param string $tempPath
     * @param string $directory
     * @param int $quality
     * @return string|null
     */
    public static function convertPathToWebp(string $tempPath, string $directory, int $quality = 80): ?string
    {
        $mime = mime_content_type($tempPath);
        $image = null;

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

        if (!$image) {
            $content = file_get_contents($tempPath);
            $image = @imagecreatefromstring($content);
        }

        if ($image) {
            // Resize to 1200px max width/height to save bandwidth
            $image = self::resizeImageIfNeeded($image, 1200);

            $isAvifSupported = function_exists('imageavif');
            $extension = $isAvifSupported ? 'avif' : 'webp';
            $filename = uniqid('img_') . '_' . time() . '.' . $extension;
            $localTempPath = tempnam(sys_get_temp_dir(), 'img_');
            
            $saved = false;
            if ($isAvifSupported) {
                $saved = @imageavif($image, $localTempPath, 40);
            }

            if (!$saved) {
                $saved = @imagewebp($image, $localTempPath, $quality);
                $extension = 'webp';
                $filename = uniqid('img_') . '_' . time() . '.webp';
            }

            if ($saved) {
                imagedestroy($image);
                $targetPath = $directory . '/' . $filename;
                Storage::disk('public')->put($targetPath, file_get_contents($localTempPath));
                @unlink($localTempPath);
                return $targetPath;
            }
            imagedestroy($image);
        }

        return null;
    }
}
