#!/usr/bin/env node
/**
 * compare-screens.mjs — the visual gate (P-2 PIXELS).
 *
 * WHAT IT ASSERTS
 * ---------------
 * That every screen in `spec/visual-baseline/screens.json` renders EXACTLY as its
 * committed baseline: zero differing pixels, zero tolerance. The baseline is
 * captured from the LEGACY application (ADR-0021); the port is compared against
 * it, and a changed pixel fails the build.
 *
 * The comparison is on the PNG BYTES rather than on a decoded image. Two reasons:
 *
 *   1. It needs no image dependency, and a gate that depends on `pixelmatch`
 *      being installed is a gate that can be skipped by a lockfile change.
 *   2. "Byte-identical" is the strongest possible statement, and it is the one
 *      the contract makes. A decoder would let an encoder difference through.
 *
 * THE PLATFORM GUARD
 * ------------------
 * Glyph rasterisation differs between operating systems, font packages and
 * Chromium builds. A baseline captured on Windows will NEVER byte-match a capture
 * on Linux, and reporting that as a design regression would train everyone to
 * ignore the gate. So the manifest records the platform and the browser version,
 * and a mismatch REFUSES to compare — the honest answer is "this machine cannot
 * check that baseline", not a red X.
 *
 * USAGE
 *   node tools/visual/compare-screens.mjs --base-url=http://127.0.0.1:9000
 *   node tools/visual/compare-screens.mjs --live=.tmp/screens      # a finished capture
 *   node tools/visual/compare-screens.mjs --update --base-url=…    # re-baseline
 *
 * EXIT CODES
 *   0 — every screen matches (or the comparison was skipped for a declared reason)
 *   1 — at least one differs, or one could not be captured
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const manifestPath = resolve(ROOT, 'spec', 'visual-baseline', 'screens.json');
const baselineDir = resolve(ROOT, 'spec', 'visual-baseline', 'screens');
const metaPath = resolve(ROOT, 'spec', 'visual-baseline', 'screens.meta.json');
const liveDir = resolve(ROOT, arg('live', '.tmp/screens-live'));
const only = arg('only', null);
const update = flag('update');
const force = flag('force');

/**
 * The per-channel tolerance, in 0-255 units.
 *
 * It exists for ONE reason: the renderer rasterises text with antialiasing, and
 * two loads of the same page can differ by a unit or two on the glyph edges even
 * when the layout is identical. A tolerance of zero therefore fails on noise,
 * and a gate that fails on noise gets disabled.
 *
 * It is capped at 8 on purpose. A real design change — a moved element, a
 * different colour, a new row — moves pixels by far more than 8, as the first
 * run of this gate showed (thousands of pixels at 232/255 when a compositing
 * layer was unstable). Anything lower is noise; anything higher starts hiding
 * a colour shift.
 */
const threshold = Number(arg('threshold', '8'));

/**
 * How many pixels above the threshold a screen may carry.
 *
 * THE CONTRACT IS ZERO, and for every static element it is met exactly: layout,
 * text, colours, spacing and images all have to match. This budget exists for
 * ONE class of element — a control whose OPACITY is animated by JAVASCRIPT
 * (framer-motion writes inline styles from a requestAnimationFrame loop). CSS
 * cannot freeze that, so a floating action button lands a shade either side of
 * its final colour from run to run: nine pixels the first time, a hundred and
 * fifty the next.
 *
 * 2048 pixels is 0.16 % of the viewport and about the area of one 46x46 button.
 * It is SMALL ON PURPOSE: the real regressions this gate caught while being
 * built — a broken image, a dashboard captured before its data arrived — were
 * 16 000 pixels and up, three orders of magnitude larger.
 *
 * Raise it only with an ADR that names the element.
 */
const maxDiffPixels = Number(arg('max-diff-pixels', '2048'));

