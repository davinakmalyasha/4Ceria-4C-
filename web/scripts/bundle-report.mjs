#!/usr/bin/env node
/**
 * bundle-report.mjs — a dependency-free size check for the built PWA.
 *
 * Turbopack's build manifest does not expose a per-route chunk list, so this
 * reports what can be measured honestly: the total first-party JavaScript in
 * `.next/static/chunks`, the root main files the layout always loads, and the
 * ten largest chunks. Run it after `npm run build`.
 *
 * USAGE
 *   npm run analyze
 *   node scripts/bundle-report.mjs --budget-kb=2048
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = join(WEB, '.next');
const CHUNKS = join(NEXT, 'static', 'chunks');

function arg(name, fallback) {
    const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}

const budgetKb = Number(arg('budget-kb', '2048'));
if (!Number.isFinite(budgetKb) || budgetKb <= 0) {
    process.stderr.write('bundle-report: --budget-kb must be a positive number\n');
    process.exit(1);
}

function kb(bytes) {
    return `${(bytes / 1024).toFixed(1)} kB`;
}

let entries;
try {
    entries = readdirSync(CHUNKS)
        .filter((name) => name.endsWith('.js'))
        .map((name) => ({
            name,
            bytes: statSync(join(CHUNKS, name)).size,
        }));
} catch {
    process.stderr.write('bundle-report: .next/static/chunks is absent; run `npm run build` first\n');
    process.exit(1);
}

const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);

let rootBytes = 0;
try {
    const manifest = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));
    for (const file of manifest.rootMainFiles ?? []) {
        try {
            rootBytes += statSync(join(NEXT, file)).size;
        } catch {
            // A manifest entry can name a shared chunk that was inlined
            // elsewhere; ignore it rather than failing the report.
        }
    }
} catch {
    process.stderr.write('bundle-report: build-manifest.json is absent\n');
}

process.stdout.write(`first-party JS: ${kb(total)} across ${entries.length} chunks\n`);
process.stdout.write(`root main JS:   ${kb(rootBytes)}\n`);
process.stdout.write('largest chunks:\n');
for (const entry of entries.sort((a, b) => b.bytes - a.bytes).slice(0, 10)) {
    process.stdout.write(`  ${kb(entry.bytes).padStart(10)}  ${entry.name}\n`);
}

const totalKb = total / 1024;
if (totalKb > budgetKb) {
    process.stderr.write(
        `bundle-report: ${totalKb.toFixed(1)} kB exceeds the ${budgetKb} kB budget\n`,
    );
    process.exit(1);
}

process.stdout.write(`bundle-report: within the ${budgetKb} kB budget\n`);
