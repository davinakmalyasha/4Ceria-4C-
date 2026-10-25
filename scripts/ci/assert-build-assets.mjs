#!/usr/bin/env node
/**
 * assert-build-assets.mjs — proves the built SPA actually ships its stylesheet.
 *
 * WHY THIS EXISTS
 * ---------------
 * The standalone build that Vercel serves shipped NO Tailwind at all. The
 * evidence was in the built artifact:
 *
 *   - `dist/index.html` linked exactly ONE stylesheet, `index-*.css` (15 kB),
 *     which is the project's own theme.
 *   - The 206 kB Tailwind bundle sat in `dist/assets/app-*.css` and was
 *     referenced by NOTHING in the HTML — only by `sw.js` and
 *     `manifest.json`.
 *   - `index-*.css` contained ZERO `--tw-` variables.
 *
 * The cause: `resources/css/app.css` (the only file with `@tailwind`
 * directives) was a separate Vite *entry*. Vite emits no `<link>` element for
 * a CSS-only entry, so the stylesheet it produced was simply never linked.
 * The Laravel build linked the file by hand in the Blade template, which is
 * why the defect was invisible locally — the two build modes silently
 * disagreed, and only one of them is deployed.
 *
 * A build that succeeds is not a build that is correct. This asserts the
 * artifact, not the exit code.
 *
 * THE ORDER INVARIANT
 * --------------------
 * `index.css` must come AFTER Tailwind. Its
 * `.custom-navbar-container { z-index: 1000 }` has to beat the `z-100`
 * utility on `Navbar.tsx:53` — equal specificity, so source order decides.
 * Reversing the two drops the navbar one layer behind the page content, which
 * no build step would ever complain about.
 *
 * USAGE
 *   node scripts/ci/assert-build-assets.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const problems = [];
const notes = [];

/** Count non-overlapping occurrences of avoid the `g` flag's substring trap. */
function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
        count += 1;
        index = haystack.indexOf(needle, index + needle.length);
    }
    return count;
}

/**
 * Assert that a stylesheet exists, is non-trivial, and carries Tailwind.
 */
function checkStylesheet(label, cssPath, css) {
    if (!existsSync(cssPath)) {
        problems.push(`${label}: stylesheet is missing (${cssPath})`);
        return null;
    }

    const twCount = countOccurrences(css, '--tw-');

    if (twCount === 0) {
        problems.push(
            `${label}: stylesheet carries NO Tailwind (0 "--tw-" variables). ` +
                `The build produced CSS without utility classes — every ` +
                `utility-classed element would render unstyled.`,
        );
    }

    notes.push(`${label}: ${cssPath.replace(ROOT, '.')} — ${css.length} bytes, ${twCount} Tailwind variables`);

    return { css, twCount };
}

// ---------------------------------------------------------------------------
// 1. The Laravel build (public/build) — what the API server serves.
// ---------------------------------------------------------------------------
{
    const manifestPath = join(ROOT, 'public', 'build', 'manifest.json');

    if (!existsSync(manifestPath)) {
        problems.push('public/build/manifest.json is missing — the Laravel build did not run');
    } else {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const entry = manifest['resources/js/app.tsx'];

        if (!entry) {
            problems.push(
                'public/build/manifest.json has no entry for resources/js/app.tsx — ' +
                    'the @vite() call in the Blade template would throw',
            );
        } else if (!Array.isArray(entry.css) || entry.css.length === 0) {
            problems.push(
                'public/build/manifest.json: resources/js/app.tsx declares no CSS. ' +
                    'The Tailwind stylesheet is not part of the entry.',
            );
        } else {
            let combined = '';
            for (const relative of entry.css) {
                const absolute = join(ROOT, 'public', 'build', relative);
                if (!existsSync(absolute)) {
                    problems.push(`public/build: manifest lists ${relative} but the file does not exist`);
                    continue;
                }
                const css = readFileSync(absolute, 'utf8');
                checkStylesheet(`Laravel build (${relative})`, absolute, css);
                combined += css;
            }

            if (combined) {
                const twIndex = combined.indexOf('--tw-');
                const themeIndex = combined.indexOf('.custom-navbar-container');

                if (themeIndex !== -1 && themeIndex < twIndex) {
                    problems.push(
                        'Laravel build: the project theme (.custom-navbar-container) comes BEFORE ' +
                            'Tailwind. Its `z-index: 1000` has to win over the `z-100` utility, ' +
                            'which needs the later source order.',
                    );
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 2. The standalone build (dist/) — what Vercel serves. THIS is the one that
//    shipped without Tailwind for months.
// ---------------------------------------------------------------------------
{
    const htmlPath = join(ROOT, 'dist', 'index.html');

    if (!existsSync(htmlPath)) {
        problems.push('dist/index.html is missing — the standalone build did not run');
    } else {
        const html = readFileSync(htmlPath, 'utf8');
        const links = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)].map((m) => m[1]);

        if (links.length === 0) {
            problems.push(
                'dist/index.html links NO stylesheet. The standalone build ships no CSS at all.',
            );
        }

        let combined = '';

        for (const href of links) {
            const relative = href.replace(/^\//, '');
            const absolute = join(ROOT, 'dist', relative);

            if (!existsSync(absolute)) {
                problems.push(`dist/index.html links ${href} but the file does not exist`);
                continue;
            }

            const css = readFileSync(absolute, 'utf8');
            checkStylesheet(`Standalone build (${href})`, absolute, css);
            combined += css;
        }

        if (combined) {
            const twIndex = combined.indexOf('--tw-');
            const themeIndex = combined.indexOf('.custom-navbar-container');

            if (themeIndex !== -1 && themeIndex < twIndex) {
                problems.push(
                    'Standalone build: the project theme (.custom-navbar-container) comes BEFORE ' +
                        'Tailwind. Its `z-index: 1000` has to win over the `z-100` utility.',
                );
            }
        }

        if (!existsSync(join(ROOT, 'dist', 'sw.js'))) {
            problems.push('dist/sw.js is missing — the PWA injectManifest step did not run');
        }
    }
}

// ---------------------------------------------------------------------------
// 3. The service worker must precache the stylesheet it depends on.
// ---------------------------------------------------------------------------
{
    const swPath = join(ROOT, 'public', 'build', 'sw.js');

    if (existsSync(swPath)) {
        const sw = readFileSync(swPath, 'utf8');
        const manifest = JSON.parse(
            existsSync(join(ROOT, 'public', 'build', 'manifest.json'))
                ? readFileSync(join(ROOT, 'public', 'build', 'manifest.json'), 'utf8')
                : '{}',
        );
        const entry = manifest['resources/js/app.tsx'];
        const cssFiles = (entry?.css ?? []).map((c) => c.replace(/^assets\//, ''));

        for (const css of cssFiles) {
            if (!sw.includes(css)) {
                problems.push(
                    `public/build/sw.js does not precache ${css}. The service worker would ` +
                        `serve a stale page with no stylesheet.`,
                );
            }
        }
    }
}

for (const note of notes) console.log(`  ${note}`);

if (problems.length > 0) {
    console.error('');
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(1);
}

console.log('build assets OK — both build modes ship a Tailwind-bearing stylesheet in the right order');
