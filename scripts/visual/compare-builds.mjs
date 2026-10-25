#!/usr/bin/env node
/**
 * compare-builds.mjs — compare the committed baseline against the current
 * build, with the codemod's renames applied.
 *
 * WHAT IT ANSWERS
 * ---------------
 * "Did the Tailwind v4 upgrade change the picture?"
 *
 * A textual diff of the two stylesheets cannot answer it: v3 emits `--tw-*`
 * shadow variables and composes `box-shadow` from three shadows, v4 emits
 * `@property` declarations and composes it from five. The two files are
 * structurally different while doing the same work, and a byte count says
 * nothing either (v4's stylesheet is larger and uses FEWER `--tw-` variables).
 *
 * The COMPUTED style is the ground truth. The browser has applied the cascade,
 * resolved the custom properties and evaluated every media query, so two
 * classes that compute the same way paint the same pixels.
 *
 * And the renames matter: the v3 baseline was built from the pre-codemod
 * source, so `shadow-sm` there is v3's 0.05 shadow and `shadow-sm` here is
 * v4's 0.1 shadow. `spec/visual-baseline/renames.json` maps the old names to
 * the new ones so the two sides line up.
 *
 * THE THREE FAILURE CONDITIONS
 * ---------------------------
 *   1. A rendering changed and is NOT on the accepted list. A difference is
 *      only acceptable if it is DECLARED, so a new one cannot slip through.
 *   2. A class the v3 build rendered is GONE from the v4 build. That is a
 *      regression: `bg-opacity-50` was one, and the utility was REMOVED in
 *      v4, so the modal backdrop lost its 50 % black overlay and rendered
 *      fully opaque.
 *   3. The two compilers' baselines disagree about the class list. Not a
 *      failure on its own — reported, so the baseline is not silently stale.
 *
 * USAGE
 *   node scripts/visual/compare-builds.mjs [--css=<path>] [--baseline=<dir>]
 *
 * EXIT CODES
 *   0 — nothing changed that was not accepted
 *   1 — an unaccepted change, or a dropped class
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

const arg = (name, fallback = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const baselineDir = resolve(ROOT, arg('baseline', 'spec/visual-baseline'));
const cssArgument = arg('css');

if (!cssArgument) {
    console.error('Usage: node scripts/visual/compare-builds.mjs --css=<built.css|glob> [--baseline=<dir>]');
    process.exit(2);
}

// THE GLOB IS EXPANDED HERE, NOT BY THE SHELL.
//
// The CI step passes `--css=public/build/assets/app-*.css`, which Windows
// expanded before the script saw it — so it passed locally and failed on the
// runner with `ENOENT: … app-*.css`. A command that only works under one shell
// is a command that works on one machine.
//
// Exactly one match is required: a build emitting two `app-*.css` files is a
// build problem, and picking whichever the directory listing returned first
// would hide it.
function resolveCss(argument) {
    if (!argument.includes('*')) {
        return argument;
    }

    const directory = dirname(argument);
    const pattern = new RegExp(
        '^' + basename(argument).split('').map((ch) => ('.+^${}()|[]\\'.includes(ch) ? '\\' + ch : ch === '*' ? '.*' : ch)).join('') + '$',
    );

    const matches = readdirSync(argument.slice(0, argument.lastIndexOf('/') + 1) || '.')
        .filter((name) => pattern.test(name));

    if (matches.length !== 1) {
        console.error(
            `::error::--css=${argument} matched ${matches.length} file(s); exactly one is required.`,
        );
        process.exit(2);
    }

    return join(directory, matches[0]);
}

const cssPath = resolveCss(cssArgument);

const baselineCss = join(baselineDir, 'tailwind-v3.css');
const baselineSignatures = join(baselineDir, 'computed-v3.json');
const renamesPath = join(baselineDir, 'renames.json');
const acceptedPath = join(baselineDir, 'accepted-differences.json');

for (const path of [baselineCss, baselineSignatures, renamesPath, acceptedPath]) {
    if (!existsSync(path)) {
        console.error(`::error::missing baseline artefact: ${path}`);
        process.exit(2);
    }
}

const renames = JSON.parse(readFileSync(renamesPath, 'utf8'));
delete renames._comment;

/**
 * The differences that are ACCEPTED.
 *
 * A difference is only acceptable if it is DECLARED. The gate fails on any
 * difference that is not on the list, so a new one cannot slip through.
 */
const accepted = JSON.parse(readFileSync(acceptedPath, 'utf8'));
const acceptedClasses = new Set(accepted.classes ?? []);

/**
 * The classes the baseline had that the current build does not, and which are
 * ACCEPTED — because they were RESTRUCTURED, not lost.
 *
 * The `*-opacity-*` utilities were removed in Tailwind v4: `bg-black
 * bg-opacity-50` became `bg-black/50`. The class-by-class probe cannot
 * express that (in v3 the colour and the opacity were two classes; in v4 they
 * are one), so the v3 half is declared here.
 */
