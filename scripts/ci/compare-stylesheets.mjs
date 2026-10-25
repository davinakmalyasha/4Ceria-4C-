#!/usr/bin/env node
/**
 * compare-stylesheets.mjs — rule-level diff between two built stylesheets.
 *
 * WHY
 * ---
 * A Tailwind upgrade is a VISUAL change until proven otherwise. The build
 * succeeding says nothing: the v3 build and the v4 build both succeed, and
 * both produce a stylesheet with thousands of rules.
 *
 * This compares them at the level that matters: the SELECTOR and its
 * DECLARATIONS. A rule that exists in one and not the other, or whose
 * declarations differ, is a potential pixel change — and it is listed.
 *
 * The byte count is not a signal. Tailwind v4 emits `@property` rules and
 * native CSS custom properties where v3 emitted `--tw-*` shadow variables, so
 * the v4 stylesheet is larger and uses FEWER `--tw-` variables while doing
 * the same work. Comparing byte counts would have reported a change and
 * taught nobody anything.
 *
 * USAGE
 *   node scripts/ci/compare-stylesheets.mjs <before.css> <after.css> [--max=40]
 *
 * EXIT CODES
 *   0 — no differences
 *   1 — differences found (the report is printed)
 */

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const maxArg = args.find((a) => a.startsWith('--max='));
const max = maxArg ? Number(maxArg.split('=')[1]) : 40;

if (files.length !== 2) {
    console.error('Usage: node scripts/ci/compare-stylesheets.mjs <before.css> <after.css> [--max=N]');
    process.exit(2);
}

const [beforePath, afterPath] = files;

/**
 * Flatten a stylesheet into a map of `selector` -> `declarations`.
 *
 * The input is minified Tailwind output, so a brace-matching scan is enough
 * and a full CSS parser would only add ways to be wrong. At-rules with a
 * block (`@media`, `@supports`, `@layer`) are kept as part of the selector
 * path, so a rule that moved from the top level into a media query is
 * reported as a difference rather than silently disappearing.
 */
function parse(css) {
    const rules = new Map();
    const stack = [];
    let buffer = '';
    let i = 0;

    const flush = (selector, body) => {
        const key = [...stack, selector].join(' >> ');
        const declarations = body
            .split(';')
            .map((d) => d.trim())
            .filter(Boolean)
            .sort()
            .join('; ');

        // The same selector can appear more than once (a utility and a
        // fallback). Keep them all, in order.
        if (!rules.has(key)) rules.set(key, []);
        rules.get(key).push(declarations);
    };

    while (i < css.length) {
        const ch = css[i];

        if (ch === '{') {
            const selector = buffer.trim();
            buffer = '';

            // Find the matching close brace.
            let depth = 1;
            let j = i + 1;
            while (j < css.length && depth > 0) {
                if (css[j] === '{') depth++;
                else if (css[j] === '}') depth--;
                j++;
            }

            const body = css.slice(i + 1, j - 1);

            if (selector.startsWith('@')) {
                // A block at-rule: descend.
                if (body.includes('{')) {
                    stack.push(selector);
                    i = j;
                    continue;
                }
                // A statement at-rule (`@charset`, `@import`, `@layer x;`).
                flush(selector, body);
            } else {
                flush(selector, body);
            }

            i = j;
            continue;
        }

        if (ch === '}') {
            stack.pop();
            buffer = '';
            i++;
            continue;
        }

        if (ch === '"' || ch === "'") {
            // Skip a string literal.
            const quote = ch;
            buffer += ch;
            i++;
            while (i < css.length) {
                buffer += css[i];
                if (css[i] === '\\') {
                    buffer += css[i + 1] ?? '';
                    i += 2;
                    continue;
                }
                if (css[i] === quote) {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }

        buffer += ch;
        i++;
    }

    return rules;
}

const before = parse(readFileSync(beforePath, 'utf8'));
const after = parse(readFileSync(afterPath, 'utf8'));

const onlyBefore = [];
const onlyAfter = [];
const changed = [];

for (const [key, decls] of before) {
    if (!after.has(key)) {
        onlyBefore.push(key);
        continue;
    }

    const other = after.get(key);
    const a = decls.join(' || ');
    const b = other.join(' || ');

    if (a !== b) {
        changed.push({ key, before: a, after: b });
    }
}

for (const key of after.keys()) {
    if (!before.has(key)) onlyAfter.push(key);
}

const total = onlyBefore.length + onlyAfter.length + changed.length;

console.log('stylesheet comparison');
console.log('  before:', beforePath, `(${before.size} rule groups)`);
console.log('  after :', afterPath, `(${after.size} rule groups)`);
console.log('');

if (total === 0) {
    console.log('IDENTICAL — every rule matches, and no rule was added or removed.');
    process.exit(0);
}

console.log(`${total} difference(s):`);
console.log(`  ${onlyBefore.length} only in the BEFORE`);
console.log(`  ${onlyAfter.length} only in the AFTER`);
console.log(`  ${changed.length} changed declarations`);
console.log('');

const show = (label, list) => {
    if (list.length === 0) return;
    console.log(`--- ${label} (${list.length}) ---`);
    for (const key of list.slice(0, max)) {
        console.log('  ' + key.replace(/ >> /g, '  {  '));
    }
    if (list.length > max) {
        console.log(`  … and ${list.length - max} more`);
    }
    console.log('');
};

show('ONLY IN THE BEFORE', onlyBefore);
show('ONLY IN THE AFTER', onlyAfter);

if (changed.length > 0) {
    console.log(`--- CHANGED DECLARATIONS (${changed.length}) ---`);
    for (const { key, before: b, after: a } of changed.slice(0, max)) {
        console.log('  ' + key.replace(/ >> /g, '  {  '));
        console.log('      before: ' + b.slice(0, 240));
        console.log('      after : ' + a.slice(0, 240));
    }
    if (changed.length > max) {
        console.log(`  … and ${changed.length - max} more`);
    }
}

process.exit(1);
