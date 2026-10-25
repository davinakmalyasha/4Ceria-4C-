#!/usr/bin/env node
/**
 * generate-corpus.mjs — the JSON encoding differential corpus.
 *
 * WHY
 * ---
 * The Go `jsonphp` package is a PORT of PHP's `json_encode` with the
 * default flags. A port is only faithful if it produces the same BYTES for
 * the same values, and the bytes are where the two engines differ:
 *
 *   - PHP escapes the forward slash and Go does not;
 *   - PHP escapes every non-ASCII character as \uXXXX and Go emits raw
 *     UTF-8;
 *   - PHP has one-character escapes for \b and \f and Go does not;
 *   - PHP prints an array's keys in insertion order and Go sorts a map's;
 *   - PHP's float formatting has its own thresholds and its own shapes
 *     (`1.0e+21`, `1.0e-7`, `1` for 1.0) and Go's are different.
 *
 * Every one of those is invisible to a comparison that parses the JSON
 * first, and the rewrite's contract is about bytes.
 *
 * So the two encoders are run over the SAME corpus and their outputs are
 * diffed BYTE FOR BYTE. That is the check the CI job `json-diff` runs.
 *
 * The corpus deliberately includes the cases where the two COULD disagree:
 * the characters PHP escapes and Go does not, the float boundaries around
 * PHP's `decpt > 17` and `decpt <= -4` thresholds, the astral-plane
 * characters that need a surrogate pair, and the key orders that a sorted
 * map would reorder.
 *
 * USAGE
 *   node tools/json/generate-corpus.mjs [--count=2000] [--out=tools/json/corpus.json]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const arg = (name, fallback) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const count = Number(arg('count', '2000'));
const outPath = resolve(ROOT, arg('out', 'tools/json/corpus.json'));

/**
 * A DETERMINISTIC pseudo-random generator.
 *
 * A corpus that changes on every run cannot be a baseline: a failure would
 * be unreproducible, and a diff would be noise. This is a fixed-seed
 * xorshift, so the corpus is the same file forever.
 */
let state = 0x9e3779b9;

function next() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
}

function pick(list) {
    return list[Math.floor(next() * list.length)];
}

function intBetween(low, high) {
    return low + Math.floor(next() * (high - low + 1));
}

/**
 * The characters that the two encoders treat differently.
 *
 * Each one is here because PHP and Go disagree about it, or because a
 * naive implementation gets it wrong.
 */
const CHARACTERS = [
    // The characters PHP escapes and Go does not.
    '/', '//', 'a/b/c', 'https://example.test/api/projects?page=1',
    // The characters Go escapes and PHP does not.
    '<', '>', '&', '<b>bold</b>', 'a&b=c', '<script>alert(1)</script>',
    // The quotes and the backslash.
    '"', '\\', 'he said "hi"', 'a\\b', 'mixed "\\" both',
    // The control characters, and the two with a short escape.
    '\b', '\f', '\n', '\r', '\t', '\v', '\0', '\x01', '\x1f', '\x7f',
    // The non-ASCII characters PHP escapes as \uXXXX.
    'é', 'ü', 'ñ', 'ß', 'Ω', 'Ж', 'א', 'العربية', '测试', '日本語',
    // The astral-plane characters, which need a SURROGATE PAIR.
    '👍', '🚀', '𝄞', '👨‍👩‍👧‍👦',
    // The combination of the two.
    'a/b é <b>', 'Rp 1.500.000 — <strong>test</strong>',
    'https://4ceria.test/api/projects/1?tab=bids&x=<>&y="z"',
    // The empty string and the single characters.
    '', 'a', '/', '<', '&', 'é', '👍',
];

/**
 * The float boundaries around PHP's own thresholds.
 *
 * PHP's `zend_gcvt` uses the exponential form when `decpt <= -4` or
 * `decpt > 17`, and the thresholds are the ones the encoder has to match
 * exactly. These sit on and around them.
 */
