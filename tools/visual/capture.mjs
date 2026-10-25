#!/usr/bin/env node
/**
 * capture.mjs — records the visual baseline from the LEGACY application.
 *
 * WHY THE LEGACY APP IS THE ORACLE
 * --------------------------------
 * The rewrite's contract is that the port renders the SAME pixels — not
 * "similar", not "nicer". The only thing that can define "same" is the
 * application the port replaces, so the baseline is captured from it and the
 * port is diffed against the result (REWRITE-PLAN §7, ADR-0021).
 *
 * WHAT MAKES A SHOT REPRODUCIBLE
 * ------------------------------
 * A screenshot is a function of more than the DOM, and every input that varies
 * without being declared is a flaky gate:
 *
 *   - the CLOCK. Several screens print relative dates. Both the capture and the
 *     comparison pin the BROWSER's clock (`page.clock`), so "2 days ago" is a
 *     function of the fixture row rather than of when the job ran.
 *   - ANIMATION. Every transition and animation is disabled by an injected
 *     stylesheet, and `prefers-reduced-motion` is set, so a frame is not caught
 *     mid-way through a fade.
 *   - FONTS. `document.fonts.ready` is awaited, so a shot is not taken in the
 *     fallback face.
 *   - LAZY CONTENT. The page is scrolled to the bottom and back before the shot,
 *     so an intersection-observer image has loaded.
 *   - THE VIEWPORT, the device scale, the colour scheme and the timezone are
 *     pinned here and recorded in the manifest.
 *   - THE CARET is hidden, or every shot of a focused input differs.
 *
 * WHAT IT CANNOT MAKE REPRODUCIBLE, AND SAYS SO
 * ---------------------------------------------
 * Glyph RASTERISATION differs between operating systems and Chromium builds.
 * A baseline captured on Windows will not byte-match a capture on Linux, so the
 * manifest records the platform and the browser version, and the comparison
 * REFUSES to run against a different pair rather than reporting a false failure.
 *
 * USAGE
 *   node tools/visual/capture.mjs --base-url=http://127.0.0.1:9000
 *   node tools/visual/capture.mjs --base-url=… --only=user.tab.dashboardoverview
 *   node tools/visual/capture.mjs --base-url=… --out=.tmp/screens     # compare fodder
 *
 * The legacy app must be running with the SEEDED database. Tokens are minted by
 * `php artisan visual:token`, which refuses outside local/testing.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const baseUrl = arg('base-url', 'http://127.0.0.1:9000').replace(/\/$/, '');
const manifestPath = resolve(ROOT, 'spec', 'visual-baseline', 'screens.json');
const outDir = resolve(ROOT, arg('out', 'spec/visual-baseline/screens'));
const only = arg('only', null);
const php = resolvePhp();

/**
 * The PHP binary that can actually run `vendor/`.
 *
 * AGENTS.md's first trap: the `php` on PATH is 8.3 and the application needs
 * >= 8.4, so `php artisan` fails with a Composer platform error. Resolving the
 * newest Laragon build is a convenience for this machine; `PHP_BIN` and
 * `--php=` are the portable answers.
 */
