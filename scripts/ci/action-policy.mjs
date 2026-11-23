#!/usr/bin/env node
/**
 * Supply-chain policy for GitHub Actions.
 *
 *   1. Every `uses:` is pinned to a full 40-hex commit SHA (or a local path).
 *   2. Every workflow service/docker image is pinned by sha256 digest.
 *   3. `pull_request_target` is forbidden.
 *
 * Node rather than Bash so the gate behaves the same on Windows and Linux and
 * cannot silently scan zero entries.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');

const failures = [];
let usesChecked = 0;
let imagesChecked = 0;

function stripComment(line) {
    const index = line.indexOf('#');
    return index === -1 ? line : line.slice(0, index);
}

function checkUses(file, line, index) {
    const match = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/.exec(stripComment(line));
    if (!match) return;

    const ref = match[1].replace(/^['"]|['"]$/g, '');
    if (ref === '') return;

    usesChecked += 1;

    if (ref.startsWith('./')) return;

    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+@[0-9a-f]{40}$/.test(ref)) {
        failures.push(`${file}:${index} — uses: ${ref} is not pinned to a 40-hex commit SHA`);
    }
}

function checkImage(file, line, index) {
    const match = /^\s*image:\s*(.+?)\s*$/.exec(stripComment(line));
    if (!match) return;

    const ref = match[1].replace(/^['"]|['"]$/g, '');
    imagesChecked += 1;

    if (!/@sha256:[0-9a-f]{64}$/.test(ref)) {
        failures.push(`${file}:${index} — image ${ref} is not pinned by digest`);
    }
}

function checkDockerRun(file, logicalLine, index) {
    if (!logicalLine.includes('docker run')) return;

    // A `docker run` line must name a digest-pinned image. This deliberately
    // fails closed: volume mounts are quoted and contain no sha256 digest.
    if (!/@sha256:[0-9a-f]{64}/.test(logicalLine)) {
        failures.push(`${file}:${index} — docker run has no digest-pinned image`);
    }
    imagesChecked += 1;
}

let workflows;
try {
    workflows = readdirSync(WORKFLOW_DIR).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
} catch {
    console.log('No .github/workflows directory — nothing to check.');
    process.exit(0);
}

for (const name of workflows) {
    const path = join(WORKFLOW_DIR, name);
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);

    let joined = '';

    lines.forEach((line, index) => {
        checkUses(name, line, index + 1);
        checkImage(name, line, index + 1);

        if (joined !== '') {
            joined += ' ' + line.trim();
        } else {
            joined = line.trim();
        }

        if (/\\\s*$/.test(joined)) {
            joined = joined.replace(/\\\s*$/, '');
            return;
        }

        checkDockerRun(name, joined, index + 1);
        joined = '';

        if (/^\s*pull_request_target\s*:/.test(line)) {
            failures.push(`${name}:${index + 1} — pull_request_target runs fork code with repository secrets`);
        }
    });
}

if (usesChecked === 0) {
    failures.push('the scanner found no uses: entries — it is broken, not the workflow');
}

if (imagesChecked === 0) {
    failures.push('the scanner found no images — it is broken, not the workflow');
}

if (failures.length > 0) {
    console.error('ACTION POLICY VIOLATED');
    for (const failure of failures) console.error(`  ::error::${failure}`);
    process.exit(1);
}

console.log(`action policy OK (${usesChecked} actions, ${imagesChecked} images)`);
