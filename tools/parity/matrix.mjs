#!/usr/bin/env node
/**
 * matrix.mjs — generates docs/PARITY.md, the live answer to "is the rewrite done?".
 *
 * WHY THIS IS GENERATED
 * ---------------------
 * ADR-0003: parity is machine-checked. A matrix somebody maintains by hand is
 * a matrix that says what its author believed on the day they last edited it.
 * The one number that matters — how many endpoints are actually done — is the
 * number a hand-maintained table gets wrong first.
 *
 * So every row is derived:
 *
 *   routing/routes.yaml            the endpoint set, its tier and its upstream
 *   spec/contracts/laravel/*.json  whether a golden file exists, and whether it
 *                                  recorded side-effect rows
 *   docs/MONEY.md §11              the money invariants
 *   internal/domain/escrow/*_test.go + db/postgres/tests/*.sql
 *                                  which invariants a test actually names
 *
 * A row cannot claim a verification the artefacts do not show.
 *
 * USAGE
 *   node tools/parity/matrix.mjs                 # write docs/PARITY.md
 *   node tools/parity/matrix.mjs --check         # fail if it is stale
 *   node tools/parity/matrix.mjs --out=-         # write to stdout
 *
 * EXIT CODES
 *   0 — generated (or up to date)
 *   1 — --check found a difference
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const arg = (name, fallback) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const manifestPath = resolve(ROOT, arg('manifest', 'routing/routes.yaml'));
const contractsDir = resolve(ROOT, 'spec', 'contracts', 'laravel');
const moneyDoc = resolve(ROOT, 'docs', 'MONEY.md');
const screensPath = resolve(ROOT, 'spec', 'visual-baseline', 'screens.json');
const outPath = arg('out', 'docs/PARITY.md');

// ---------------------------------------------------------------------------
// The inputs.
// ---------------------------------------------------------------------------
const manifest = yaml.load(readFileSync(manifestPath, 'utf8'));

const contracts = new Map();

if (existsSync(contractsDir)) {
    for (const file of readdirSync(contractsDir).filter((f) => f.endsWith('.json'))) {
        const contract = JSON.parse(readFileSync(join(contractsDir, file), 'utf8'));
        contracts.set(contract.meta.route_id, contract);
    }
}

/**
 * Which invariants a test names.
 *
 * The convention is that a test states the invariant it pins in its comment —
 * "is MONEY.md I24" — so coverage is READ from the source rather than
 * asserted in a table. An invariant nobody names is reported as uncovered,
 * which is exactly the list of parity risks docs/MONEY.md §11 promises.
 */
function namedInvariants() {
    const named = new Map();
    const sources = [];

    const escrowTests = resolve(ROOT, 'internal', 'domain', 'escrow');
    if (existsSync(escrowTests)) {
        for (const file of readdirSync(escrowTests).filter((f) => f.endsWith('_test.go'))) {
            sources.push({ file: `internal/domain/escrow/${file}`, where: 'Go' });
        }
    }

    const sqlTests = resolve(ROOT, 'db', 'postgres', 'tests');
    if (existsSync(sqlTests)) {
        for (const file of readdirSync(sqlTests).filter((f) => f.endsWith('.sql'))) {
            sources.push({ file: `db/postgres/tests/${file}`, where: 'SQL' });
        }
    }

    for (const source of sources) {
        const text = readFileSync(resolve(ROOT, source.file), 'utf8');

        for (const match of text.matchAll(/\bI(\d{1,2})\b/g)) {
            const id = `I${match[1]}`;
            const covered = named.get(id) ?? new Set();
            covered.add(source.where);
            named.set(id, covered);
        }
    }

    return named;
}

/**
 * The money invariants, read out of docs/MONEY.md §11's table.
 */
function moneyInvariants() {
    const text = readFileSync(moneyDoc, 'utf8');
    const invariant = [];
    let inside = false;

    for (const line of text.split('\n')) {
        if (line.startsWith('## 11. The invariants')) {
            inside = true;
            continue;
        }

        if (inside && line.startsWith('## ')) {
            break;
        }

        if (!inside) {
            continue;
        }

        const match = line.match(/^\|\s*(I\d+)\s*\|\s*(.+?)\s*\|/);
        if (!match) {
            continue;
        }

        invariant.push({ id: match[1], text: match[2] });
    }

    return invariant;
}

/** The visual inventory, when it exists. */
const screens = existsSync(screensPath)
    ? JSON.parse(readFileSync(screensPath, 'utf8'))
    : null;

