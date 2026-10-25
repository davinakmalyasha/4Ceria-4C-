#!/usr/bin/env node
/**
 * compare-upstreams.mjs — the port against the legacy app, SIDE BY SIDE.
 *
 * WHY THIS EXISTS IN ADDITION TO THE COMMITTED BASELINE
 * -----------------------------------------------------
 * The committed baseline is a set of PNGs captured on ONE machine. It answers
 * "did the design change since we recorded it?", which is the right question
 * for the legacy app — but it cannot answer "does the PORT render the same?"
 * on a different operating system, because glyph rasterisation differs and the
 * comparison would report a regression that is really just a font stack.
 *
 * This harness answers the port's question directly: it captures the SAME
 * screen from the running LEGACY app and the running PORT, in the same browser,
 * on the same machine, seconds apart, and diffs the two. Both sides get exactly
 * the same treatment — the same clock, the same disabled animations, the same
 * font files, the same mocked photography — so a difference is a difference in
 * the application, not in the environment.
 *
 * It needs both applications running and the SEEDED database:
 *
 *   php artisan octane:start --port=9000
 *   cd web && npm run build && npx next start --port 3000
 *
 * USAGE
 *   node tools/visual/compare-upstreams.mjs --screen=guest.route.login
 *   node tools/visual/compare-upstreams.mjs --only=dashboard --legacy=http://… --port=http://…
 *
 * EXIT CODES
 *   0 — every compared screen matches
 *   1 — one differs, or one could not be captured
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

const legacy = arg('legacy', 'http://127.0.0.1:9000');
const port = arg('port', 'http://127.0.0.1:3000');
const only = arg('only', arg('screen', null));
const threshold = Number(arg('threshold', '8'));
const maxDiffPixels = Number(arg('max-diff-pixels', '2048'));

if (!only) {
    console.error('::error::pass --screen=<id> (or --only=<substring>). Both apps must be running.');
    process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'spec', 'visual-baseline', 'screens.json'), 'utf8'));

const screens = manifest.screens.filter((s) => s.id === only || s.id.includes(only));

if (screens.length === 0) {
    console.error(`::error::no screen matches "${only}"`);
    process.exit(1);
}

function capture(baseUrl, out) {
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });

    execFileSync(process.execPath, [
        join(ROOT, 'tools', 'visual', 'capture.mjs'),
        `--base-url=${baseUrl}`,
        `--out=${out}`,
        `--only=${only}`,
    ], { cwd: ROOT, stdio: 'inherit' });
}

const left = resolve(ROOT, '.tmp', 'upstream-legacy');
const right = resolve(ROOT, '.tmp', 'upstream-port');

capture(legacy, left);
capture(port, right);

const failures = [];

for (const screen of screens) {
    const file = `${screen.id}.png`;
    const a = join(left, file);
    const b = join(right, file);

    if (!existsSync(a) || !existsSync(b)) {
        failures.push(`${screen.id}: a capture is missing`);
        continue;
    }

    const imageA = decode(readFileSync(a));
    const imageB = decode(readFileSync(b));

    if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
        failures.push(`${screen.id}: size ${imageA.width}x${imageA.height} vs ${imageB.width}x${imageB.height}`);
        continue;
    }

    let differing = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    let worst = 0;

    for (let i = 0; i < imageA.data.length; i += 4) {
        const delta = Math.max(
            Math.abs(imageA.data[i] - imageB.data[i]),
            Math.abs(imageA.data[i + 1] - imageB.data[i + 1]),
            Math.abs(imageA.data[i + 2] - imageB.data[i + 2]),
        );

        if (delta > worst) worst = delta;

        if (delta > threshold) {
            differing += 1;

            const pixel = i / 4;
            const x = pixel % imageA.width;
            const y = Math.floor(pixel / imageA.width);

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (differing > maxDiffPixels) {
        failures.push(
            `${screen.id}: ${differing} pixel(s) differ, box ${JSON.stringify([minX, minY, maxX, maxY])}, worst channel ${worst}/255\n` +
            `    legacy: ${a}\n    port:   ${b}`,
        );
    } else {
        console.log(`  ${screen.id}: identical (worst channel ${worst}/255, ${differing} pixel(s) beyond ${threshold})`);
    }
}

if (failures.length > 0) {
    console.error('\n::error::the port does not render the legacy screen:');
    for (const failure of failures) {
        console.error(`  ${failure}`);
    }

    process.exit(1);
}

console.log(`\n${screens.length} screen(s) render identically in the legacy app and the port.`);
