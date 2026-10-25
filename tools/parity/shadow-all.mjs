#!/usr/bin/env node
/**
 * shadow-all.mjs — the gate's shadow pass.
 *
 * WHAT IT DOES
 * ------------
 * For every route the gateway actually SERVES (rather than stubs), it starts the
 * gateway against the ETL'd PostgreSQL database, sends the same request to
 * Laravel and to Go, and requires the answers to be identical byte for byte.
 *
 * WHY IT BELONGS IN THE GATE
 * --------------------------
 * A handler that matched once is not a handler that matches. The endpoint's
 * correctness depends on the schema, on the ETL, on the authentication and on
 * the encoder — four things that change independently. `php scripts/verify.php`
 * already rebuilds the schema and re-runs the ETL, so this is the step that says
 * whether all of that still adds up to the same BYTES.
 *
 * THE LIST OF PORTED ROUTES IS EXPLICIT. It grows one entry at a time, and an
 * entry that stops matching fails the gate. A route is added here only when its
 * handler is written.
 *
 * USAGE (the gate passes the environment; by hand:)
 *   node tools/parity/shadow-all.mjs
 *   node tools/parity/shadow-all.mjs --laravel=http://127.0.0.1:9001
 */

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { shadowRoute } from './shadow-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const laravel = arg('laravel', process.env.SHADOW_LARAVEL ?? 'http://127.0.0.1:9001');
const port = arg('port', '8098');
const php = process.env.PHP_BIN ?? 'php';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/4ceria_pgcheck';

/**
 * THE PORTED ROUTES.
 *
 * Each entry names the route id from `routing/routes.yaml` and the token role it
 * needs. A parameterised route also names a concrete URI, with an id that must
 * exist in both databases.
 */
const PORTED = [
    { id: 'get.api.admin.stats', role: 'admin' },
    { id: 'get.api.notifications', role: 'admin' },
    { id: 'get.api.user.active-projects', role: 'user' },
];

const manifest = yaml.load(readFileSync(resolve(ROOT, 'routing', 'routes.yaml'), 'utf8'));
const byId = new Map(manifest.routes.map((route) => [route.id, route]));

function token(role) {
    const email = { admin: 'admin@4c.id', user: 'client@example.test' }[role];

    if (!email) {
        throw new Error(`no fixture token for role "${role}"`);
    }

    const output = execFileSync(php, ['artisan', 'visual:token', `--email=${email}`], {
        cwd: ROOT,
        encoding: 'utf8',
    });

    return JSON.parse(output.trim().split('\n').pop()).token;
}

async function waitForHealth(url, attempts = 60) {
    for (let i = 0; i < attempts; i += 1) {
        try {
            const response = await fetch(`${url}/healthz`);

            if (response.ok) {
                return true;
            }
        } catch {
            // Not listening yet.
        }

        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }

    return false;
}

// TOKENS FIRST, THEN THE COPY.
//
// `visual:token` writes to MYSQL. The gateway reads PostgreSQL. A token minted
// a second ago does not exist in the database the gateway authenticates
// against, so without this copy every ported route answers 401 and the failure
// looks like a broken authenticator rather than a missing row.
const tokens = Object.fromEntries([...new Set(PORTED.map((entry) => entry.role))].map((role) => [role, token(role)]));

execFileSync('go', ['run', './cmd/etl', '-tables=personal_access_tokens', '-truncate'], {
    cwd: ROOT,
    env: { ...process.env, GOEXPERIMENT: 'nojsonv2', DATABASE_URL: databaseUrl },
    stdio: 'inherit',
});

mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });

const binary = resolve(ROOT, '.tmp', process.platform === 'win32' ? 'gateway-shadow.exe' : 'gateway-shadow');

execFileSync('go', ['build', '-o', binary, './cmd/gateway'], {
    cwd: ROOT,
    env: { ...process.env, GOEXPERIMENT: 'nojsonv2' },
    stdio: 'inherit',
});

const gateway = spawn(binary, [`--addr=:${port}`], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'ignore',
});

let failures = 0;

try {
    if (!(await waitForHealth(`http://127.0.0.1:${port}`))) {
        console.error('::error::the gateway did not become healthy — is PostgreSQL running and ETL\'d?');
        process.exitCode = 1;
    } else {
        for (const entry of PORTED) {
            const route = byId.get(entry.id);

            if (!route) {
                console.error(`::error::${entry.id} is not in routing/routes.yaml`);
                failures += 1;
                continue;
            }

            if (route.uri.includes('{') && !entry.uri) {
                console.error(`::error::${entry.id} is parameterised; add a --uri to the PORTED entry`);
                failures += 1;
                continue;
            }

            const problems = await shadowRoute({
                route,
                laravel,
                gateway: `http://127.0.0.1:${port}`,
                token: tokens[entry.role],
                uri: entry.uri,
            });

            if (problems.length > 0) {
                console.error(`  ${route.methods[0]} /${entry.uri ?? route.uri} — DIFFERENT`);

                for (const problem of problems) {
                    console.error(`    ${problem}`);
                }

                failures += 1;
            } else {
                console.log(`  ${route.methods[0]} /${entry.uri ?? route.uri} — identical`);
            }
        }
    }
} finally {
    gateway.kill();
}

if (failures > 0) {
    console.error(`\n${failures} ported route(s) no longer match the legacy application.`);
    process.exitCode = 1;
} else {
    console.log(`\n${PORTED.length} ported route(s) answer byte-identically to Laravel.`);
}
