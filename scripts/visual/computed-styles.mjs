#!/usr/bin/env node
/**
 * computed-styles.mjs — the COMPUTED STYLE of every utility class the
 * application uses, captured from a real browser.
 *
 * WHY THIS EXISTS
 * ---------------
 * A Tailwind upgrade is a visual change until it is proven otherwise, and
 * comparing the two built stylesheets does NOT prove it:
 *
 *   - v3 emits `--tw-*` shadow variables and composes `box-shadow` from them;
 *     v4 emits `@property` declarations and native custom properties and
 *     composes it directly. The two stylesheets are structurally different
 *     while doing the same work, so a textual diff reports thousands of
 *     "differences" that are all noise.
 *   - A byte count is not a signal either.
 *
 * The COMPUTED style is the ground truth. The browser has already applied the
 * cascade, resolved the custom properties, expanded the shadow variables and
 * evaluated every media and container query. If the computed style of
 * `.shadow-sm` is the same before and after, the pixels are the same.
 *
 * The same harness answers the question for the WHOLE REWRITE: render the
 * Laravel build's computed styles and the Next.js build's computed styles and
 * compare them. That is the visual-parity contract, measured rather than
 * asserted.
 *
 * WHAT IS CAPTURED
 * ----------------
 * Every class token the application actually uses, each on its own element,
 * with the properties that can change a pixel. Layout-independent noise
 * (the element's own geometry) is excluded.
 *
 * USAGE
 *   node scripts/visual/computed-styles.mjs --css=<path> --out=<path>
 *   node scripts/visual/computed-styles.mjs --css=<path> --out=<path> --classes=a,b,c
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { normaliseProperty } from './normalize.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

function arg(name, fallback = null) {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}

const cssPath = arg('css');
const outPath = arg('out');
const only = arg('classes');
/**
 * Write a SIGNATURE per class instead of the whole computed style.
 *
 * The full dump is 12 MB — too big to commit. A signature is a hash of the
 * class's canonical computed style, so the committed baseline is ~250 kB and
 * the comparison still says EXACTLY which classes changed.
 */
const signaturesOnly = process.argv.includes('--signatures');

if (!cssPath || !outPath) {
    console.error('Usage: node scripts/visual/computed-styles.mjs --css=<path> --out=<path> [--classes=a,b]');
    process.exit(2);
}

/**
 * The properties that can change a pixel.
 *
 * Deliberately excludes geometry (`width`, `height`, `top`, …) — those depend
 * on the element's box, not on the class — and includes everything that
 * changes how something LOOKS.
 */
const PROPERTIES = [
    'color',
    'background-color',
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    'background-clip',
    'background-origin',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'box-shadow',
    'text-shadow',
    'outline-color', 'outline-style', 'outline-width', 'outline-offset',
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric',
    'letter-spacing', 'line-height', 'word-spacing', 'text-align', 'text-decoration-line',
    'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness',
    'text-transform', 'text-indent', 'text-overflow', 'text-shadow-color',
    'vertical-align', 'white-space', 'word-break', 'overflow-wrap', 'hyphens',
    'opacity',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'gap', 'row-gap', 'column-gap',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
    'flex-direction', 'align-items', 'align-content', 'align-self', 'justify-content',
    'justify-items', 'justify-self', 'order',
    'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-auto-columns',
    'grid-auto-rows', 'grid-column', 'grid-row', 'grid-column-start', 'grid-column-end',
    'grid-row-start', 'grid-row-end',
    'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'display', 'visibility', 'overflow-x', 'overflow-y',
    'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'float', 'clear',
    'list-style-type', 'list-style-position',
    'table-layout', 'border-collapse', 'border-spacing',
    'transform', 'transform-origin',
    // Tailwind v4 composes a transform from the INDIVIDUAL `translate`,
    // `rotate` and `scale` properties rather than from `transform`. A capture
    // that only reads `transform` sees `none` for every v4 rotate utility, and
    // would report a difference where there is none.
    'translate', 'rotate', 'scale',
    'transition-property', 'transition-duration', 'transition-timing-function',
    'animation-name', 'animation-duration', 'animation-timing-function',
    'mix-blend-mode', 'isolation', 'filter', 'backdrop-filter',
    'object-fit', 'object-position',
    'resize', 'appearance', 'caret-color', 'cursor',
    'fill', 'stroke', 'stroke-width',
    'aspect-ratio', 'content',
];

/**
 * The class names the STYLESHEET defines.
 *
 * Reading them out of the source is unreliable: the class names live in
 * template literals, in `clsx()` calls and in string concatenations, and a
 * regex over the source produces fragments of code (`bg-,`, `!activeTab`)
 * alongside real class names. The first version of this script collected
 * 2 991 "classes" of which a large fraction were not classes at all.
 *
 * The stylesheet is the authoritative answer: a class is in it if the
 * framework generated a rule for it. The two sides are compared over the same
 * list, and the list is the union of the two stylesheets' selectors, so a
 * class that only one side defines is still measured.
 *
 * The extraction reads SELECTORS ONLY — the text between a `}` and the next
 * `{`. Reading the whole file picks up fragments of DECLARATIONS too: a
 * minified `width:12.5rem` contributes a `.12`, a `url(https://…)` contributes
 * a `.com`, and `display:contents` contributes a `.contents`. Those are not
 * classes, and measuring them would report differences that do not exist.
 */
