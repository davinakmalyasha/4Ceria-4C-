<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Invalidating a tagged cache group WITHOUT risking the rest of the store.
 *
 * WHY THIS EXISTS
 * ---------------
 * Eleven sites across `House`, `Room`, `Supplier`, `MaterialOrderReview`,
 * `HouseController` and `MaterialController` used this shape:
 *
 *     if ($supportsTags) {
 *         Cache::tags(['houses'])->flush();
 *     } else {
 *         Cache::flush();              // <-- empties EVERYTHING
 *     }
 *
 * `Cache::flush()` empties the entire store: sessions, rate-limit buckets, queue
 * locks, and every other cached response in the application. So changing one
 * house logged out every user.
 *
 * It is invisible on Railway, where `CACHE_STORE=redis` and the tagging branch
 * always wins. The moment anyone sets `CACHE_STORE=file` or `database` for a
 * staging box or a CI run, the bug appears -- which is the worst possible time,
 * because the configuration change has nothing to do with authentication.
 *
 * THE TRADEOFF, STATED PLAINLY
 * -----------------------------
 * On a non-tagging driver the group cannot be flushed as a group, and the member
 * keys are built from whitelisted filters plus a page number, so they cannot be
 * enumerated exhaustively either.
 *
 * So the fallback forgets WHAT IT KNOWS and accepts staleness rather than
 * risking the store. On a non-tagging driver -- development and CI -- a listing
 * being up to its TTL stale is a non-event. Logging out every user is not.
 *
 * Callers that CAN enumerate their keys pass them as `$forgetKeys` and get exact
 * invalidation; the rest degrade to the TTL.
 */
final class TaggedCache
{
    /**
     * @param  list<string>  $forgetKeys  keys the caller can enumerate exactly
     */
    public static function flush(string $tag, array $forgetKeys = []): void
    {
        if (self::supportsTags()) {
            Cache::tags([$tag])->flush();

            return;
        }

        foreach ($forgetKeys as $key) {
            Cache::forget($key);
        }

        // Intentionally no `Cache::flush()`. See the class docblock.
    }

    /**
     * @param  list<string>  $forgetKeys
     */
    public static function forget(array $forgetKeys): void
    {
        foreach ($forgetKeys as $key) {
            Cache::forget($key);
        }
    }

    public static function supportsTags(): bool
    {
        return in_array(config('cache.default'), ['redis', 'memcached'], true);
    }
}