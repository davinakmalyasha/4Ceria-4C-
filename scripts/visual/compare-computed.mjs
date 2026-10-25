#!/usr/bin/env node
/**
 * compare-computed.mjs — diff two COMPUTED-STYLE captures.
 *
 * The captures come from `computed-styles.mjs`, which renders every utility
 * class the application uses in a real browser and records the computed style.
 * That is the ground truth: the browser has already applied the cascade,
 * resolved the custom properties and evaluated every media query.
 *
 * A textual diff of the two BUILT STYLESHEETS cannot answer the question:
 * Tailwind v3 emits `--tw-*` shadow variables and v4 emits `@property`
 * declarations, so the two files are structurally different while doing the
 * same work. The computed style is the only comparison that means anything.
 *
 * USAGE
 *   node scripts/visual/compare-computed.mjs before.json after.json [--max=60]
 *
 * EXIT CODES
 *   0 — no differences
 *   1 — differences found
 */

import { readFileSync } from 'node:fs';
import { normaliseProperty } from './normalize.mjs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const maxArg = args.find((a) => a.startsWith('--max='));
const max = maxArg ? Number(maxArg.split('=')[1]) : 60;

if (files.length !== 2) {
    console.error('Usage: node scripts/visual/compare-computed.mjs <before.json> <after.json> [--max=N]');
    process.exit(2);
}

const [beforePath, afterPath] = files;
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

/**
 * Normalise a length so `0px` and `0rem` compare equal, and `1rem` and `16px`
 * do too.
 *
 * The probe elements are rendered at the default 16px root, so a rem is a
 * fixed number of pixels. Chromium's computed style already reports px for
 * most lengths; this only has to catch the unit-ful leftovers.
 */
const normaliseLength = (value) => {
    if (typeof value !== 'string') return value;
    const match = value.match(/^(-?[\d.]+)(px|rem|em|%)?$/);
    if (!match) return value;
    const amount = Number(match[1]);
    const unit = match[2] ?? 'px';
    if (unit === 'rem' || unit === 'em') return `${amount * 16}px`;
    return `${amount}${unit}`;
};

/**
 * Normalise a box-shadow LIST.
 *
 * Tailwind v3 composed `box-shadow` from three shadows (the ring offset,
 * the ring, and the shadow) and v4 from five (it adds an inset shadow and an
 * inset ring shadow, both fully transparent by default). The LISTS differ; the
 * RENDERING does not.
 *
 * A fully transparent shadow paints nothing, so it is dropped before the
 * comparison. What is left is what the user can see.
 */
const normaliseBoxShadow = (value) => {
    if (typeof value !== 'string' || value === 'none') return value;

    return value
        .split(/,(?![^(]*\))/)
        .map((part) => part.trim())
        .filter((part) => {
            // `rgba(0, 0, 0, 0) …` and `transparent …` paint nothing.
            if (/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(part)) return false;
            if (/^transparent\b/.test(part)) return false;
            return true;
        })
        .join(', ');
};

/**
 * Normalise a colour's ALPHA.
 *
 * Chromium quantises an alpha to 8 bits, and it does so in the colour's own
 * space: `rgb(255 255 255 / 0.3)` reports `0.3020` in sRGB and `0.2980` in
 * oklab. The two are the same colour, one 1/255 apart in the alpha, and the
 * difference is invisible.
 */
const normaliseAlpha = (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/\/\s*0\.\d{3,}/g, (match) => {
        const alpha = Number(match.replace('/', ''));
        return `/${alpha.toFixed(2)}`;
    });
};

/**
 * An outline is VISIBLE or it is not.
 *
 * v3's `outline-none` was `outline: 2px solid transparent; outline-offset: 2px`
 * and v4's is `outline-style: none`. Both paint nothing. The computed values
 * differ in every field; the pixels do not.
 */
const normaliseOutline = (value) => {
    if (typeof value !== 'string') return value;
    if (value === 'none' || value === 'transparent') return 'invisible';
    return value;
};

const LENGTH_PROPERTIES = new Set([
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'top', 'right', 'bottom', 'left',
    'gap', 'row-gap', 'column-gap',
    'font-size', 'letter-spacing', 'line-height', 'word-spacing', 'text-indent',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'outline-width', 'outline-offset',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'stroke-width', 'flex-basis', 'flex-grow', 'flex-shrink', 'order', 'z-index',
]);

/**
 * A box-shadow that paints NOTHING.
 *
 * A shadow with zero blur, zero spread and zero offset has no extent, so it
 * is invisible whatever its colour. Tailwind v3 emitted one of those as the
 * ring-offset shadow (`rgb(255, 255, 255) 0px 0px 0px 0px`) and v4 emits the
 * ring shadows as transparent. Neither paints.
 */
const paintsNothing = (shadow) =>
    /,\s*0px\s+0px\s+0px\s*$/.test(shadow) ||
    /\s0px\s+0px\s+0px$/.test(shadow);

const differences = [];
const byProperty = new Map();

const classes = new Set([...Object.keys(before), ...Object.keys(after)]);

