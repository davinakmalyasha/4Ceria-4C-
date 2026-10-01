<?php

use App\Support\TaggedCache;
use Illuminate\Support\Facades\Cache;

/**
 * Regression tests for the eleven `Cache::flush()` fallbacks.
 *
 * No database: this exercises the cache facade only. The driver is forced to
 * `file` for the fallback cases, because that branch is unreachable on the
 * `redis` driver production actually uses -- which is precisely why the bug
 * survived review.
 */
uses(Tests\TestCase::class);

afterEach(function () {
    Cache::store('file')->clear();
});

describe('TaggedCache never flushes the whole store', function () {
    it('takes the tagging branch on a tagging driver', function () {
        config()->set('cache.default', 'redis');

        expect(TaggedCache::supportsTags())->toBeTrue();
    });

    it('takes the fallback branch on a non-tagging driver', function () {
        config()->set('cache.default', 'file');

        expect(TaggedCache::supportsTags())->toBeFalse();
    });

    it('forgets exactly the keys it is given and nothing else', function () {
        // This is the assertion the old code failed. `Cache::flush()` would
        // have emptied `session:xyz` along with the listing.
        config()->set('cache.default', 'file');
        Cache::store('file')->put('list:page1', ['a', 'b'], 600);
        Cache::store('file')->put('session:xyz', 'session-payload', 600);

        TaggedCache::flush('houses', ['list:page1']);

        expect(Cache::store('file')->get('list:page1'))->toBeNull();
        expect(Cache::store('file')->get('session:xyz'))->toBe('session-payload');
    });

    it('is a harmless no-op when no keys are enumerable', function () {
        // The realistic non-tagging case: the real cache keys are built from
        // whitelisted filters plus a page number, so they cannot be listed.
        // Accepting a stale listing beats logging out every user.
        config()->set('cache.default', 'file');
        Cache::store('file')->put('session:keepme', 'payload', 600);

        TaggedCache::flush('houses');

        expect(Cache::store('file')->get('session:keepme'))->toBe('payload');
    });

    it('tolerates a key that is not present, without touching anything else', function () {
        // The previous version of this test ended in `expect(true)->toBeTrue()`.
        // It could not fail, and it existed only to prove that `Cache::forget`
        // does not throw on a missing key -- which it does not, so the assertion
        // had nothing to assert.
        //
        // The behaviour worth pinning is the one a caller depends on: forgetting
        // an absent key is a no-op that leaves the rest of the store alone. If
        // someone "fixed" the miss by flushing, this fails.
        config()->set('cache.default', 'file');
        Cache::store('file')->put('list:present', ['a'], 600);
        Cache::store('file')->put('session:xyz', 'session-payload', 600);

        TaggedCache::flush('houses', ['never:written', 'list:present']);

        // The absent key is still simply absent -- no exception, no surprise.
        expect(Cache::store('file')->get('never:written'))->toBeNull();
        // The present key really was forgotten.
        expect(Cache::store('file')->get('list:present'))->toBeNull();
        // And nothing beyond the requested keys was disturbed.
        expect(Cache::store('file')->get('session:xyz'))->toBe('session-payload');
    });
});

describe('the professional cache trait does not flush the store', function () {
    it('leaves unrelated entries in place on a non-tagging driver', function () {
        config()->set('cache.default', 'file');
        Cache::store('file')->put('session:still-here', 'payload', 600);

        \App\Traits\ClearsProfessionalCache::clearProfessionalCache();

        // ClearsProfessionalCache used to fall through to `Cache::flush()` here.
        expect(Cache::store('file')->get('session:still-here'))->toBe('payload');
    });

    it('enumerates keys that match the paginated directory cache', function () {
        // The directory cache key now carries the page and page size, so the
        // old hard-coded `['api_arsitek_list', ...]` list matched nothing.
        // This pins that the generated list still covers the un-paginated form
        // so an older cached entry cannot outlive a profile update.
        $keys = \App\Traits\ClearsProfessionalCache::professionalCacheKeys();

        expect($keys)->not->toBeEmpty();
        expect(implode('|', $keys))->toContain('arsitek');
        expect(implode('|', $keys))->toContain('mep');
    });
});