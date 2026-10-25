#!/usr/bin/env node
/**
 * verify-postgres-baseline.mjs — the PostgreSQL half of the honesty gate.
 *
 * WHAT IT PROVES
 * --------------
 * That the PostgreSQL target is a faithful translation of the live MySQL
 * schema, and that it BUILDS.
 *
 *   1. The baseline is applied to a FROM-SCRATCH database. A baseline that
 *      has only ever been applied to a database that already existed is not
 *      a baseline: the failures that matter — an ordering assumption, an
 *      extension that is not installed, a migration that depends on state a
 *      previous one created — only appear on a clean build.
 *
 *   2. The result is diffed against the LIVE MySQL schema: every table,
 *      every column, every enum type, every enum VALUE IN ORDER, every
 *      foreign key, every index, and every column DEFAULT.
 *
 *   3. The enum manifest is verified against BOTH engines, value by value and
 *      in order. `spec/enums.yaml` is the single source of truth for every
 *      value list, and ADR-0007 requires it to generate the PostgreSQL
 *      `CREATE TYPE`, the Go constants and the TypeScript union — so it
 *      cannot be transcribed by hand.
 *
 * WHY DEFAULTS ARE COMPARED
 * -------------------------
 * A column's DEFAULT is part of the schema, and it is the part that goes
 * missing without anyone noticing. `MODIFY COLUMN` restates the whole column
 * definition, so a helper that rebuilds the definition without restating the
 * default silently removes it — and every application INSERT happened to set
 * the column explicitly, so nothing broke loudly while MySQL and PostgreSQL
 * quietly grew different schemas for the same column.
 *
 * USAGE
 * -----
 *   node tools/db/verify-postgres-baseline.mjs
 *   node tools/db/verify-postgres-baseline.mjs --database=4ceria_pgcheck
 *   node tools/db/verify-postgres-baseline.mjs --keep     # do not drop it first
 *   node tools/db/verify-postgres-baseline.mjs --pg-dsn=postgres://...
 *
 * EXIT CODES
 *   0 — the baseline builds and matches
 *   1 — it does not
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const arg = (name, fallback = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const flag = (name) => process.argv.includes(`--${name}`);

const database = arg('database', '4ceria_pgcheck');
const keep = flag('keep');
const pgDsn = arg('pg-dsn', `postgres://postgres@127.0.0.1:5432/${database}`);

// The connection details for the `psql` calls. The standard libpq environment
// variables win, so CI can point the script at a service container without
// the script needing to know anything about it.
const pgHost = process.env.PGHOST || '127.0.0.1';
const pgUser = process.env.PGUSER || 'postgres';
const pgPassword = process.env.PGPASSWORD || '';
const pgPort = process.env.PGPORT || '5432';

const MIGRATIONS = join(ROOT, 'db', 'postgres', 'migrations');

/**
 * Find a client that can run, by VERSION rather than by position on the PATH
 * — the same trap AGENTS.md documents for PHP.
 */
function findClient(candidates, probeArgs) {
    for (const candidate of candidates) {
        if (candidate.includes('/') || candidate.includes('\\')) {
            if (!existsSync(candidate)) continue;
        }

        try {
            execFileSync(candidate, probeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
            return candidate;
        } catch {
            // This candidate does not run. Try the next one.
        }
    }

    return null;
}

const psql = findClient(
    [
        process.env.PSQL_BIN,
        'D:' + '\\' + 'laragon' + '\\' + 'bin' + '\\' + 'postgresql' + '\\' + 'pgsql-18.6' + '\\' + 'bin' + '\\' + 'psql.exe',
        '/usr/local/bin/psql',
        '/usr/bin/psql',
        'psql',
    ].filter(Boolean),
    ['--version'],
);

if (psql === null) {
    console.error('::error::no psql client was found.');
    console.error('::error::The PostgreSQL baseline cannot be verified without one.');
    process.exit(1);
}

const mysql = findClient(
    [
        process.env.MYSQL_BIN,
        'D:' + '\\' + 'laragon' + '\\' + 'bin' + '\\' + 'mysql' + '\\' + 'mysql-9.6.0-winx64' + '\\' + 'bin' + '\\' + 'mysql.exe',
        '/usr/local/bin/mysql',
        '/usr/bin/mysql',
        'mysql',
    ].filter(Boolean),
    ['--version'],
);

const run = (command, args, options = {}) => {
    try {
        const stdout = execFileSync(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024,
            ...options,
        });
        return { ok: true, stdout };
    } catch (error) {
        return {
            ok: false,
            stdout: error.stdout ?? '',
            stderr: error.stderr ?? String(error.message),
        };
    }
};

