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
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(root, 'typecheck-baseline.json');
const update = process.argv.includes('--update');

let output = '';
try {
    output = execSync('npx tsc --noEmit', {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
} catch (err) {
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
}

const errors = output.split(/\r?\n/).filter((line) => /error TS\d+/.test(line));
const count = errors.length;

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
