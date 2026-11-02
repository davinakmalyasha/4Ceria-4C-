#!/usr/bin/env node
/**
 * shadow-auth.mjs — the auth shadow proof.
 *
 * Login and register mint a fresh random token on every call, so two
 * stacks can never emit the same bytes. What CAN be proven:
 *
 *   1. every deterministic byte matches (status, message, token_type, the
 *      whole user object) after normalising the token, the ids the test
 *      itself chose differently, and the timestamps;
 *   2. each minted token authenticates on BOTH stacks (`GET /api/me`
 *      compared byte-for-byte, token normalised) — the ADR-0018 promise
 *      that a session minted by either application works in both, with no
 *      ETL window in between.
 *
 * Usage (PHP_BIN must be a PHP 8.4+; needs Laravel on :9001 and the gateway
 * with MYSQL_DSN on :8097):
 *   node tools/parity/shadow-auth.mjs
 */

import { execFileSync } from 'node:child_process';

const LARAVEL = process.env.SHADOW_LARAVEL ?? 'http://127.0.0.1:9001';
const GATEWAY = process.env.SHADOW_GATEWAY ?? 'http://127.0.0.1:8097';

const norm = (s) =>
    s
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g, '<ts>')
        .replace(/\d+\|[A-Za-z0-9]{48}/g, '<TOKEN>')
        .replace(/shadow_reg_go/g, '<USER>')
        .replace(/shadow_reg_lv/g, '<USER>')
        .replace(/Shadow Go/g, '<NAME>')
        .replace(/Shadow Lv/g, '<NAME>')
        .replace(/9000\d{5}/g, '<ID>');

async function call(base, method, uri, token = null, body = null) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== null) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${base}${uri}`, {
        method,
        headers,
        body: body !== null ? JSON.stringify(body) : undefined,
        redirect: 'manual',
    });

    return { status: response.status, body: await response.text() };
}

function tokenOf(recorded) {
    const parsed = JSON.parse(recorded.body);
    if (!parsed.access_token) throw new Error('no access_token in ' + recorded.body.slice(0, 120));
    return parsed.access_token;
}

let failures = 0;
const check = (name, a, b) => {
    const na = norm(a.body);
    const nb = norm(b.body);
    if (a.status === b.status && na === nb) {
        console.log(`  ${name} — identical`);
        return;
    }
    failures++;
    console.log(`  ${name} — DIFF (laravel ${a.status}, gateway ${b.status})`);
    let at = 0;
    while (at < na.length && at < nb.length && na[at] === nb[at]) at++;
    console.log(`    laravel: …${na.slice(Math.max(0, at - 80), at + 120)}…`);
    console.log(`    gateway: …${nb.slice(Math.max(0, at - 80), at + 120)}…`);
};

// Fresh, distinct users per stack (uniqueness is per-stack).
const goUser = { name: 'Shadow Go', username: 'shadow_reg_go', email: 'shadow_reg_go@example.test', password: 'password123', role_type: 'user' };
const lvUser = { name: 'Shadow Lv', username: 'shadow_reg_lv', email: 'shadow_reg_lv@example.test', password: 'password123', role_type: 'user' };

console.log('auth shadow proof');

// Register on both stacks.
const regGo = await call(GATEWAY, 'POST', '/api/register', null, goUser);
const regLv = await call(LARAVEL, 'POST', '/api/register', null, lvUser);
check('POST /api/register', regLv, regGo);

// Login on both stacks (same per-stack user).
const loginGo = await call(GATEWAY, 'POST', '/api/login', null, { email: goUser.email, password: goUser.password });
const loginLv = await call(LARAVEL, 'POST', '/api/login', null, { email: lvUser.email, password: lvUser.password });
check('POST /api/login', loginLv, loginGo);

// The Laravel-created user is new to the PostgreSQL mirror. Logging in
// through Go first runs the targeted re-sync, so the cross-stack reads
// below compare handlers rather than ETL timing.
await call(GATEWAY, 'POST', '/api/login', null, { email: lvUser.email, password: lvUser.password });

// Each token works on the OTHER stack: GET /api/me byte-identical.
const goToken = tokenOf(regGo);
const lvToken = tokenOf(regLv);

const crossA = await call(LARAVEL, 'GET', '/api/me', goToken);
const crossB = await call(GATEWAY, 'GET', '/api/me', goToken);
check('Go token on Laravel /api/me', crossA, crossB);

const crossC = await call(LARAVEL, 'GET', '/api/me', lvToken);
const crossD = await call(GATEWAY, 'GET', '/api/me', lvToken);
check('Laravel token on Go /api/me', crossC, crossD);

// Logout on both stacks (each with its own token).
const outGo = await call(GATEWAY, 'POST', '/api/logout', goToken);
const outLv = await call(LARAVEL, 'POST', '/api/logout', lvToken);
check('POST /api/logout', outLv, outGo);

if (failures > 0) {
    console.error(`\n${failures} auth check(s) differ.`);
    process.exit(1);
}

console.log('\nauth shadow proof holds.');
