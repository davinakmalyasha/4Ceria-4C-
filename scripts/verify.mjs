#!/usr/bin/env node
/**
 * verify.mjs — the local verification gate.
 *
 * WHAT IT RUNS
 * ------------
 *   1. `gofmt -l` over cmd/ and internal/   (a formatting diff is review noise)
 *   2. `go vet ./...`                       (printf-shaped mistakes)
 *   3. `go test ./...`                      (the domain and handler suites)
 *   4. `tsc --noEmit` in web/               (the frontend must compile)
 *   5. `next build` in web/                 (the artifact must build)
 *
 * With `--db`, it also:
 *   6. builds PostgreSQL from scratch and diffs it against the live MySQL
 *      schema (`tools/db/verify-postgres-baseline.mjs`)
 *   7. runs the ETL and asserts both engines hold the same number of rows
 *
 * The database steps need a running MySQL (`MYSQL_DSN`) and PostgreSQL
 * (`DATABASE_URL` / the PGHOST family). They are opt-in so the gate is usable
 * on a machine that has neither.
 *
 * Why Node and not PHP: the PHP application is gone. A gate written in a
 * language the repository no longer runs is a gate that stops being runnable
 * the moment the runtime is removed.
 *
 * USAGE
 *   node scripts/verify.mjs
 *   node scripts/verify.mjs --db
 *   node scripts/verify.mjs --skip-web
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');

const args = process.argv.slice(2);
const withDb = args.includes('--db');
const skipWeb = args.includes('--skip-web');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const failures = [];

function step(name, command, commandArgs, options = {}) {
    process.stdout.write(`\n==> ${name}\n`);

    const result = spawnSync(command, commandArgs, {
        cwd: options.cwd ?? ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...(options.env ?? {}) },
        shell: process.platform === 'win32' && command.endsWith('.cmd'),
    });

    if (result.error) {
        process.stderr.write(`    could not run: ${result.error.message}\n`);
        failures.push(name);
        return false;
    }

    if (result.status !== 0) {
        failures.push(name);
        return false;
    }

    return true;
}

// ---------------------------------------------------------------------------
// Go. The ETL and the gateway are the product; their suites are the proof.
// ---------------------------------------------------------------------------
// `gofmt -l` reports every file in a CRLF checkout on Windows, even when the
// formatting is correct: gofmt compares bytes and the working tree has \r\n
// while the repository stores \n. CI runs on Linux, where the check means what
// it says, so it is skipped here rather than turned into a false failure.
if (process.platform === 'win32') {
    process.stdout.write('\n==> gofmt\n    skipped: CRLF checkout on Windows (CI enforces it on Linux)\n');
} else {
    const gofmt = spawnSync('gofmt', ['-l', './cmd', './internal'], {
        cwd: ROOT,
        encoding: 'utf8',
    });

    if (gofmt.error) {
        process.stderr.write(`gofmt is not available: ${gofmt.error.message}\n`);
        failures.push('gofmt');
    } else if (gofmt.stdout.trim() !== '') {
        process.stderr.write(`::error::gofmt reports unformatted files:\n${gofmt.stdout}`);
        failures.push('gofmt');
    }
}

step('go vet', 'go', ['vet', './...']);

if (!step('go test', 'go', ['test', './...'], { env: { GOEXPERIMENT: 'nojsonv2' } })) {
    // `go test` already reported why.
}

// ---------------------------------------------------------------------------
// The frontend.
// ---------------------------------------------------------------------------
if (skipWeb) {
    process.stdout.write('\n==> web\n    skipped (--skip-web)\n');
} else if (!existsSync(join(WEB, 'node_modules'))) {
    process.stdout.write('\n==> web\n    skipped: web/node_modules is absent (cd web && npm ci)\n');
} else {
    step('frontend type check', npm, ['exec', '--', 'tsc', '--noEmit'], { cwd: WEB });
    step('frontend build', npm, ['run', 'build'], { cwd: WEB });
}

// ---------------------------------------------------------------------------
// The databases. Opt-in: they need both engines running.
// ---------------------------------------------------------------------------
if (withDb) {
    step(
        'PostgreSQL baseline (from scratch, vs. live MySQL)',
        'node',
        [join(ROOT, 'tools', 'db', 'verify-postgres-baseline.mjs')],
        { env: { GOEXPERIMENT: 'nojsonv2' } },
    );

    step('ETL load', 'go', ['run', './cmd/etl', '-all', '-truncate'], {
        env: { GOEXPERIMENT: 'nojsonv2' },
    });
    step('ETL row-count equality', 'go', ['run', './cmd/etl', '-all', '-verify'], {
        env: { GOEXPERIMENT: 'nojsonv2' },
    });
} else {
    process.stdout.write(
        '\n==> databases\n    skipped: pass --db to run the PostgreSQL baseline and the ETL checks\n',
    );
}

// ---------------------------------------------------------------------------
// Verdict.
// ---------------------------------------------------------------------------
if (failures.length > 0) {
    process.stderr.write(`\nVERIFICATION FAILED: ${failures.join(', ')}\n`);
    process.exit(1);
}

process.stdout.write('\nVERIFICATION PASSED\n');
