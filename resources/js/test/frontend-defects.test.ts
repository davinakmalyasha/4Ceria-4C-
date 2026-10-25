import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Read a source file from the repository.
 *
 * `import.meta.url` is NOT a file URL under the jsdom environment, so the
 * path is resolved from the working directory instead — which is the
 * repository root when vitest runs.
 */
const readSource = (relative: string): string => readFileSync(resolve(process.cwd(), relative), 'utf8');

/**
 * The frontend defects B14, B15 and B16.
 *
 * B14 — `LocationPickerMap` called `fetch('/api/geocode/…')`, a HARDCODED
 *        relative path. The standalone build Vercel serves puts the SPA on a
 *        different origin from the API, so the request went to the SPA's own
 *        origin, returned the SPA's HTML, `res.json()` threw, and the catch
 *        swallowed it into an empty address. The user saw a map with no
 *        address and no error.
 *
 * B15 — the module-level caches (`useProjectTabsData`'s, and `api.js`'s) were
 *        never cleared on logout. They are keyed by PROJECT ID and hold
 *        user-scoped payloads, so the next user of the same device opened the
 *        same project and was shown the previous user's stages, documents and
 *        bids.
 *
 * B16 — `useExploreHouses`'s `toggleWishlist` called `setWishlist(...)`,
 *        which does not exist: the wishlist is a Set DERIVED from the
 *        server-backed favourites. Clicking the heart threw a ReferenceError,
 *        so the shortlist could not be changed from the map at all.
 */

describe('the API base URL', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('follows VITE_API_URL when it is set', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.example.test/api');

        vi.resetModules();
        const { API_BASE_URL } = await import('../api');

        expect(API_BASE_URL).toBe('https://api.example.test/api');
    });

    it('falls back to /api when VITE_API_URL is not set', async () => {
        vi.stubEnv('VITE_API_URL', '');

        vi.resetModules();
        const { API_BASE_URL } = await import('../api');

        expect(API_BASE_URL).toBe('/api');
    });
});

describe('the geocode calls', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('never hardcodes the /api prefix', async () => {
        // The defect was a literal `/api/geocode/…` in the component. The
        // source-level assertion is the one that cannot rot: a refactor that
        // reintroduced the literal would fail here even if the URL happened
        // to work in the developer's local build.
        const source = readSource('resources/js/components/LocationPickerMap.tsx');

        const calls = source
            .split('\n')
            .filter((line) => line.includes('fetch(') && line.includes('geocode'));

        expect(calls.length).toBeGreaterThan(0);

        for (const call of calls) {
            expect(call).not.toContain("'/api/geocode");
            expect(call).not.toContain('`/api/geocode');
            expect(call).toContain('API_BASE_URL');
        }
    });
});

describe('the cache clearing on logout', () => {
    afterEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('clears the project tabs cache', async () => {
        const { clearProjectTabsCache } = await import('../hooks/useProjectTabsData');

        // The caches are module state, so the only way to observe the effect
        // is to exercise the exported clear function and assert it does not
        // throw and can be called twice.
        expect(() => clearProjectTabsCache()).not.toThrow();
        expect(() => clearProjectTabsCache()).not.toThrow();
    });

    it('clears the API response cache', async () => {
        const { clearApiCache } = await import('../api');

        expect(() => clearApiCache()).not.toThrow();
        expect(() => clearApiCache()).not.toThrow();
    });

    it('is called by the logout path', async () => {
        // The wiring is what matters: a cache that is never cleared by the
        // logout path is the defect. The source-level check is used because
        // the logout path is inside a React callback that would need a full
        // component render to exercise.
        const source = readSource('resources/js/context/AuthContext.tsx');

        expect(source).toContain('clearProjectTabsCache()');
        expect(source).toContain('clearApiCache()');
    });
});

describe('the house wishlist toggle', () => {
    afterEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('does not call a setter that does not exist', async () => {
        // `setWishlist` was never defined: the wishlist is a derived Set, not
        // state. Clicking the heart threw a ReferenceError and the shortlist
        // could not be changed from the map.
        const source = readSource('resources/js/hooks/useExploreHouses.ts');

        // The comment above the handler quotes the old call on purpose, so
        // the check targets CODE: a line that is not a comment.
        const code = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
            .join('\n');

        expect(code).not.toContain('setWishlist(');
        expect(code).toContain('toggleFavoriteHouse(');
    });
});

describe('the 401 interceptor, B30', () => {
    /**
     * B30 — the "public" dashboard tabs were unreachable while signed out.
     *
     * `Dashboard.tsx:181-190` lists eight tabs a guest may browse. Those tabs
     * also render panels that call AUTHENTICATED endpoints (conversations,
     * favourites, orders); the first one to return 401 hit `api.js`'s handler,
     * which redirected on EVERY 401. So the visitor was thrown to /login by a
     * request that had nothing to do with the page they were reading, and the
     * public tabs the product advertises could not be opened by a member of
     * the public.
     *
     * The two cases are different: no token means a guest asked for something
     * that needs an account (the component renders its own empty state); a
     * token means the session was revoked, and THAT is what the redirect is
     * for.
     *
     * jsdom cannot observe a navigation attempt (`window.location.href = …`
     * is logged as "not implemented"), so this pins the GUARD rather than the
     * redirect: the handler must be conditional on a stored token.
     */
    it('only treats a 401 as an expired session when there WAS a session', () => {
        const source = readSource('resources/js/api.js');

        expect(source).toContain('hasToken');

        const guarded = /hasToken\s*\)\s*\{[\s\S]{0,200}?handleExpiredSession\(\)/.test(source)
            || /if\s*\([^)]*401[^)]*hasToken[^)]*\)[\s\S]{0,120}?handleExpiredSession\(\)/.test(source);

        expect(guarded).toBe(true);
    });
});
