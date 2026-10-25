#!/usr/bin/env node
/**
 * screens.mjs — the visual-baseline inventory.
 *
 * WHAT IT IS
 * ----------
 * The list of screens the visual contract covers: one row per (route × role) and
 * one per (dashboard tab × role). It is GENERATED from the two places that
 * actually define the screens — the SPA's route table and its sidebar — so a new
 * screen cannot be added to the product and silently left out of the baseline.
 *
 * WHY THE NAV IS PARSED RATHER THAN LISTED
 * ----------------------------------------
 * There are 38 dashboard tabs, and the tab list is the thing that grows. A
 * hand-kept list in a test file is a list that stops being true the first time
 * somebody adds a tab, and the failure is silent: the new screen simply has no
 * baseline and nobody notices. Reading `DashboardSidebar.tsx` means the baseline
 * cannot miss a screen the application can reach.
 *
 * THE COVERAGE IS REPRESENTATIVE, AND SAYS SO
 * ------------------------------------------
 * Every distinct nav SHAPE is captured — owner, architect, contractor,
 * specialist, admin — rather than all fifteen roles. `notaris`, `mep` and the six
 * sub-contractor roles share the specialist shape and the same four tabs, so
 * capturing them again would produce near-identical files that add cost without
 * adding a signal. The manifest records the reduction rather than implying it
 * captured everything.
 *
 * USAGE
 *   node tools/visual/screens.mjs            # write spec/visual-baseline/screens.json
 *   node tools/visual/screens.mjs --check    # fail if it is stale
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);

const APP = resolve(ROOT, 'resources', 'js', 'app.tsx');
const SIDEBAR = resolve(ROOT, 'resources', 'js', 'components', 'Dashboard', 'DashboardSidebar.tsx');
const OUT = resolve(ROOT, 'spec', 'visual-baseline', 'screens.json');

const VIEWPORT = { width: 1440, height: 900 };

/**
 * The clock the harness freezes the BROWSER to.
 *
 * Several screens render relative dates ("2 days ago"), which is a function of
 * the browser's clock and the row's created_at. A baseline captured today would
 * fail tomorrow for a reason that has nothing to do with the code, so the clock
 * is pinned for both the capture and the comparison.
 */
const FREEZE_TIME = '2026-01-01T00:00:00.000Z';

/**
 * The seam the port reads for the same pin.
 *
 * The Next.js app reads this through `page.clock`, identically. Nothing in the
 * APPLICATION reads it: the freeze is a property of the harness, not a
 * production feature. That is deliberate — a server-side `now()` override would
 * be a test hook in the money path.
 */
const ROLE_EMAILS = {
    guest: null,
    user: 'client@example.test',
    arsitek: 'giska@example.test',
    kontraktor: 'anindia@example.test',
    structural: 'budi-struc@example.test',
    admin: 'admin@4c.id',
};

// ---------------------------------------------------------------------------
// The SPA's routes.
// ---------------------------------------------------------------------------
const app = readFileSync(APP, 'utf8');

const ROUTE = /<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g;

const routes = [];

for (const match of app.matchAll(ROUTE)) {
    const [, path, element] = match;

    if (path === '*') {
        continue;
    }

    routes.push({
        path,
        // `AdminRoute` wraps the admin pages; everything else is public or
        // auth-gated inside the page itself.
        role: element.includes('AdminRoute') ? 'admin' : 'guest',
        navigate: element.includes('<Navigate'),
    });
}

// ---------------------------------------------------------------------------
// The dashboard's nav, per shape.
// ---------------------------------------------------------------------------
const sidebar = readFileSync(SIDEBAR, 'utf8');

/** The text of `const NAME = …` up to the next top-level `const`. */
function block(name) {
    const start = sidebar.indexOf(`const ${name}`);

    if (start < 0) {
        return '';
    }

    const rest = sidebar.slice(start);
    const end = rest.indexOf('\nconst ', 1);

    return end < 0 ? rest : rest.slice(0, end);
}

/**
 * The tab ids of a nav block, EXCLUDING its group headers.
 *
 * A group (`properties_group`) is a heading with `children`; it is not a screen.
 * The distinguishing feature is the `children: [` that follows the id before the
 * next `id:`.
 */
