#!/usr/bin/env node
/**
 * compare.mjs — diff the PHP and Go JSON encodings.
 *
 * The Go `jsonphp` package is a port of PHP's `json_encode` with the
 * default flags, and the Laravel application is what the port replaces. So
 * the PHP answers are the reference: a Go answer that differs in the BYTES
 * is a response body that would have changed.
 *
 * WHY BYTES AND NOT PARSED JSON
 * -----------------------------
 * Every difference the corpus exists to find is INVISIBLE to a comparison
 * that parses the JSON first:
 *
 *   - PHP escapes the forward slash and Go does not;
 *   - PHP escapes every non-ASCII character as \uXXXX and Go emits raw
 *     UTF-8;
 *   - PHP has one-character escapes for \b and \f and Go does not;
 *   - PHP prints an array's keys in insertion order and Go sorts a map's;
 *   - PHP's float formatting has its own thresholds and its own shapes.
 *
 * All five produce the same JSON and different bytes. So the comparison is
 * a string comparison, and the DIFFERENCES are printed with the input that
 * produced them — a corpus position alone is not enough to reproduce
 * anything.
 *
 * USAGE
 *   node tools/json/compare.mjs [--php=.tmp/json-php.json] [--go=.tmp/json-go.json]
 *                               [--corpus=tools/json/corpus.json] [--max=20]
 *
 * EXIT CODES
 *   0 — the two implementations agree
 *   1 — they differ
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const arg = (name, fallback) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const phpPath = resolve(ROOT, arg('php', '.tmp/json-php.json'));
const goPath = resolve(ROOT, arg('go', '.tmp/json-go.json'));
const corpusPath = resolve(ROOT, arg('corpus', 'tools/json/corpus.json'));
const maxArg = Number(arg('max', '20'));

const php = JSON.parse(readFileSync(phpPath, 'utf8'));
const go = JSON.parse(readFileSync(goPath, 'utf8'));
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

console.log('json differential — the PHP original against the Go port');
console.log(`  cases: ${corpus.cases.length}`);

if (php.cases.length !== go.cases.length) {
    console.error(`::error::the two runs produced different numbers of cases: ${php.cases.length} and ${go.cases.length}`);
    process.exit(1);
}

const differences = [];

for (let i = 0; i < php.cases.length; i++) {
    const expected = php.cases[i].encoded;
    const actual = go.cases[i].encoded;

    if (expected === actual) continue;

    differences.push({
        index: i,
        case: corpus.cases[i],
        php: expected,
        go: actual,
    });
}

if (differences.length === 0) {
    console.log('');
    console.log('The two encoders agree on every case, byte for byte.');
    process.exit(0);
}

console.log('');
console.log(`  ${differences.length} case(s) differ:`);

for (const difference of differences.slice(0, maxArg)) {
    const input = JSON.stringify(difference.case).slice(0, 220);

    console.log(`    #${difference.index}  ${input}`);
    console.log(`      php: ${difference.php === null ? '<failed>' : difference.php}`);
    console.log(`      go : ${difference.go === null ? '<failed>' : difference.go}`);
}

if (differences.length > maxArg) {
    console.log(`    … and ${differences.length - maxArg} more`);
}

console.error('');
console.error('::error::the two JSON encoders do not agree. A response body that');
console.error('::error::differs in its BYTES is a change a client can see, even');
console.error('::error::though the JSON parses to the same value.');

process.exit(1);
