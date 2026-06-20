<?php

namespace App\Traits;

use Illuminate\Support\Facades\Cache;

trait ClearsProfessionalCache
{
    public static function bootClearsProfessionalCache()
    {
        static::saved(function () {
            self::clearProfessionalCache();
        });

        static::deleted(function () {
            self::clearProfessionalCache();
        });
    }

    public static function clearProfessionalCache(): void
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        if ($supportsTags) {
            Cache::tags(['professionals'])->flush();
        } else {
            $keys = [
                'api_arsitek_list',
                'api_kontraktor_list',
                'api_interior_list',
                'api_notaris_list',
                'api_project_manager_list',
                'api_structural_list',
                'api_mep_list',
            ];
            foreach ($keys as $key) {
                Cache::forget($key);
            }
        }
    }
}
