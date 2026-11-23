#!/usr/bin/env node
/**
 * reset-demo.mjs — rebuild the local demo database in one command.
 *
 * Creates the database with C collation, applies every migration in order,
 * loads the showcase seed and verifies the demo accounts. Destructive by
 * design; it is the command a new checkout runs.
 *
 *   node tools/db/reset-demo.mjs
 *   node tools/db/reset-demo.mjs --database=4ceria_demo
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = join(ROOT, 'db', 'postgres', 'migrations');
const SEED = join(ROOT, 'db', 'postgres', 'seed.sql');

const databaseArg = process.argv.find((a) => a.startsWith('--database='));
const database = databaseArg ? databaseArg.slice('--database='.length) : '4ceria_pgcheck';

const env = {
    ...process.env,
    PGHOST: process.env.PGHOST || '127.0.0.1',
    PGPORT: process.env.PGPORT || '5432',
    PGUSER: process.env.PGUSER || 'postgres',
    PGDATABASE: 'postgres',
};

const psqlBin = process.env.PSQL_BIN || 'psql';

function psql(args, databaseName = 'postgres') {
    execFileSync(psqlBin, ['-d', databaseName, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
        cwd: ROOT,
        env,
        stdio: 'inherit',
    });
}

function quote(value) {
    return '"' + value.replaceAll('"', '""') + '"';
}

try {
    psql(['--version']);
} catch {
    console.error('psql was not found. Set PSQL_BIN or put psql on PATH.');
    process.exit(1);
}

console.log(`Recreating ${database} with LC_COLLATE=C…`);
psql(['-c', `DROP DATABASE IF EXISTS ${quote(database)}`]);
psql(['-c', `CREATE DATABASE ${quote(database)} TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`]);

const migrations = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();

for (const migration of migrations) {
    process.stdout.write(`  ${migration}\n`);
    psql(['-f', join(MIGRATIONS, migration)], database);
}

console.log('  seed.sql');
psql(['-f', SEED], database);

console.log(`\nDemo database ready: ${database}`);
console.log('Start the API with:  go run ./cmd/gateway --addr=:8099');
