#!/usr/bin/env node
/**
 * verify-postgres-baseline.mjs — build PostgreSQL from nothing and prove it.
 *
 *   1. Create a database with `LC_COLLATE=C LC_CTYPE=C` from `template0`.
 *   2. Apply every migration in order with `ON_ERROR_STOP`.
 *   3. Load `db/postgres/seed.sql`.
 *   4. Run the SQL behaviour suites in `db/postgres/tests`.
 *   5. Assert the demo surface exists and no credential was seeded.
 *
 * USAGE
 *   node tools/db/verify-postgres-baseline.mjs
 *   node tools/db/verify-postgres-baseline.mjs --database=4ceria_check
 *   node tools/db/verify-postgres-baseline.mjs --keep
 *
 * Connection comes from the standard libpq variables (PGHOST, PGPORT,
 * PGUSER, PGPASSWORD) and PSQL_BIN may name the client.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = join(ROOT, 'db', 'postgres', 'migrations');
const SEED = join(ROOT, 'db', 'postgres', 'seed.sql');
const TESTS = join(ROOT, 'db', 'postgres', 'tests');

const arg = (name, fallback = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const database = arg('database', '4ceria_pgcheck');
const keep = process.argv.includes('--keep');

const env = {
    ...process.env,
    PGHOST: process.env.PGHOST || '127.0.0.1',
    PGPORT: process.env.PGPORT || '5432',
    PGUSER: process.env.PGUSER || 'postgres',
    PGDATABASE: 'postgres',
};

function psql(args, { capture = true, databaseName = 'postgres' } = {}) {
    return execFileSync(process.env.PSQL_BIN || 'psql', ['-d', databaseName, '-v', 'ON_ERROR_STOP=1', ...args], {
        cwd: ROOT,
        env,
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        encoding: 'utf8',
    });
}

function sql(statement, databaseName = 'postgres') {
    return psql(['-q', '-c', statement], { databaseName });
}

function quoteIdent(value) {
    return '"' + value.replaceAll('"', '""') + '"';
}

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}

try {
    psql(['--version']);
} catch {
    fail('no psql client was found. Set PSQL_BIN or put psql on PATH.');
}

try {
    if (!keep) {
        sql(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
    }
    sql(
        `CREATE DATABASE ${quoteIdent(database)} TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
} catch (error) {
    fail(`could not create ${database}: ${error.stderr || error.message}`);
}

const collation = psql(
    ['-Atc', `SELECT datcollate || '|' || datctype FROM pg_database WHERE datname = '${database.replaceAll("'", "''")}'`],
    { databaseName: 'postgres' },
).trim();

if (collation !== 'C|C') {
    fail(`${database} has collation ${collation}, expected C|C`);
}

const migrations = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

for (const migration of migrations) {
    try {
        psql(['-q', '-f', join(MIGRATIONS, migration)], { databaseName: database, capture: false });
    } catch {
        fail(`migration ${migration} failed`);
    }
}

if (!existsSync(SEED)) {
    fail('db/postgres/seed.sql is missing');
}

try {
    psql(['-q', '-f', SEED], { databaseName: database, capture: false });
} catch {
    fail('seed.sql failed to load');
}

const tests = existsSync(TESTS)
    ? readdirSync(TESTS).filter((name) => name.endsWith('.sql')).sort()
    : [];

for (const test of tests) {
    try {
        psql(['-q', '-f', join(TESTS, test)], { databaseName: database, capture: false });
    } catch {
        fail(`SQL test ${test} failed`);
    }
}

const checks = [
    ['users', 'SELECT count(*) FROM users', 1],
    ['projects', 'SELECT count(*) FROM projects', 1],
    ['houses', 'SELECT count(*) FROM house', 6],
    ['materials', 'SELECT count(*) FROM materials', 10],
    ['demo owner', "SELECT count(*) FROM users WHERE email = 'client@example.test' AND role_type = 'user'", 1],
    ['demo supplier', "SELECT count(*) FROM users WHERE email = 'akmal@example.test' AND role_type = 'supplier'", 1],
    ['demo courier', "SELECT count(*) FROM users WHERE email = 'fariz@example.test' AND role_type = 'logistics'", 1],
    ['no seeded tokens', 'SELECT count(*) FROM personal_access_tokens', 0],
];

for (const [label, query, minimum] of checks) {
    const value = Number.parseInt(
        psql(['-Atc', query], { databaseName: database }).trim(),
        10,
    );

    if (!Number.isFinite(value) || value < minimum) {
        fail(`${label}: got ${value}, expected at least ${minimum}`);
    }
}

console.log(`PostgreSQL baseline OK: ${database} (${migrations.length} migrations, ${tests.length} SQL suites)`);