const acceptedDropped = new Set(accepted.dropped ?? []);

const baseline = JSON.parse(readFileSync(baselineSignatures, 'utf8'));

// Capture the CURRENT build.
const currentPath = join(ROOT, '.tmp', 'visual', 'current.json');

execFileSync(
    process.execPath,
    [
        join(ROOT, 'scripts', 'visual', 'computed-styles.mjs'),
        `--css=${resolve(ROOT, cssPath)}`,
        `--out=${currentPath}`,
        '--signatures',
    ],
    { cwd: ROOT, stdio: 'inherit' },
);

const current = JSON.parse(readFileSync(currentPath, 'utf8'));

/**
 * The v3 baseline, REKEYED to the v4 names.
 *
 * The renames are the codemod's, and each one renders the same picture in its
 * new form — so the two sides have to line up BY NAME before anything is
 * compared, or every renamed class reads as "a class appeared" and "a class
 * disappeared".
 */
const baselineByName = {};
const renamed = [];
const renamedFrom = new Set();

for (const [v3Name, signature] of Object.entries(baseline)) {
    const v4Name = renames[v3Name] ?? v3Name;

    baselineByName[v4Name] = signature;

    if (renames[v3Name]) {
        renamed.push(`${v3Name} -> ${v4Name}`);
        renamedFrom.add(v3Name);
    }
}

const changed = [];
const added = [];
const dropped = [];

for (const className of Object.keys(current)) {
    const before = baselineByName[className];

    if (before === undefined) {
        added.push(className);
        continue;
    }

    if (before !== current[className]) {
        changed.push(className);
    }
}

// A class the v3 build rendered and the v4 build does not have AT ALL.
//
// A renamed class is NOT dropped: the rekey above moved its signature to the
// new name, so it is compared there. What is left here is a class the v4
// build genuinely lost.
for (const v3Name of Object.keys(baseline)) {
    if (renamedFrom.has(v3Name)) continue;

    const v4Name = renames[v3Name] ?? v3Name;

    if (current[v4Name] === undefined) {
        dropped.push(v3Name);
    }
}

const unaccepted = changed.filter((className) => !acceptedClasses.has(className));
const unacceptedDropped = dropped.filter((className) => !acceptedDropped.has(className));
const noLongerDifferent = [...acceptedClasses].filter((className) => !changed.includes(className));

console.log('');
console.log('visual comparison — the current build against the committed baseline');
console.log(`  classes in the v3 baseline   : ${Object.keys(baseline).length}`);
console.log(`  classes in the current build : ${Object.keys(current).length}`);
console.log(`  renamed by the codemod       : ${renamed.length} (the picture is unchanged for each)`);
console.log(`  renderings that CHANGED      : ${changed.length}`);
console.log(`  classes v3 had, v4 dropped   : ${dropped.length}`);
console.log(`  classes v3 ignored, v4 has   : ${added.length}`);
console.log('');

if (changed.length > 0) {
    console.log('--- renderings that changed ---');
    for (const className of changed) {
        console.log(
            '  ' + className +
            (acceptedClasses.has(className) ? '   (ACCEPTED)' : '   <-- NOT ACCEPTED'),
        );
    }
    console.log('');
}

if (dropped.length > 0) {
    console.log('--- the baseline had them and the current build does not ---');
    for (const className of dropped) {
        console.log('  ' + className + (acceptedDropped.has(className) ? '   (RESTRUCTURED, accepted)' : ''));
    }
    console.log('');
}

if (added.length > 0) {
    console.log('--- classes the baseline did not have (the old build ignored them) ---');
    for (const className of added) console.log('  ' + className);
    console.log('');
}

if (noLongerDifferent.length > 0) {
    console.log('--- accepted differences that no longer differ ---');
    console.log('    These are listed in accepted-differences.json but render the same');
    console.log('    as the baseline now. Trim the list.');
    for (const className of noLongerDifferent) console.log('  ' + className);
    console.log('');
}

if (unaccepted.length === 0 && unacceptedDropped.length === 0) {
    console.log('OK — every class renders as it did in the baseline, apart from the');
    console.log('     differences that are declared in accepted-differences.json.');
    process.exit(0);
}

if (unacceptedDropped.length > 0) {
    console.error(`::error::${unacceptedDropped.length} class(es) the baseline rendered are GONE.`);
    console.error('::error::A renamed class needs a rename-map entry; an unrenamed one');
    console.error('::error::is a regression.');
    for (const className of unacceptedDropped) console.error(`::error::  ${className}`);
    console.error('');
}

if (unaccepted.length > 0) {
    console.error(`::error::${unaccepted.length} rendering(s) changed and are NOT on the`);
    console.error('::error::accepted list. Each one is a visual change, and each one');
    console.error('::error::has to be decided, not discovered.');
    for (const className of unaccepted) console.error(`::error::  ${className}`);
    console.error('');
}

process.exit(1);