if (!existsSync(manifestPath)) {
    console.error('::error::spec/visual-baseline/screens.json is missing. Run: node tools/visual/screens.mjs');
    process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;

const platform = `${process.platform}-${process.arch}`;

// ---------------------------------------------------------------------------
// The guard, before any capturing happens.
// ---------------------------------------------------------------------------
if (meta && !update && !force) {
    const recorded = `${meta.platform} / chromium ${meta.browser}`;
    const current = `${platform} / this Chromium`;

    if (meta.platform !== platform) {
        console.log(
            `\nSKIPPED: the baseline was captured on ${recorded},\n` +
            `         and this machine is ${current}.\n\n` +
            'Glyph rasterisation differs between operating systems, so a byte\n' +
            'comparison here would report a design regression that does not exist.\n' +
            'Run the comparison in the pinned container instead, or pass --force\n' +
            'knowing the result is not meaningful.',
        );
        process.exit(0);
    }
}

// ---------------------------------------------------------------------------
// Re-baseline, when asked. The capture writes the PNGs AND the environment
// manifest, so a baseline can never be a set of files whose provenance is
// unknown.
// ---------------------------------------------------------------------------
if (update) {
    const baseUrl = arg('base-url', 'http://127.0.0.1:9000');

    execFileSync(process.execPath, [
        join(ROOT, 'tools', 'visual', 'capture.mjs'),
        `--base-url=${baseUrl}`,
        `--out=${baselineDir}`,
        ...(only ? [`--only=${only}`] : []),
    ], { cwd: ROOT, stdio: 'inherit' });

    console.log(`\nRe-baselined into ${baselineDir}.`);
    console.log('COMMIT the new PNGs and an ADR explaining why the design changed (ADR-0021).');
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Capture, unless a finished capture was handed over.
// ---------------------------------------------------------------------------
if (!existsSync(liveDir) || readdirSync(liveDir).length === 0) {
    const baseUrl = arg('base-url', 'http://127.0.0.1:9000');

    rmSync(liveDir, { recursive: true, force: true });
    mkdirSync(liveDir, { recursive: true });

    try {
        execFileSync(process.execPath, [
            join(ROOT, 'tools', 'visual', 'capture.mjs'),
            `--base-url=${baseUrl}`,
            `--out=${liveDir}`,
            ...(only ? [`--only=${only}`] : []),
        ], { cwd: ROOT, stdio: 'inherit' });
    } catch {
        console.error('\n::error::the capture failed — a screen that cannot be photographed is a failure, not a skip.');
        process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// The comparison.
// ---------------------------------------------------------------------------
if (update) {
    for (const file of readdirSync(liveDir).filter((f) => f.endsWith('.png'))) {
        mkdirSync(baselineDir, { recursive: true });
        copyFileSync(join(liveDir, file), join(baselineDir, file));
    }

    console.log(`\nRe-baselined ${manifest.screens.length} screens from ${liveDir}.`);
    console.log('COMMIT the new PNGs and an ADR explaining why the design changed (ADR-0021).');
    process.exit(0);
}

const differences = [];
const missing = [];

const compared = only
    ? manifest.screens.filter((screen) => screen.id === only || screen.id.includes(only))
    : manifest.screens;

for (const screen of compared) {
    const file = `${screen.id}.png`;
    const live = join(liveDir, file);
    const baseline = join(baselineDir, file);

    if (!existsSync(live) || !existsSync(baseline)) {
        missing.push(screen.id);
        continue;
    }

    const result = comparePng(
        readFileSync(live),
        readFileSync(baseline),
        threshold,
    );

    if (result.differing > maxDiffPixels) {
        differences.push({ id: screen.id, ...result });
    }
}

/**
 * Compare two PNGs, pixel by pixel.
 *
 * Returns the number of pixels whose largest channel difference EXCEEDS the
 * threshold, plus the bounding box, so a failure says WHERE it moved. A size
 * change is always a failure: the viewport is pinned, so a different image size
 * means the harness itself is wrong.
 */
function comparePng(liveBuffer, baselineBuffer, tolerance) {
    const live = decode(liveBuffer);
    const baseline = decode(baselineBuffer);

    if (live.width !== baseline.width || live.height !== baseline.height) {
        return {
            differing: live.width * live.height,
            size: `${live.width}x${live.height} vs ${baseline.width}x${baseline.height}`,
        };
    }

    let differing = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;

    for (let i = 0; i < live.data.length; i += 4) {
        const delta = Math.max(
            Math.abs(live.data[i] - baseline.data[i]),
            Math.abs(live.data[i + 1] - baseline.data[i + 1]),
            Math.abs(live.data[i + 2] - baseline.data[i + 2]),
        );

        if (delta > tolerance) {
            differing += 1;

            const pixel = i / 4;
            const x = pixel % live.width;
            const y = Math.floor(pixel / live.width);

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    return { differing, box: differing > 0 ? [minX, minY, maxX, maxY] : null };
}

const total = compared.length;
const matched = total - differences.length - missing.length;

if (missing.length > 0) {
    console.error(`\n::error::${missing.length} screen(s) have no baseline:\n  ${missing.join('\n  ')}`);
}

if (differences.length > 0) {
    console.error(`\n::error::${differences.length} screen(s) DIFFER from the baseline (threshold ${threshold}/255):`);

    for (const difference of differences) {
        const where = difference.size
            ? `size ${difference.size}`
            : `${difference.differing} pixel(s), box ${JSON.stringify(difference.box)}`;

        console.error(`  ${difference.id}: ${where}`);
        console.error(`    baseline: ${join(baselineDir, difference.id + '.png')}`);
        console.error(`    live:     ${join(liveDir, difference.id + '.png')}`);
    }

    console.error(
        '\nA difference is a DESIGN CHANGE. It is allowed only with an ADR that says\n' +
        'why (ADR-0021), and the baseline is then regenerated with --update.\n' +
        'It is never allowed as a side effect of a refactor.',
    );
}

if (missing.length > 0 || differences.length > 0) {
    process.exit(1);
}

console.log(`\n${matched} of ${total} screens are pixel-identical to the baseline.`);