function resolvePhp() {
    const explicit = arg('php', process.env.PHP_BIN ?? null);

    if (explicit) {
        return explicit;
    }

    if (process.platform === 'win32' && existsSync('D:/laragon/bin/php')) {
        const builds = readdirSync('D:/laragon/bin/php')
            .filter((name) => name.startsWith('php-'))
            .sort()
            .reverse();

        for (const build of builds) {
            const candidate = join('D:/laragon/bin/php', build, 'php.exe');

            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }

    return 'php';
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

/** The screenshot of one screen is `<id>.png`. */
const fileFor = (screen) => join(outDir, `${screen.id}.png`);

/**
 * The token for a role, minted fresh for this run.
 *
 * A token rather than the login form: the login screen is itself under test,
 * and driving it would make every authenticated baseline depend on it.
 */
function tokenFor(role) {
    const email = manifest.roles[role];

    if (!email) {
        return null;
    }

    const output = execFileSync(php, ['artisan', 'visual:token', `--email=${email}`], {
        cwd: ROOT,
        encoding: 'utf8',
    });

    const parsed = JSON.parse(output.trim().split('\n').pop());

    return parsed.token;
}

/**
 * Wait until the page is SETTLED.
 *
 * `networkidle` ALONE IS NOT ENOUGH, and believing it was is what made the
 * first baseline racy: the SPA lazy-loads every page, and between
 * `domcontentloaded` and the dynamic import there is a window with no request
 * in flight. Playwright calls that "idle", the screenshot is taken, and the
 * baseline records the SUSPENSE FALLBACK — a spinner — instead of the page.
 *
 * Three signals, in order, because each catches a different late arrival:
 *
 *   1. the app's own loader is gone (`.animate-spin`, PageLoader.tsx);
 *   2. the DOM has stopped changing — the scroll height AND the node count are
 *      unchanged for four consecutive samples;
 *   3. fonts are loaded, images are decoded, and the network has been quiet
 *      since.
 *
 * The scroll pass runs before (3) so an intersection-observer image has been
 * requested by the time "quiet" is measured.
 */
async function settle(page) {
    await page.waitForLoadState('load');

    // The Suspense fallback. Its absence is the app telling us the page chunk
    // has mounted. A tab that legitimately keeps a spinner is bounded by the
    // timeout rather than hanging the run.
    await page
        .waitForFunction(() => document.querySelector('.animate-spin') === null, null, { timeout: 15_000 })
        .catch(() => {});

    let previous = '';
    let stable = 0;
    let samples = 0;

    while (stable < 4 && samples < 50) {
        const signature = await page.evaluate(
            () => `${document.body.scrollHeight}:${document.querySelectorAll('*').length}`,
        );

        if (signature === previous) {
            stable += 1;
        } else {
            stable = 0;
            previous = signature;
        }

        samples += 1;
        await page.waitForTimeout(120);
    }

    await page.evaluate(async () => {
        const bottom = document.body.scrollHeight;

        for (let y = 0; y <= bottom; y += 400) {
            window.scrollTo(0, y);
            await new Promise((r) => requestAnimationFrame(r));
        }

        window.scrollTo(0, 0);

        await document.fonts.ready;

        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

    // Best-effort: Next keeps a router prefetch in flight, so 'idle' is not a
    // state every stack reaches. The DOM-stability loop above is the real
    // signal; this is the belt.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.evaluate(async () => {
        const images = [...document.images].filter((img) => !img.complete);

        await Promise.all(
            images.map((img) => new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            })),
        );
    });

    // NO BROKEN IMAGE IS ALLOWED INTO A BASELINE.
    //
    // A failed <img> paints the browser's broken-image glyph and collapses the
    // space the picture would occupy — a layout that no design ever shipped.
    // The first baseline recorded exactly that because the photo came from a
    // CDN that did not answer. Failing here means the screen is never recorded
    // in a state the product cannot reach.
    await page.waitForFunction(
        () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
        null,
        { timeout: 10_000 },
    );

    // …and once more, because an image finishing can change the layout, and
    // a scroll-linked control (the floating action button) settles on a
    // debounce after the scroll returns to the top.
    await page.waitForTimeout(600);
}

const results = [];