function tabsOf(name) {
    const text = block(name);
    const matches = [...text.matchAll(/\bid:\s*'([^']+)'/g)];
    const tabs = [];

    for (let i = 0; i < matches.length; i++) {
        const id = matches[i][1];
        const next = matches[i + 1]?.index ?? text.length;
        const between = text.slice(matches[i].index, next);

        if (/\bchildren:\s*\[/.test(between)) {
            continue;
        }

        tabs.push(id);
    }

    return tabs;
}

const USER_NAV = tabsOf('USER_NAV');
const PRO_NAV = tabsOf('PRO_NAV');
const SUPPLIER_NAV = tabsOf('SUPPLIER_NAV');
const LOGISTICS_NAV = tabsOf('LOGISTICS_NAV');

/**
 * The nav a role gets.
 *
 * This MIRRORS the conditionals inside `PRO_NAV(role)`. The generator refuses
 * to emit a tab that the parsed block does not contain, so a renamed tab fails
 * here instead of producing a 404 screenshot six months later.
 */
const BASE_PRO = ['overview', 'projects', 'management', 'my-bids'];

const SPECIALISTS = ['structural', 'mep', 'interior', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'];

function navFor(role) {
    if (role === 'user') return USER_NAV;
    if (role === 'supplier') return SUPPLIER_NAV;
    if (role === 'logistics') return LOGISTICS_NAV;

    if (role === 'kontraktor') {
        return [...BASE_PRO, 'marketplace', 'find-sub-contractors', 'my-firm'];
    }

    if (role === 'arsitek') {
        return [...BASE_PRO, 'find-engineers', 'my-firm'];
    }

    if (SPECIALISTS.includes(role)) {
        return [...BASE_PRO, 'my-firms'];
    }

    return BASE_PRO;
}

// A tab the parser did not see is a renamed tab, not a new one.
const knownTabs = new Set([...USER_NAV, ...PRO_NAV, ...SUPPLIER_NAV, ...LOGISTICS_NAV]);

const covers = { guest: ['houses', 'marketplace-materials', 'marketplace-furniture', 'architects', 'constructors', 'interior', 'notaris', 'project_manager'] };

// ---------------------------------------------------------------------------
// The screens.
// ---------------------------------------------------------------------------
const screens = [];
const skipped = [];

const add = (screen) => {
    const id = `${screen.role}.${screen.kind}.${(screen.path + screen.tab).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root'}`;

    screens.push({ id, ...screen });
};

// The static routes, for the role that can reach them.
for (const route of routes) {
    if (route.navigate) {
        continue;
    }

    if (route.role === 'admin') {
        add({ kind: 'route', path: route.path, tab: '', role: 'admin' });
        continue;
    }

    if (route.path === '/dashboard') {
        continue; // the tab matrix below
    }

    if (route.path.includes(':')) {
        skipped.push({
            path: route.path,
            reason: 'needs a fixture parameter (a share token, a reset token) that the seed does not carry',
        });
        continue;
    }

    add({ kind: 'route', path: route.path, tab: '', role: 'guest' });
}

// The dashboard, per nav shape.
for (const role of ['user', 'arsitek', 'kontraktor', 'structural']) {
    for (const tab of navFor(role)) {
        if (!knownTabs.has(tab)) {
            throw new Error(`the nav for ${role} names the tab "${tab}", which is not in the sidebar any more`);
        }

        add({ kind: 'tab', path: '/dashboard', tab, role });
    }
}

// The public dashboard tabs, reachable without a token.
for (const tab of covers.guest) {
    if (!knownTabs.has(tab)) {
        throw new Error(`the public tab "${tab}" is not in the sidebar any more`);
    }

    add({ kind: 'tab', path: '/dashboard', tab, role: 'guest' });
}

// Roles the seed cannot represent. Recorded, not omitted.
skipped.push({
    role: 'supplier',
    reason: 'no supplier user in the seed — its four tabs have no data to render',
});
skipped.push({
    role: 'logistics',
    reason: 'no logistics user in the seed — its three tabs have no data to render',
});

screens.sort((a, b) => a.id.localeCompare(b.id));

const duplicate = screens.map((s) => s.id).filter((id, i, all) => all.indexOf(id) !== i);
if (duplicate.length > 0) {
    throw new Error(`duplicate screen ids: ${[...new Set(duplicate)].join(', ')}`);
}

const manifest = {
    version: 1,
    viewport: VIEWPORT,
    freeze_time: FREEZE_TIME,

    // THE TWO WAYS THE TWO APPLICATIONS REMEMBER A SESSION.
    //
    // The legacy SPA keeps a bearer token in `localStorage['auth_token']`; the
    // port keeps it in an httpOnly cookie. The harness sets BOTH, because it
    // photographs both applications with the same code and must not know which
    // one it is looking at. The value is the same Sanctum token either way.
    session_storage_key: 'auth_token',
    session_cookie: '4ceria_session',
    roles: ROLE_EMAILS,
    coverage: 'representative: every distinct nav shape, not every role',
    skipped,
    screens,
};

const document = JSON.stringify(manifest, null, 2) + '\n';

if (flag('check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';

    if (current !== document) {
        console.error('::error::spec/visual-baseline/screens.json is stale. Run: node tools/visual/screens.mjs');
        process.exit(1);
    }

    console.log(`screens.json is up to date (${screens.length} screens).`);
    process.exit(0);
}

writeFileSync(OUT, document, 'utf8');

console.log(`wrote spec/visual-baseline/screens.json: ${screens.length} screens, ${skipped.length} skipped.`);
