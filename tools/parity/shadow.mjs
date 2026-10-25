#!/usr/bin/env node
/**
 * shadow.mjs — send one request to BOTH stacks and compare the answers byte for
 * byte.
 *
 * WHY THIS EXISTS
 * ---------------
 * The golden files (`spec/contracts/laravel/`) prove what the LEGACY application
 * answered at capture time, against a fixture world. They are the right oracle
 * for the shapes, but they cannot verify a Go handler TODAY, because a handler
 * reads the live database and the golden file records numbers from a database
 * that no longer exists.
 *
 * So the port is checked the way a cutover is checked: the same request goes to
 * Laravel (MySQL) and to the Go gateway (PostgreSQL, kept in step by
 * `cmd/etl`), and the two responses must be identical. That is exactly the
 * comparison a canary makes, with the sample size one.
 *
 * WHAT IS COMPARED
 * ----------------
 *   - the status code;
 *   - the `Content-Type` header;
 *   - the body, BYTE FOR BYTE — including key order, because PHP preserves array
 *     order and a Go map would sort it.
 *
 * The `Date` and `Server` headers are ignored: they cannot match and they are
 * not part of the contract.
 *
 * USAGE
 *   node tools/parity/shadow.mjs --route=get.api.admin.stats --token=159358|abc...
 *   node tools/parity/shadow.mjs --route=get.api.projects.project --uri=api/projects/14976 --token=...
 *
 * Both addresses default to the local stack; `--laravel` and `--gateway` point
 * them elsewhere.
 *
 * EXIT CODES
 *   0 — identical
 *   1 — different, or one stack did not answer
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { callStack as call, diffResponses } from './shadow-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const routeId = arg('route');
const token = arg('token', process.env.SHADOW_TOKEN ?? '');
const laravel = arg('laravel', 'http://127.0.0.1:9001').replace(/\/$/, '');
const gateway = arg('gateway', 'http://127.0.0.1:8099').replace(/\/$/, '');
const method = arg('method', 'GET').toUpperCase();
const body = arg('body');
const uriOverride = arg('uri');

if (!routeId) {
    console.error('::error::pass --route=<route id> (see routing/routes.yaml)');
    process.exit(1);
}

const manifest = yaml.load(readFileSync(resolve(ROOT, 'routing', 'routes.yaml'), 'utf8'));
const route = manifest.routes.find((r) => r.id === routeId);

if (!route) {
    console.error(`::error::no route with id "${routeId}" in routing/routes.yaml`);
    process.exit(1);
}

// A parameterised route needs a concrete URI: the manifest's `{project}` is not
// a request. Refusing to guess is deliberate — a wrong id returns a 404 from
// both stacks and the comparison would "pass".
let uri = uriOverride ?? route.uri;

if (!uriOverride && uri.includes('{')) {
    console.error(
        `::error::the route is parameterised (${route.uri}).\n` +
        'Pass --uri=api/projects/14976 with an id that exists in BOTH databases.',
    );
    process.exit(1);
}

const request = { method, uri, token, body };

const [legacy, port] = await Promise.all([call(laravel, request), call(gateway, request)]);
const problems = diffResponses(legacy, port, { legacy: laravel, port: gateway });

if (problems.length > 0) {
    console.error(`${method} /${uri} — DIFFERENT`);
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }

    process.exit(1);
}

console.log(`${method} /${uri} — identical (${legacy.status}, ${legacy.body.length} bytes)`);
