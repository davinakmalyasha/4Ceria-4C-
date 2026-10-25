#!/usr/bin/env node
/**
 * assert-ts-parity.mjs — TypeScript 7 and TypeScript 6 must report the SAME
 * errors.
 *
 * WHY
 * ---
 * TypeScript 7 is the native (Go) port, and it ships NO PROGRAMMATIC API. The
 * whole ecosystem that embeds the compiler — `typescript-eslint` above all —
 * therefore still has to run against the TypeScript 6 API, and Microsoft
 * published a compatibility package for exactly that:
 *
 *   https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
 *   #running-side-by-side-with-typescript-6.0
 *
 * The two compilers run side by side in this repository:
 *
 *   "typescript":         "npm:@typescript/typescript6@6.0.2"   <- the API
 *   "@typescript/native": "npm:typescript@7.0.2"                <- the binary
 *
 * Microsoft states that TypeScript 7 "reports the same errors, locations, and
 * messages as TypeScript 6.0 (with the `stableTypeOrdering` flag on, and
 * without any `noCheck` or `noEmit` flags)".
 *
 * That claim is worth ENFORCING rather than believing. The ratchet counts
 * errors, so a compiler that reported the same COUNT with different ERRORS
 * would pass the ratchet and hide a real regression. This compares the two
 * error lists, line for line.
 *
 * USAGE
 *   node scripts/ci/assert-ts-parity.mjs
 *
 * EXIT CODES
 *   0 — the two compilers agree
 *   1 — they disagree (the difference is printed)
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Run a compiler and return its error lines.
 */
function errorsFor(binary) {
    let output = '';

    try {
        // The compiler is run THROUGH NODE, not executed directly: both
        // `bin/tsc` and `bin/tsc6` are shebang scripts, and Windows cannot
        // execute a shebang file — `execFileSync` would fail with ENOEXEC and
        // the script would report "0 errors" for both compilers, which is a
        // green gate that checks nothing.
        output = execFileSync(process.execPath, [binary, '--noEmit', '-p', 'tsconfig.json'], {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (error) {
        output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    return output
        .split(/\r?\n/)
        .filter((line) => /error TS\d+/.test(line))
        .map((line) => line.trim())
        .sort();
}

console.log('TypeScript parity — the native compiler and the API compiler must agree');

const ts7 = errorsFor(resolve(ROOT, 'node_modules', '@typescript', 'native', 'bin', 'tsc'));
const ts6 = errorsFor(resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc6'));

console.log(`  TypeScript 7 (native) : ${ts7.length} errors`);
console.log(`  TypeScript 6 (API)    : ${ts6.length} errors`);

if (ts7.length === ts6.length && ts7.every((line, i) => line === ts6[i])) {
    console.log('');
    console.log('IDENTICAL — the same errors, in the same places, with the same messages.');
    process.exit(0);
}

const onlyInSeven = ts7.filter((line) => !ts6.includes(line));
const onlyInSix = ts6.filter((line) => !ts7.includes(line));

console.log('');
console.log('DIFFERENT.');

if (onlyInSeven.length > 0) {
    console.log(`  ${onlyInSeven.length} error(s) only TypeScript 7 reports:`);
    for (const line of onlyInSeven.slice(0, 25)) console.log('    ' + line);
    if (onlyInSeven.length > 25) console.log(`    … and ${onlyInSeven.length - 25} more`);
}

if (onlyInSix.length > 0) {
    console.log(`  ${onlyInSix.length} error(s) only TypeScript 6 reports:`);
    for (const line of onlyInSix.slice(0, 25)) console.log('    ' + line);
    if (onlyInSix.length > 25) console.log(`    … and ${onlyInSix.length - 25} more`);
}

console.log('');
console.log('::error::the two compilers disagree. The ratchet counts errors, so a');
console.log('::error::difference in WHICH errors are reported would pass the ratchet');
console.log('::error::and hide a regression. See ADR-0011.');

process.exit(1);
