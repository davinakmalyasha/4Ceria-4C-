#!/usr/bin/env node
/**
 * verify.mjs — the local verification gate.
 *
 *   1. gofmt over cmd/ and internal/
 *   2. go vet ./...
 *   3. go test ./... and the coverage gate (critical pure-unit bars)
 *   4. action and image policy
 *   5. tsc --noEmit, vitest run, and next build in web/
 *
 * With `--db`, it also builds PostgreSQL from scratch (C collation), applies
 * every migration, loads the demo seed, runs the SQL suites, and then runs the
 * Go suites against that fresh database.
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

function databaseURL() {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }

    const user = process.env.PGUSER || 'postgres';
    const password = process.env.PGPASSWORD ? `:${encodeURIComponent(process.env.PGPASSWORD)}` : '';
    const host = process.env.PGHOST || '127.0.0.1';
    const port = process.env.PGPORT || '5432';

    return `postgres://${user}${password}@${host}:${port}/4ceria_pgcheck`;
}

const gofmt = spawnSync('gofmt', ['-l', './cmd', './internal'], { cwd: ROOT, encoding: 'utf8' });

if (gofmt.error) {
    process.stderr.write(`gofmt is not available: ${gofmt.error.message}\n`);
    failures.push('gofmt');
} else if (gofmt.stdout.trim() !== '') {
    process.stderr.write(`::error::gofmt reports unformatted files:\n${gofmt.stdout}`);
    failures.push('gofmt');
}

step('go vet', 'go', ['vet', './...']);
step('go test', 'go', ['test', './...']);
step('coverage gate', 'node', ['scripts/ci/coverage-gate.mjs']);
step('action policy', 'node', ['scripts/ci/action-policy.mjs']);

if (skipWeb) {
    process.stdout.write('\n==> web\n    skipped (--skip-web)\n');
} else if (!existsSync(join(WEB, 'node_modules'))) {
    process.stderr.write('\n::error::web/node_modules is absent (cd web && npm ci)\n');
    failures.push('web/node_modules absent');
} else {
    step('frontend type check', npm, ['exec', '--', 'tsc', '--noEmit'], { cwd: WEB });
    step('frontend unit tests', npm, ['run', 'test'], { cwd: WEB });
    step('frontend build', npm, ['run', 'build'], { cwd: WEB });
}

if (withDb) {
    const baseline = step(
        'PostgreSQL baseline (from scratch, seed, SQL suites)',
        'node',
        [join(ROOT, 'tools', 'db', 'verify-postgres-baseline.mjs')],
        { env: { ...process.env, PSQL_BIN: process.env.PSQL_BIN || 'psql' } },
    );

    if (baseline) {
        step('Go suites against the fresh database', 'go', ['test', '-count=1', './...'], {
            env: { DATABASE_URL: databaseURL() },
        });
    }
} else {
    process.stdout.write('\n==> database\n    skipped: pass --db to build and test PostgreSQL\n');
}

if (failures.length > 0) {
    process.stderr.write(`\nVERIFICATION FAILED: ${failures.join(', ')}\n`);
    process.exit(1);
}

process.stdout.write('\nVERIFICATION PASSED\n');
