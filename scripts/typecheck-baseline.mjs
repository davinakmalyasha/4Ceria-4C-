#!/usr/bin/env node
/**
 * TypeScript error-count ratchet.
 *
 * The codebase carries a known pile of pre-existing type errors (legacy peak
 * ~196). Instead of gating builds on a clean `tsc` (which would freeze all
 * work), this script records the current error count in
 * `typecheck-baseline.json` and fails only when NEW errors appear.
 *
 * Usage:
 *   node scripts/typecheck-baseline.mjs            # verify (fails on regression)
 *   node scripts/typecheck-baseline.mjs --update   # intentionally re-baseline
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(root, 'typecheck-baseline.json');
const update = process.argv.includes('--update');

/**
 * The NATIVE compiler, called by path.
 *
 * TypeScript 7 and TypeScript 6 are installed side by side (see ADR-0011):
 * `typescript` is aliased to the TypeScript 6 API so `typescript-eslint` can
 * use it, and `@typescript/native` holds the TypeScript 7 binary.
 *
 * The path is explicit rather than `npx tsc`, because `npx` resolves
 * whichever package happens to own the `tsc` bin — and the whole point of
 * the alias is that the two are different compilers.
 */
const nativeCompiler = resolve(
    root,
    'node_modules',
    '@typescript',
    'native',
    'bin',
    'tsc',
);

/**
 * The compiler must EXIST before the gate trusts its output.
 *
 * A missing script is not a compiler that found nothing: `node` starts, reports
 * "Cannot find module", and exits 1 — which is the same exit code as "the
 * compiler found errors". The ratchet cannot tell them apart from the exit
 * status alone.
 */
if (! existsSync(nativeCompiler)) {
    console.error(`::error::the type-checker is not installed: ${nativeCompiler}`);
    console.error('::error::It did not run. A ratchet that reports success when its');
    console.error('::error::instrument is broken is worse than no ratchet.');
    process.exit(1);
}

let output = '';
let launched = true;

try {
    // `execFileSync`, not `execSync`: the latter goes through the shell, and
    // `process.execPath` lives under `C:\Program Files\...` — the space splits
    // it and the compiler never runs. The script then counted ZERO errors and
    // reported "Typecheck OK" against a baseline of 94, which is a green gate
    // that checks nothing.
    output = execFileSync(process.execPath, [nativeCompiler, '--noEmit'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
    });
} catch (err) {
    // ENOENT means the COMPILER ITSELF could not be started - a different
    // failure from 'the compiler ran and found errors' (which is also a
    // non-zero exit). Only the first is a broken instrument.
    if (err.code === 'ENOENT') {
        launched = false;
    }

    output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
}

const errors = output.split(/\r?\n/).filter((line) => /error TS\d+/.test(line));
const count = errors.length;

/**
 * A compiler that produced NO OUTPUT AT ALL did not run.
 *
 * This is not a theoretical concern. An earlier version of this script
 * invoked the compiler through `execSync(process.execPath, …)`, and
 * `process.execPath` is `C:\Program Files\nodejs\node.exe` — the shell split
 * it on the space, the compiler never started, and the script counted ZERO
 * errors and printed "Typecheck OK: 0 errors (baseline 94)".
 *
 * A ratchet that reports success when its instrument is broken is worse than
 * no ratchet, because it is trusted.
 */
if (!launched) {
    console.error(`::error::the type-checker could not be started: ${nativeCompiler}`);
    console.error('::error::It did not run. A ratchet that reports success when its');
    console.error('::error::instrument is broken is worse than no ratchet.');
    process.exit(1);
}
if (/Cannot find module|Cannot find package|MODULE_NOT_FOUND/i.test(output)) {
    console.error('::error::the type-checker could not be loaded:');
    console.error(output.split(/\r?\n/).slice(0, 6).join('\n'));
    console.error('::error::It did not run. A ratchet that reports success when its');
    console.error('::error::instrument is broken is worse than no ratchet.');
    process.exit(1);
}

if (output.trim() === '') {
    console.error('::error::the type-checker produced no output at all.');
    console.error('::error::It did not run. A ratchet that reports success when its');
    console.error('::error::instrument is broken is worse than no ratchet.');
    process.exit(1);
}

if (update || !existsSync(baselinePath)) {
    writeFileSync(
        baselinePath,
        `${JSON.stringify({ errors: count, updatedAt: new Date().toISOString() }, null, 2)}\n`
    );
    console.log(`Typecheck baseline written: ${count} errors.`);
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (count > baseline.errors) {
    console.error(`Typecheck regression: ${count} errors (baseline ${baseline.errors}).`);
    console.error('Fix the new errors, or re-baseline intentionally with --update.');
    console.error(errors.slice(0, 50).join('\n'));
    process.exit(1);
}

console.log(`Typecheck OK: ${count} errors (baseline ${baseline.errors}).`);