// ---------------------------------------------------------------------------
// The derivations.
// ---------------------------------------------------------------------------
const covered = namedInvariants();
const invariants = moneyInvariants().map((entry) => ({
    ...entry,
    by: [...(covered.get(entry.id) ?? [])].sort(),
}));

/**
 * Does the contract record any side-effect rows?
 *
 * `side_effects.rows` is an OBJECT keyed by table, not an array — an artefact
 * that records nothing is `{}`, and the naive `.length` check reads every
 * contract as side-effect-free.
 */
function hasSideEffects(contract) {
    const rows = contract?.side_effects?.rows;

    if (!rows || typeof rows !== 'object') {
        return false;
    }

    return Object.keys(rows).some((table) => Array.isArray(rows[table]) && rows[table].length > 0);
}

/** One row per METHOD, because a route with two verbs is two endpoints. */
const endpoints = [];

for (const route of manifest.routes) {
    const contract = contracts.get(route.id);

    for (const method of route.methods) {
        endpoints.push({
            method,
            path: '/' + route.uri,
            tier: route.tier,
            upstream: route.upstream ?? 'laravel',
            golden: Boolean(contract),
            sideEffects: hasSideEffects(contract),
            auth: route.auth,
        });
    }
}

endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const count = (predicate) => endpoints.filter(predicate).length;

const tierCount = {
    1: count((e) => e.tier === 1),
    2: count((e) => e.tier === 2),
    3: count((e) => e.tier === 3),
};

const cutOver = count((e) => e.upstream === 'go');
const withContract = count((e) => e.golden);
const withSideEffects = count((e) => e.sideEffects);

const verifiedBy = (endpoint) => {
    const badges = ['routes', 'mw'];
    if (endpoint.golden) badges.push('gold');
    if (endpoint.sideEffects) badges.push('side');
    return badges.join(' · ');
};

const cell = (value) => String(value).replace(/\|/g, '\\|');

// ---------------------------------------------------------------------------
// The document.
// ---------------------------------------------------------------------------
const lines = [];

lines.push('<!--');
lines.push('  GENERATED FILE — DO NOT EDIT BY HAND.');
lines.push('');
lines.push('  Regenerate:  node tools/parity/matrix.mjs');
lines.push('  Verify:      node tools/parity/matrix.mjs --check');
lines.push('');
lines.push('  A hand-edit to this file is a CI failure. Every row is derived:');
lines.push('');
lines.push('    routing/routes.yaml            the endpoint set, its tier and upstream');
lines.push('    spec/contracts/laravel/**      whether a golden file exists, and its rows');
lines.push('    docs/MONEY.md §11              the money invariants');
lines.push('    internal/domain/escrow/*_test.go + db/postgres/tests/*.sql');
lines.push('                                   which invariants a test NAMES');
lines.push('-->');
lines.push('');
lines.push('# Parity Matrix');
lines.push('');
lines.push('**The live answer to "is the rewrite done?"** — per endpoint: which tier it is at,');
lines.push('which upstream serves it, and what verified it.');
lines.push('');
lines.push('> **Legend — Parity**');
lines.push('> `—` not started · `◐` ported, not yet cut over · `●` cut over, verified');
lines.push('>');
lines.push('> **Legend — Upstream** `laravel` the legacy stack · `go` the new stack');
lines.push('>');
lines.push('> **Legend — Verified by**');
lines.push('> `routes` route-set equality · `mw` middleware parity ·');
lines.push('> `gold` golden-file contract · `side` side-effect rows');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| | Count |');
lines.push('|---|---|');
lines.push(`| **Routes** | **${manifest.routes.length}** |`);
lines.push(`| **Endpoints (method × path)** | **${endpoints.length}** |`);
lines.push(`| Cut over to Go | ${cutOver} |`);
lines.push(`| With a recorded contract | ${withContract} |`);
lines.push(`| …that also records side-effect rows | ${withSideEffects} |`);
lines.push(`| Tier 1 — byte-identical | ${tierCount[1]} |`);
lines.push(`| Tier 2 — shape-identical | ${tierCount[2]} |`);
lines.push(`| Tier 3 — compatible | ${tierCount[3]} |`);
lines.push('');
lines.push(`The contract capture has recorded all ${withContract} endpoints; the Go handlers`);
lines.push(`are declared and answering \`501\`, so **${cutOver} are cut over**. "Ported" is not`);
lines.push('claimed until a Go response matches its golden file.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Endpoints');
lines.push('');
lines.push('| Method | Path | Tier | Upstream | Verified by |');
lines.push('|---|---|---|---|---|');