async function main() {
    if (!existsSync(manifestPath)) {
        console.error(`::error::${manifestPath} is missing. Run: node tools/visual/screens.mjs`);
        process.exit(1);
    }

    mkdirSync(outDir, { recursive: true });

    // DETERMINISTIC TEXT RASTERISATION.
    //
    // Chromium's default antialiasing depends on the GPU path and on font
    // hinting, both of which can differ between two loads on the same machine
    // — which showed up here as glyphs offset by a fraction of a pixel in one
    // shot out of three. These flags force grayscale antialiasing, sRGB and
    // unhinted glyphs, which are the standard way to make screenshots
    // reproducible; they are applied identically when the PORT is captured.
    const browser = await chromium.launch({
        args: [
            '--disable-lcd-text',
            '--disable-gpu',
            '--force-color-profile=srgb',
            '--font-render-hinting=none',
        ],
    });
    const version = browser.version();

    const screens = only
        ? manifest.screens.filter((s) => s.id === only || s.id.includes(only))
        : manifest.screens;

    if (screens.length === 0) {
        console.error(`::error::no screen matches "${only}"`);
        process.exit(1);
    }

    const tokens = {};

    for (const screen of screens) {
        if (!(screen.role in tokens)) {
            tokens[screen.role] = tokenFor(screen.role);
        }
    }

    for (const screen of screens) {
        const context = await browser.newContext({
            viewport: manifest.viewport,
            deviceScaleFactor: 1,
            colorScheme: 'light',
            locale: 'id-ID',
            timezoneId: 'Asia/Jakarta',
            reducedMotion: 'reduce',
            serviceWorkers: 'block', // a PWA cache serving yesterday's bundle is a false pass
        });

        // OFFLINE, AND THEREFORE REPRODUCIBLE.
        //
        // The seeded data points its project photos at images.unsplash.com. A
        // baseline that depends on a third-party CDN is not a gate: the same
        // page renders a photo, a broken image, or a different crop depending
        // on the network, and the first capture recorded a broken one.
        //
        // Every external IMAGE is fulfilled from a committed neutral tile, and
        // every other external request (map tiles, analytics, fonts) is
        // aborted. The layout is untouched — which is what the visual contract
        // governs — and the run needs no network at all.
        await context.route('**/*', (route) => {
            const request = route.request();
            const url = new URL(request.url());

            // THE FONT, FROM THE REPOSITORY.
            //
            // The application loads Plus Jakarta Sans from Google Fonts with
            // `media="print"` + `onload` (a non-blocking swap). Aborting it
            // would render every screen in the fallback face — a baseline of a
            // design nobody ships — and allowing it would make the gate depend
            // on a CDN. The stylesheet and the five woff2 files it names are
            // committed under tools/visual/fixtures/fonts, and the response is
            // fulfilled from there, byte for byte.
            if (url.hostname === 'fonts.googleapis.com') {
                return route.fulfill({
                    path: resolve(ROOT, 'tools', 'visual', 'fixtures', 'fonts', 'plus-jakarta-sans.css'),
                    contentType: 'text/css',
                });
            }

            if (url.hostname === 'fonts.gstatic.com') {
                const file = resolve(ROOT, 'tools', 'visual', 'fixtures', 'fonts', url.pathname.split('/').pop());

                return existsSync(file)
                    ? route.fulfill({ path: file, contentType: 'font/woff2' })
                    : route.abort();
            }

            const isImage = request.resourceType() === 'image'
                || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname);

            // A `.avif` <source> is fulfilled with the same tile. It is NOT
            // aborted: Chromium picks the <source> candidate and does not fall
            // through to the <img> when that candidate fails, so aborting
            // leaves every <picture> broken.
            // A same-origin IMAGE under /storage/ that this checkout does not
            // carry (the seed references branding assets that are not in the
            // repository) is fulfilled from the same tile. It is the same rule
            // as an external photo, for the same reason: the baseline records
            // the LAYOUT, and a missing file must not decide what it says.
            if (isImage && (url.pathname.startsWith('/storage/') || url.pathname.startsWith('/assets/'))) {
                return route.fulfill({
                    path: resolve(ROOT, 'tools', 'visual', 'fixtures', 'photo.png'),
                    contentType: 'image/png',
                });
            }

            if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
                return route.continue();
            }

            if (isImage) {
                return route.fulfill({
                    path: resolve(ROOT, 'tools', 'visual', 'fixtures', 'photo.png'),
                    contentType: 'image/png',
                });
            }

            return route.abort();
        });

        const page = await context.newPage();

        // The clock is pinned BEFORE the navigation, so the first render is
        // already frozen rather than being corrected afterwards.
        await page.clock.install({ time: new Date(manifest.freeze_time) });

        const token = tokens[screen.role];

        // The token, in BOTH shapes. `localStorage[auth_token]` is the legacy
        // SPA's; the cookie is the port's. Setting the one the application does
        // not use is inert, so one harness photographs both.
        if (token) {
            await context.addCookies([
                {
                    name: manifest.session_cookie,
                    value: token,
                    url: baseUrl,
                    httpOnly: true,
                    sameSite: 'Lax',
                },
            ]);
        }

        await page.addInitScript(([key, value]) => {
            if (value) {
                window.localStorage.setItem(key, value);
            } else {
                window.localStorage.removeItem(key);
                window.localStorage.removeItem('user_profile');
            }
        }, [manifest.session_storage_key, token]);

        // Injected as an INIT script rather than with `addStyleTag`: a style
        // added to `about:blank` is discarded by the navigation, and the
        // animation would then be caught half-way through exactly as if this
        // did not exist.
        await context.addInitScript(() => {
            const apply = () => {
                const style = document.createElement('style');
                style.setAttribute('data-visual-harness', '');
                style.textContent = `
                    /* ONE STABLE COMPOSITED LAYER.
                     *
                     * Without this, two loads of the SAME page produce
                     * different bytes: Chromium snapshots its layers per load,
                     * and text inside a layer whose bounds fall on a fraction
                     * is rasterised at a different sub-pixel offset. The layout
                     * is identical (getBoundingClientRect matches to the
                     * pixel) and only the glyph rasterisation moves — which is
                     * indistinguishable from a real design change to a byte
                     * comparison.
                     *
                     * Promoting the root makes the layer bounds integers, and
                     * two loads then match exactly. It is a property of the
                     * HARNESS, applied identically when the port is captured. */
                    html, body {
                        transform: translateZ(0);
                        backface-visibility: hidden;
                    }

                    /* animation: none, NOT animation-duration: 0s.
                     *
                     * A zero duration still runs the animation once, and an
                     * infinite one (animate-pulse on a badge) is then frozen
                     * at whatever phase the screenshot landed on — which showed
                     * up as a notification dot five shades too light in one
                     * run and not the next. none removes it, so the element
                     * keeps its declared style. */
                    *, *::before, *::after {
                        animation: none !important;
                        transition: none !important;
                        caret-color: transparent !important;
                        scroll-behavior: auto !important;
                    }
                `;
                document.documentElement.appendChild(style);
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', apply, { once: true });
            } else {
                apply();
            }
        });

        const url = `${baseUrl}${screen.path}${screen.tab ? `?tab=${screen.tab}` : ''}`;

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await settle(page);

            // A screen that redirected to /login is a screen the harness could
            // not authenticate into. Recording a login page under the name of a
            // dashboard tab is the exact silent false pass this gate exists to
            // prevent.
            if (screen.role !== 'guest' && new URL(page.url()).pathname === '/login') {
                throw new Error(`redirected to /login — the ${screen.role} token was rejected`);
            }

            await page.screenshot({ path: fileFor(screen), fullPage: false });

            results.push({ id: screen.id, ok: true });
            console.log(`  captured ${screen.id}`);
        } catch (error) {
            results.push({ id: screen.id, ok: false, error: String(error.message ?? error) });
            console.error(`  FAILED   ${screen.id}: ${error.message ?? error}`);
        } finally {
            await context.close();
        }
    }

    await browser.close();

    const failed = results.filter((r) => !r.ok);

    if (!only) {
        writeFileSync(
            join(outDir, '..', 'screens.meta.json'),
            JSON.stringify({
                platform: `${process.platform}-${process.arch}`,
                browser: version,
                viewport: manifest.viewport,
                freeze_time: manifest.freeze_time,
                screens: results.filter((r) => r.ok).length,
            }, null, 2) + '\n',
            'utf8',
        );
    }

    if (failed.length > 0) {
        console.error(`\n${failed.length} of ${results.length} screens failed to capture.`);
        process.exit(1);
    }

    console.log(`\n${results.length} screens captured into ${outDir}`);
}

await main();