for (const className of classes) {
    const a = before[className] ?? {};
    const b = after[className] ?? {};

    const properties = new Set([...Object.keys(a), ...Object.keys(b)]);

    for (const property of properties) {
        let left = a[property];
        let right = b[property];

        if (left === right) continue;

        if (LENGTH_PROPERTIES.has(property)) {
            left = normaliseLength(left);
            right = normaliseLength(right);
            if (left === right) continue;
        }

        // The SHARED normaliser — the same one the committed signature uses,
        // so the baseline and this report can never disagree.
        {
            const normalisedLeft = normaliseProperty(property, left, a);
            const normalisedRight = normaliseProperty(property, right, b);

            if (normalisedLeft === normalisedRight) continue;

            left = normalisedLeft;
            right = normalisedRight;
        }

        if (property === 'box-shadow') {
            left = normaliseBoxShadow(left);
            right = normaliseBoxShadow(right);
            if (left === right) continue;

            // A shadow with no extent paints nothing whatever its colour.
            const strip = (value) =>
                value
                    .split(/,(?![^(]*\))/)
                    .map((part) => part.trim())
                    .filter((part) => !paintsNothing(part))
                    .join(', ');

            if (strip(left) === strip(right)) continue;
        }

        if (property.startsWith('outline-')) {
            // An outline is VISIBLE or it is not. v3's `outline-none` was
            // `outline: 2px solid transparent` and v4's is `outline-style: none`
            // — both paint nothing, and the computed values differ in every
            // field.
            const invisible = (style, colour) =>
                style === 'none' || colour === 'transparent';

            if (property === 'outline-style' || property === 'outline-color') {
                const leftInvisible = invisible(a['outline-style'], a['outline-color']);
                const rightInvisible = invisible(b['outline-style'], b['outline-color']);

                if (leftInvisible && rightInvisible) continue;
            }

            left = normaliseOutline(left);
            right = normaliseOutline(right);
            if (left === right) continue;
        }

        // A transform is compared through the RENDERED GEOMETRY, not through
        // the transform properties: v3 wrote `transform: rotate(6deg)` and v4
        // writes `rotate: 6deg`, and the two paint the same pixels. The
        // individual properties are skipped for the same reason.
        if (
            property === 'transform' ||
            property === 'transform-origin' ||
            property === 'translate' ||
            property === 'rotate' ||
            property === 'scale'
        ) {
            continue;
        }

        // Chromium's AUTOPREFIXER. v3's build used autoprefixer and v4's
        // uses Lightning CSS, and the two add different vendor prefixes to
        // the same property list. `-webkit-backdrop-filter` and
        // `backdrop-filter` are the SAME property.
        const stripPrefix = (value) =>
            typeof value === 'string' ? value.replace(/-webkit-/g, '') : value;

        if (stripPrefix(left) === stripPrefix(right)) continue;

        // A property LIST: the two autoprefixers add different vendor
        // prefixes, and Chromium reports the prefixed form as an extra entry.
        // Compare the SET.
        if (property === 'transition-property') {
            const asSet = (value) =>
                [...new Set(String(value).split(',').map((v) => v.trim().replace(/-webkit-/g, '')))].sort().join(',');

            if (asSet(left) === asSet(right)) continue;
        }

        // `rgb(229, 231, 235)` vs `rgb(229,231,235)` — the same colour, a
        // different serialisation.
        const normaliseColour = (value) =>
            typeof value === 'string'
                ? value.replace(/\s*,\s*/g, ',').replace(/\s*\/\s*/g, '/')
                : value;

        if (normaliseColour(left) === normaliseColour(right)) continue;

        // The rendered box, compared with a half-pixel tolerance.
        if (property === '__box') {
            const a1 = String(left).split(',').map(Number);
            const b1 = String(right).split(',').map(Number);

            if (a1.length === b1.length && a1.every((n, i) => Math.abs(n - b1[i]) <= 0.5)) {
                continue;
            }
        }

        if (typeof left === 'string' && typeof right === 'string') {
            const l = normaliseAlpha(left);
            const r = normaliseAlpha(right);
            if (l === r) continue;
        }

        differences.push({ className, property, before: left, after: right });
        byProperty.set(property, (byProperty.get(property) ?? 0) + 1);
    }
}

console.log('computed-style comparison');
console.log('  before:', beforePath, `(${Object.keys(before).length} classes)`);
console.log('  after :', afterPath, `(${Object.keys(after).length} classes)`);
console.log('');

if (differences.length === 0) {
    console.log('IDENTICAL — every class computes to the same style.');
    process.exit(0);
}

console.log(`${differences.length} difference(s) across ${byProperty.size} propert(ies):`);

const sorted = [...byProperty.entries()].sort((a, b) => b[1] - a[1]);
for (const [property, count] of sorted) {
    console.log(`  ${String(count).padStart(5)}  ${property}`);
}

console.log('');
console.log('--- samples ---');

const seen = new Set();
let shown = 0;

for (const difference of differences) {
    if (seen.has(difference.property)) continue;
    seen.add(difference.property);

    if (shown++ >= max) break;

    console.log(`  ${difference.className}`);
    console.log(`      ${difference.property}: before=${difference.before}  after=${difference.after}`);
}

process.exit(1);