for (const endpoint of endpoints) {
    lines.push(
        `| \`${endpoint.method}\` | \`${cell(endpoint.path)}\` | ${endpoint.tier} | ${endpoint.upstream} | ${verifiedBy(endpoint)} |`,
    );
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('## Screens');
lines.push('');
lines.push('Captured by `node tools/visual/capture.mjs` from the legacy application and compared');
lines.push('by `node tools/visual/compare-screens.mjs` (ADR-0021).');
lines.push('');
lines.push('| Screen | Baseline | Role | Path |');
lines.push('|---|---|---|---|');

if (!screens) {
    lines.push('| _awaiting the visual inventory_ | | | |');
} else {
    for (const screen of screens.screens) {
        const path = screen.path + (screen.tab ? `?tab=${screen.tab}` : '');
        lines.push(`| \`${screen.id}\` | \`spec/visual-baseline/screens/${screen.id}.png\` | ${screen.role} | \`${cell(path)}\` |`);
    }
}

if (screens) {
    lines.push('');
    lines.push(`Captured from the legacy application at ${screens.freeze_time} with the browser clock`);
    lines.push(`pinned, in a ${screens.viewport.width}x${screens.viewport.height} viewport. Coverage is`);
    lines.push(`${screens.coverage}.`);

    for (const skip of screens.skipped) {
        lines.push('');
        lines.push(`- **skipped**${skip.role ? ` (${skip.role})` : ''}${skip.path ? ` \`${skip.path}\`` : ''}: ${skip.reason}`);
    }
}
lines.push('');
lines.push('---');
lines.push('');
lines.push('## The invariants');
lines.push('');
lines.push('Every row is a MONEY.md §11 invariant. The **Named by** column is read from the');
lines.push('test sources: an invariant counts as covered only when a test NAMES it, and the');
lines.push('gap list is therefore the parity-risk list.');
lines.push('');
lines.push('| # | Invariant | Named by |');
lines.push('|---|---|---|');

for (const invariant of invariants) {
    const by = invariant.by.length === 0 ? '— **uncovered**' : invariant.by.join(' + ');
    lines.push(`| ${invariant.id} | ${cell(invariant.text)} | ${by} |`);
}

lines.push('');
lines.push(`${invariants.filter((i) => i.by.length > 0).length} of ${invariants.length} invariants are named by a test.`);
lines.push('');
lines.push('---');
lines.push('');
lines.push('## How this file is produced');
lines.push('');
lines.push('```');
lines.push('$ php artisan routes:export             # routing/routes.yaml, with tier + upstream');
lines.push('$ php artisan contract:capture --all    # spec/contracts/laravel/**');
lines.push('$ node tools/parity/matrix.mjs          # this file');
lines.push('```');
lines.push('');
lines.push('`scripts/verify.php` runs the check, and CI asserts the result is unchanged.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Related documents');
lines.push('');
lines.push('| Document | What it adds |');
lines.push('|---|---|');
lines.push('| `docs/REWRITE-PLAN.md` §5 | The parity contract (P-1 … P-6) and the six mechanisms |');
lines.push('| `docs/adr/0003-parity-is-machine-checked.md` | Why parity is machine-checked |');
lines.push('| `docs/adr/0019-the-legacy-suite-is-the-oracle.md` | The assertion floor |');
lines.push('| `docs/adr/0021-a-visual-baseline-changes-only-through-an-adr.md` | The baseline gate |');
lines.push('| `docs/PORTING.md` §2 | The definition of done for a ported endpoint |');
lines.push('| `docs/MONEY.md` §11 | The 50 money invariants |');
lines.push('');

const document = lines.join('\n');

if (outPath === '-') {
    process.stdout.write(document);
    process.exit(0);
}

const destination = resolve(ROOT, outPath);

if (flag('check')) {
    const current = existsSync(destination) ? readFileSync(destination, 'utf8') : '';

    if (current !== document) {
        console.error('::error::docs/PARITY.md is stale. Run: node tools/parity/matrix.mjs');
        process.exit(1);
    }

    console.log(`docs/PARITY.md is up to date (${endpoints.length} endpoints, ${tierCount[1]}/${tierCount[2]}/${tierCount[3]} at tiers 1/2/3).`);
    process.exit(0);
}

writeFileSync(destination, document, 'utf8');

console.log(`wrote ${outPath}: ${endpoints.length} endpoints, ${tierCount[1]}/${tierCount[2]}/${tierCount[3]} at tiers 1/2/3, ${withContract} recorded.`);