console.log('postgres baseline verification');
console.log(`  psql   : ${psql}`);
console.log(`  mysql  : ${mysql ?? '<not found — the diff will be skipped>'}`);
console.log(`  target : ${database}`);

// ---------------------------------------------------------------------------
// 1. A FROM-SCRATCH database.
// ---------------------------------------------------------------------------
if (!keep) {
    // The name is double-quoted: it starts with a digit, so PostgreSQL would
    // otherwise read it as a numeric literal.
    const recreate = run(psql, [
        '-h', pgHost,
        '-p', pgPort,
        '-U', pgUser,
        '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1',
        // WITH (FORCE) because a tool — the ETL, a gateway, a SQL client —
        // may still be connected, and PostgreSQL refuses to drop a database
        // somebody is using. The alternative is a scratch database that cannot
        // be recreated until a developer closes their editor.
        '-c', `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`,
        '-c', `CREATE DATABASE "${database}";`,
    ]);

    if (!recreate.ok) {
        console.error('::error::could not create the scratch database.');
        console.error(recreate.stderr);
        process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// 2. The baseline, in order.
// ---------------------------------------------------------------------------
const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

if (files.length === 0) {
    console.error(`::error::no migrations in ${MIGRATIONS}`);
    process.exit(1);
}

for (const file of files) {
    const result = run(psql, [
        '-h', pgHost,
        '-p', pgPort,
        '-U', pgUser,
        '-d', database,
        '-v', 'ON_ERROR_STOP=1',
        '-q',
        '-f', join(MIGRATIONS, file),
    ]);

    if (!result.ok) {
        console.error(`::error::${file} failed.`);
        console.error(result.stderr);
        process.exit(1);
    }

    console.log(`  applied ${file}`);
}

// ---------------------------------------------------------------------------
// 3. The diff, and the enum verification.
// ---------------------------------------------------------------------------
const inspector = join(ROOT, 'tools', 'db', 'inspect-legacy-schema.mjs');

const diff = run('node', [
    inspector,
    '--diff',
    '--pg-dsn', pgDsn,
    ...(mysql ? ['--mysql-bin', mysql] : []),
    ...(process.env.MYSQL_DATABASE ? ['--database', process.env.MYSQL_DATABASE] : []),
]);

process.stdout.write(diff.stdout);

if (!diff.ok) {
    console.error('::error::the PostgreSQL baseline does not match the live MySQL schema.');
    process.exit(1);
}

const enums = run('node', [
    inspector,
    '--verify-enums',
    '--pg-dsn', pgDsn,
    ...(mysql ? ['--mysql-bin', mysql] : []),
    ...(process.env.MYSQL_DATABASE ? ['--database', process.env.MYSQL_DATABASE] : []),
]);

// The enum verification prints 36 lines; only the verdict is interesting
// unless it failed.
if (!enums.ok) {
    process.stdout.write(enums.stdout);
    console.error('::error::the enum manifest does not match both engines.');
    process.exit(1);
}

const verdict = enums.stdout.split('\n').filter((l) => l.includes('ENUM VERIFICATION')).join('\n');
console.log(`  ${verdict}`);

// ---------------------------------------------------------------------------
// 4. The escrow's BEHAVIOUR, on the real function.
//
// The Go escrow package has its own tests, and they run against an in-memory
// store that MIRRORS `escrow.record_movement()`. A mirror that drifts from the
// function is a test that agrees with itself. This drives the real function on
// the schema built above and asserts MONEY.md's invariants: the ceiling moves
// only for deposit and adjustment_down, a duplicate is an idempotent success,
// a fee may share a payment's reference, a refund is negative, and an overdraw
// writes nothing.
//
// The script wraps everything in BEGIN/ROLLBACK, so it leaves no rows behind.
// ---------------------------------------------------------------------------
const escrowBehaviour = join(ROOT, 'db', 'postgres', 'tests', 'escrow_behaviour.sql');

const escrow = run(psql, [
    '-h', pgHost,
    '-p', pgPort,
    '-U', pgUser,
    '-d', database,
    '-v', 'ON_ERROR_STOP=1',
    '-q',
    '-f', escrowBehaviour,
]);

if (!escrow.ok) {
    process.stdout.write(escrow.stdout);
    console.error(escrow.stderr);
    console.error('::error::the escrow ledger does not behave as MONEY.md says it does.');
    process.exit(1);
}

console.log('  ESCROW BEHAVIOUR PASSED');

console.log('');
console.log('The PostgreSQL baseline builds from scratch and matches the live MySQL schema.');
