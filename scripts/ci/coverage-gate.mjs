#!/usr/bin/env node
/**
 * coverage-gate.mjs — production-standard coverage bar for pure-unit packages.
 *
 * Runs `go test -cover` over the listed packages and fails when a critical
 * package drops below its bar. The bars are set where the tree already is,
 * with headroom for refactors — not aspirational:
 *
 *   identity   100%  (tiny, pure, fully pinned)
 *   money       99%  (one provably-unreachable parse line aside)
 *   escrow      99%  (two defensive Subtract lines unreachable:
 *                     same-currency by construction / checked earlier)
 *   authz      100%  (role matrix, incl. bogus-role + nil-project)
 *   terminplan  98%  (remainder needs fault injection, not input)
 *   jsonwire    99%  (key-write error path cannot fire: no mid-name
 *                     flush + AllowInvalidUTF8 always true on the wire)
 *   ai          45%  no-DB floor (DB-free helpers only). WITH a seeded
 *                     DB the same gate must read >=90 (ai_db2_test.go);
 *                     enforced by the database CI job, not this script.
 *
 * httpapi is intentionally NOT gated: the denominator is ~1500 DB-backed
 * handler funcs. Its pure helpers (numeric, paginator, storagepath,
 * limiter, compress, gates) are unit-tested in purehelpers_test.go; the
 * handler paths run against the fresh database in the `database` CI job
 * and `verify.mjs --db`. Gating a percentage there would incentivise
 * vacuous tests.
 *
 * USAGE
 *   node scripts/ci/coverage-gate.mjs
 */
import { spawnSync } from 'node:child_process';

const BARS = new Map([
    ['internal/domain/identity', 100],
    ['internal/domain/money', 99],
    ['internal/domain/escrow', 99],
    ['internal/domain/authz', 100],
    ['internal/domain/terminplan', 98],
    ['internal/jsonwire', 99],
    ['internal/ai', 45],
]);

const result = spawnSync('go', ['test', '-cover', './internal/domain/...', './internal/jsonwire/...', './internal/ai/...'], {
    encoding: 'utf8',
});

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (result.error) {
    process.stderr.write(`could not run go test: ${result.error.message}\n`);
    process.exit(1);
}

if (result.status !== 0) {
    process.stderr.write('coverage gate: test failures above\n');
    process.exit(1);
}

const failures = [];
for (const line of result.stdout.split('\n')) {
    const match = line.match(/^(github\.com\/\S+\/(internal\/\S+))\s+coverage:\s+([\d.]+)%/);
    if (!match) {
        continue;
    }
    const pkg = match[2];
    const pct = Number.parseFloat(match[3]);
    const bar = BARS.get(pkg);
    if (bar === undefined) {
        continue;
    }
    if (pct < bar) {
        failures.push(`${pkg}: ${pct}% < bar ${bar}%`);
    } else {
        process.stdout.write(`coverage gate: ${pkg} ${pct}% >= ${bar}% OK\n`);
    }
}

if (failures.length > 0) {
    process.stderr.write(`::error::coverage below bar: ${failures.join('; ')}\n`);
    process.exit(1);
}

process.stdout.write('COVERAGE GATE PASSED\n');