function collectClasses(stylesheet) {
    const found = new Set();

    // The selector part of every rule: everything after a `{` or a `}` and up
    // to the next `{`.
    //
    // The `{` matters as much as the `}`. Tailwind v4 puts every responsive
    // variant inside an `@media` block, so the FIRST rule of every media
    // query follows a `{` — and a pattern that only accepts `}` (or the start
    // of the file) misses all of them. That is how `sm:right-20` and
    // `hover:translate-x-0.5` came to be reported as "the v3 build had them
    // and the v4 build does not", when the v4 build had them in a media query
    // and the extractor had never looked there.
    const selectorBlocks = stylesheet.matchAll(/(?:^|[{}])([^{}@]+)\{/g);

    for (const block of selectorBlocks) {
        for (const match of block[1].matchAll(/\.((?:[^\s.,:>+~()[\]{}"'\\]|\\.)+)/g)) {
            const raw = match[1];

            // Unescape the CSS escapes.
            const unescaped = raw.replace(/\\(.)/g, '$1');

            if (!/^[A-Za-z0-9!@_][A-Za-z0-9!@_:\-\[\]\/.%#(),+>~*]*$/.test(unescaped)) continue;
            if (unescaped.length > 120) continue;

            found.add(unescaped);
        }
    }

    return [...found].sort();
}

const stylesheet = readFileSync(cssPath, 'utf8');

let classes = collectClasses(stylesheet);

if (only) {
    const wanted = new Set(only.split(',').map((c) => c.trim()));
    classes = classes.filter((c) => wanted.has(c));
}

console.log(`capturing computed styles for ${classes.length} classes`);

/**
 * The fixture.
 *
 * Every class on its own element, inside a container that reproduces the
 * context the application renders in: the project's own reset, the body font,
 * and the theme. Each element is identified so the capture can be read back.
 */
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>${stylesheet}</style>
<style>
  html { font-family: Figtree, ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; }
  /*
   * Each probe is taken OUT OF FLOW.
   *
   * Stacked block elements share a document: if ONE of them is a different
   * height, every element below it moves, and the comparison then reports
   * thousands of differences that are one element's fault. Absolute
   * positioning gives every probe its own origin, so a measured box is that
   * element's own box.
   */
  .probe { display: block; position: absolute; top: 0; left: 0; }
</style>
</head>
<body>
<div id="probe-root">
${classes
    .map(
        (c, i) =>
            `<span id="p${i}" class="probe ${c.replace(/"/g, '&quot;')}">probe</span>`,
    )
    .join('\n')}
</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.setContent(html, { waitUntil: 'load' });

const captured = await page.evaluate(
    ({ count, properties }) => {
        const result = {};

        // COLOUR NORMALISATION.
        //
        // Tailwind v3 emits `rgb(229, 231, 235)` and v4 emits
        // `oklch(0.928 0.006 264.531)` for the SAME colour. A raw string
        // comparison would report every element in the application as
        // different, and the report would be worthless.
        //
        // Painting the colour into a canvas and reading the pixel back
        // converts it to sRGB, which is what the display actually consumes.
        // Two colours that differ only in their colour SPACE then compare
        // equal — and two that genuinely differ do not.
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true });

        const COLOR_PROPERTIES = new Set([
            'color',
            'background-color',
            'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
            'outline-color',
            'text-decoration-color',
            'caret-color',
            'fill',
            'stroke',
        ]);

        const toSrgb = (value) => {
            if (!value || value === 'transparent' || value === 'none' || value === 'currentcolor') {
                return value;
            }
            try {
                context.clearRect(0, 0, 1, 1);
                context.fillStyle = '#000000';
                context.fillStyle = value;
                // A gradient or an invalid value leaves the fill as the
                // previous colour, so anything that is not a plain colour is
                // returned unchanged.
                context.fillRect(0, 0, 1, 1);
                const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
                if (a === 0) return 'transparent';
                return `rgb(${r}, ${g}, ${b}${a === 255 ? '' : ` / ${(a / 255).toFixed(4)}`})`;
            } catch {
                return value;
            }
        };

        for (let i = 0; i < count; i++) {
            const element = document.getElementById(`p${i}`);
            if (!element) continue;

            const computed = getComputedStyle(element);
            const values = {};

            for (const property of properties) {
                const value = computed.getPropertyValue(property);
                if (value === undefined || value === null || value === '') continue;

                values[property] = COLOR_PROPERTIES.has(property) ? toSrgb(value.trim()) : value.trim();
            }

            // The RENDERED GEOMETRY.
            //
            // A transform is the one thing whose computed value does not say
            // what is drawn: v3 wrote `transform: rotate(6deg)` and v4 writes
            // `rotate: 6deg`, and the two compose differently in the string
            // while painting the same pixels. The bounding box is what the
            // browser actually laid out, so it is the thing to compare.
            const box = element.getBoundingClientRect();
            values['__box'] = [
                box.x, box.y, box.width, box.height,
            ].map((n) => Math.round(n * 100) / 100).join(',');

            result[element.className.replace(/^probe /, '')] = values;
        }

        return result;
    },
    { count: classes.length, properties: PROPERTIES },
);

await browser.close();

if (signaturesOnly) {
    const { createHash } = await import('node:crypto');

    const signatures = {};

    for (const [className, values] of Object.entries(captured)) {
        // The signature is over the NORMALISED style, so it says "the picture
        // changed" rather than "the text changed". The same normalisers the
        // comparison uses, so the baseline and the report cannot disagree.
        const canonical = Object.keys(values)
            .sort()
            .map((property) => `${property}:${normaliseProperty(property, values[property], values)}`)
            .join(';');

        signatures[className] = createHash('sha256').update(canonical).digest('hex').slice(0, 16);
    }

    writeFileSync(outPath, JSON.stringify(signatures, null, 2) + '\n');

    console.log(`wrote ${Object.keys(signatures).length} signatures to ${relative(ROOT, outPath) || outPath}`);

    process.exit(0);
}

writeFileSync(outPath, JSON.stringify(captured, null, 2) + '\n');

console.log(`wrote ${Object.keys(captured).length} entries to ${relative(ROOT, outPath) || outPath}`);
