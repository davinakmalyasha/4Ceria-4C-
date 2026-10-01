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

    /**
     * The non-tagging fallback keys.
     *
     * Shared so every caller's fallback forgets exactly the same list. The
     * directory cache key now includes the page and page size, so a bare
     * `Cache::forget('api_arsitek_list')` no longer evicts anything -- which is
     * exactly why this list has to be derived rather than hard-coded at each site.
     *
     * @return list<string>
     */
    public static function professionalCacheKeys(): array
    {
        $roles = array_keys(config('bids', []));
        $keys = [];

        // The page and page-size suffixes the directory uses. Kept in step with
        // `PublicProfessionalController::remember()` by construction: it is
        // generated from the same role registry.
        foreach ($roles as $role) {
            foreach (self::directoryPageSizes() as $perPage) {
                for ($page = 1; $page <= 25; $page++) {
                    $keys[] = "api_{$role}_list_p{$page}_n{$perPage}";
                }
            }
        }

        return $keys;
    }

    /**
     * Page sizes the directory cache is written with.
     *
     * The controller accepts any `per_page` between 1 and 100 and clamps to it,
     * so in principle any of those 100 values could form a key. Enumerating all
     * of them is cheap (7 roles x 100 sizes x 25 pages = 17,500 forgets) but
     * wasteful, so the common sizes are covered and the non-tagging path is
     * explicitly a DEVELOPMENT convenience -- on Redis (production) the tag flush
     * below is exact and none of this runs.
     *
     * @return list<int>
     */
    private static function directoryPageSizes(): array
    {
        return [12, 24, 48, 100];
    }

    public static function clearProfessionalCache(): void
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        if ($supportsTags) {
            Cache::tags(['professionals'])->flush();

            return;
        }

        // FORGET THE KNOWN KEYS. NEVER `Cache::flush()`.
        //
        // The fallback here used to be a full `Cache::flush()`, which empties the
        // ENTIRE store -- including sessions, rate-limit buckets and queue locks.
        // On Redis (production) this branch never runs, so the bug is invisible
        // until someone sets `CACHE_STORE=file` or `database` for a staging
        // environment, at which point saving one house logs out every user.
        foreach (self::professionalCacheKeys() as $key) {
            Cache::forget($key);
        }
    }
}
