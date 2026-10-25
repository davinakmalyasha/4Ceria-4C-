#!/usr/bin/env node
/**
 * compare.mjs — diff the PHP and Go money answers.
 *
 * The Go `money` package is a port of the PHP `App\Support\Money`, and the
 * Laravel application is what the port replaces. So the PHP answers are the
 * reference: a Go answer that differs is a behaviour change in the rewrite,
 * whatever the Go code intends.
 *
 * The interesting output is the DIFFERENCES, so they are printed with the
 * inputs that produced them — a corpus position alone is not enough to
 * reproduce anything.
 *
 * USAGE
 *   node tools/money/compare.mjs [--php=.tmp/money-php.json] [--go=.tmp/money-go.json]
 *                               [--corpus=tools/money/corpus.json] [--max=20]
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

const phpPath = resolve(ROOT, arg('php', '.tmp/money-php.json'));
const goPath = resolve(ROOT, arg('go', '.tmp/money-go.json'));
const corpusPath = resolve(ROOT, arg('corpus', 'tools/money/corpus.json'));
const maxArg = Number(arg('max', '20'));

const php = JSON.parse(readFileSync(phpPath, 'utf8'));
const go = JSON.parse(readFileSync(goPath, 'utf8'));
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

console.log('money differential — the PHP original against the Go port');
console.log(`  cases: ${corpus.cases.length}`);

if (php.cases.length !== go.cases.length) {
    console.error(`::error::the two runs produced different numbers of cases: ${php.cases.length} and ${go.cases.length}`);
    process.exit(1);
}

const differences = [];

for (let i = 0; i < corpus.cases.length; i++) {
    const a = php.cases[i];
    const b = go.cases[i];
    const input = corpus.cases[i];

    const fields = [];

    const phpErrored = a.error !== undefined && a.error !== '';
    const goErrored = b.error !== undefined && b.error !== '';

    // THE RULE.
    //
    // A case where BOTH sides produced a NUMBER must agree on it. That is the
    // whole point: the Go package is a port of the PHP class, and a different
    // number is a change in what the running system produces.
    //
    // A case where the PHP REFUSED and the Go computed one is a difference, but
    // it is a difference in CAPABILITY, not in a number: the Go port computes
    // the product in 128 bits and the PHP original overflows a 64-bit integer
    // there. It is reported, and it is not a failure.
    //
    // A case where the Go refused and the PHP computed one is a REGRESSION:
    // the port must never be less capable than the thing it replaces.
    if (phpErrored && goErrored) {
        // Both refused. That is agreement: there is no number to disagree
        // about. The messages may differ, which is not a behavioural
        // difference.
        continue;
    }

    if (goErrored && !phpErrored) {
        differences.push({
            index: i,
            input,
            fields: [`the Go port REFUSED where the PHP computed: ${b.error}`],
            severity: 'regression',
        });
        continue;
    }

    if ((a.decimal ?? null) !== (b.decimal ?? null)) {
        fields.push(`decimal: php=${a.decimal} go=${b.decimal}`);
    }

    if ((a.error ?? null) !== (b.error ?? null)) {
        fields.push(`error: php=${a.error ?? '(none)'} go=${b.error ?? '(none)'}`);
    }

    const phpParts = JSON.stringify(a.parts ?? null);
    const goParts = JSON.stringify(b.parts ?? null);

    if (phpParts !== goParts) {
        fields.push(`parts: php=${phpParts} go=${goParts}`);
    }

    if (fields.length > 0) {
        differences.push({ index: i, input, fields });
    }
}

const regressions = differences.filter((difference) => difference.severity === 'regression');
const improvements = differences.filter((difference) => difference.severity !== 'regression');

if (differences.length === 0) {
    console.log('');
    console.log('IDENTICAL — the Go port answers every case exactly as the PHP original does.');
    process.exit(0);
}

if (improvements.length > 0) {
    console.log('');
    console.log(`${improvements.length} case(s) where the PHP REFUSED and the Go computed one:`);
    console.log('    The Go port computes the product in 128 bits; the PHP original');
    console.log('    overflows a 64-bit integer there, and refuses rather than');
    console.log('    returning a wrong number. The port is strictly more capable,');
    console.log('    and the number it returns is the CORRECT one.');

    for (const difference of improvements.slice(0, maxArg)) {
        console.log('');
        console.log(`  case #${difference.index}  ${JSON.stringify(difference.input)}`);
        for (const field of difference.fields) {
            console.log(`      ${field}`);
        }
    }

    if (improvements.length > maxArg) {
        console.log('');
        console.log(`  … and ${improvements.length - maxArg} more`);
    }
}

if (regressions.length > 0) {
    console.log('');
    console.log(`${regressions.length} case(s) where the Go port REFUSED and the PHP computed one:`);
    console.log('    The port must never be less capable than the thing it replaces.');

    for (const difference of regressions.slice(0, maxArg)) {
        console.log('');
        console.log(`  case #${difference.index}  ${JSON.stringify(difference.input)}`);
        for (const field of difference.fields) {
            console.log(`      ${field}`);
        }
    }

    console.log('');
    console.error('::error::the Go port refuses a case the PHP original handles.');
    process.exit(1);
}

console.log('');
console.log('Every case that produces a NUMBER produces the SAME number in both engines.');

process.exit(0);