const FLOATS = [
    0, 0.0, -0.0, 1, 1.0, -1.0, 1.5, -1.5, 0.1, -0.1, 0.5,
    100, 1000, 5500000, 5500000.5, 123456.789,
    0.0001, 0.00001, 0.000123, 1.5e-5, 1e-4, 1e-5, 1e-6, 1e-7,
    1e15, 1e16, 1e17, 1e18, 1e20, 1e21, 1e22, 1e100, 1e-300, 1e308,
    1.2345678901234568e17, 1.2345678901234568e20, 9.999999999999999e15,
    1.7976931348623157e308, 5e-324, 2.2250738585072014e-308,
    1 / 3, 2 / 3, 1e6, 1e7, 123456789012345678901,
    0.30000000000000004, 1.0000000000000002, 4.35, 1.005, 2.675,
    -1e21, -1e-7, -0.0, -1.5e300,
];

/**
 * The key orders a sorted map would reorder.
 *
 * The legacy API puts `message` before `data` in most of its bodies, and a
 * sorted map would put `data` first. Every one of these has a key order
 * that sorting would change.
 */
const KEY_ORDERS = [
    ['message', 'data'],
    ['data', 'message'],
    ['message', 'errors', 'data'],
    ['success', 'status', 'data', 'message'],
    ['data', 'links', 'meta'],
    ['meta', 'links', 'data'],
    ['current_page', 'data', 'first_page_url', 'from', 'last_page', 'total'],
    ['z', 'a', 'm'],
    ['id', 'name', 'created_at', 'updated_at'],
    ['message'],
    ['errors'],
];

const cases = [];

// 1. Plain strings.
for (const value of CHARACTERS) {
    cases.push({ kind: 'string', value });
}

// 2. Floats.
for (const value of FLOATS) {
    cases.push({ kind: 'float', value });
}

// 3. Integers, at the boundaries.
for (const value of [0, 1, -1, 127, 128, 32767, 32768, 2147483647, 2147483648, 9007199254740991, 9007199254740993]) {
    cases.push({ kind: 'int', value });
}

// 4. Booleans and null.
for (const value of [true, false, null]) {
    cases.push({ kind: 'literal', value });
}

// 5. Objects with an explicit key order.
for (const keys of KEY_ORDERS) {
    const entries = keys.map((key, index) => [key, index === 0 && key === 'message' ? 'a/b é' : `${key}-${index}`]);

    cases.push({ kind: 'object', entries });
}

// 6. Arrays.
for (const value of [[], [1, 2, 3], ['a', 'b'], ['a/b', 'é'], [1, 'x', true, null, 1.5]]) {
    cases.push({ kind: 'array', value });
}

// 7. Nested structures, which is where the ordering and the escaping
//    interact.
for (let i = 0; i < 200; i++) {
    const depth = intBetween(1, 4);
    const entries = [];

    for (let d = 0; d < depth; d++) {
        const key = pick(['message', 'data', 'errors', 'links', 'meta', 'status', 'a/b', 'é']);
        const inner = pick([
            pick(CHARACTERS),
            pick(FLOATS),
            intBetween(-1000, 1000),
            [pick(CHARACTERS), pick(FLOATS)],
        ]);

        entries.push([key, inner]);
    }

    cases.push({ kind: 'object', entries });
}

// 8. Random strings, to cover the combinations the fixed list misses.
for (let i = 0; i < count; i++) {
    const length = intBetween(0, 40);
    let value = '';

    for (let c = 0; c < length; c++) {
        const bucket = intBetween(0, 3);

        if (bucket === 0) {
            value += String.fromCharCode(intBetween(0x20, 0x7e));
        } else if (bucket === 1) {
            value += pick(['/', '<', '>', '&', '"', '\\', '\n', '\t', '\b', '\f']);
        } else if (bucket === 2) {
            value += String.fromCharCode(intBetween(0x80, 0x7ff));
        } else {
            value += String.fromCodePoint(intBetween(0x10000, 0x10ffff));
        }
    }

    cases.push({ kind: 'string', value });
}

// 9. Random floats, biased towards the thresholds.
for (let i = 0; i < Math.floor(count / 2); i++) {
    const magnitude = intBetween(-320, 308);
    const value = next() * Math.pow(10, magnitude) * (next() < 0.5 ? -1 : 1);

    cases.push({ kind: 'float', value });
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ cases }, null, 1) + '\n');

console.log(`wrote ${cases.length} JSON encoding cases to ${outPath.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
