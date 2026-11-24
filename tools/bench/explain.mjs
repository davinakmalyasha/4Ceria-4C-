#!/usr/bin/env node
/**
 * explain.mjs — the reproducible EXPLAIN pass for the list and sweep queries.
 *
 * USAGE
 *   node tools/bench/explain.mjs --database=4ceria_perf
 *   node tools/bench/explain.mjs --database=4ceria_perf --compare-indexes
 *   node tools/bench/explain.mjs --database=4ceria_perf --json=perf.json
 *
 * `--compare-indexes` drops the three indexes added by 0030, measures the
 * queries, recreates them, and measures again. The database must be disposable.
 *
 * Timings are a local signal, not a CI gate. `--strict` fails only when a plan
 * that should be index-backed is a sequential scan over a large relation.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function fail(message) {
    process.stderr.write(`explain: ${message}\n`);
    process.exit(1);
}

function arg(name, fallback) {
    const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}

const database = arg('database', '4ceria_perf');
const compare = process.argv.includes('--compare-indexes');
const strict = process.argv.includes('--strict');
const jsonPath = arg('json', '');

if (!/^[A-Za-z0-9_]+$/.test(database)) {
    fail(`unsafe database name ${JSON.stringify(database)}`);
}
if (!database.startsWith('4ceria_perf')) {
    fail('refusing to run outside a 4ceria_perf database');
}

function psql(statement, { capture = true } = {}) {
    try {
        return execFileSync(process.env.PSQL_BIN || 'psql', [
            '-d', database,
            '-v', 'ON_ERROR_STOP=1',
            '-At', '-c', statement,
        ], {
            encoding: 'utf8',
            stdio: capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
            env: process.env,
            maxBuffer: 64 << 20,
        }).trim();
    } catch (error) {
        const detail = error.stderr || error.stdout || error.message;
        fail(`psql failed: ${detail}`);
    }
}

function scalar(statement) {
    const value = psql(statement);
    if (!/^-?\d+$/.test(value)) {
        fail(`expected an integer from ${statement}, got ${JSON.stringify(value)}`);
    }
    return value;
}

const client = scalar(`SELECT id FROM users WHERE email = 'perf-client-1@example.test' LIMIT 1`);
const supplier = scalar(`SELECT id FROM suppliers ORDER BY id LIMIT 1`);
const project = scalar(`SELECT id FROM projects WHERE user_id = ${client} ORDER BY id LIMIT 1`);

if (project === '') {
    fail('no projects for perf-client-1; run seed-perf.mjs at a larger scale');
}

const inbox = `SELECT id FROM conversations
                WHERE user_one_id = ${client} OR user_two_id = ${client}
                ORDER BY last_message_at DESC NULLS LAST, id ASC LIMIT 100`;

const queries = [
    {
        name: 'houses newest feed',
        sql: `SELECT id FROM house WHERE is_suspended = false ORDER BY created_at DESC LIMIT 12`,
        expectIndex: true,
    },
    {
        name: 'houses price sort',
        sql: `SELECT id FROM house WHERE is_suspended = false ORDER BY price LIMIT 12`,
        expectIndex: true,
    },
    {
        name: 'admin houses',
        sql: `SELECT id FROM house ORDER BY created_at DESC, id ASC LIMIT 15 OFFSET 0`,
        expectIndex: true,
    },
    {
        name: 'admin projects',
        sql: `SELECT id FROM projects ORDER BY created_at DESC, id ASC LIMIT 15`,
        expectIndex: true,
    },
    {
        name: 'admin users',
        sql: `SELECT id FROM users ORDER BY created_at DESC, id ASC LIMIT 20`,
        expectIndex: true,
    },
    {
        name: 'admin professionals pending',
        sql: `SELECT id FROM arsiteks t
               WHERE t.verification_status = 'pending'
                 AND (t.foto IS NOT NULL OR t.file_portofolio IS NOT NULL
                      OR t.file_sertifikat IS NOT NULL OR t.npwp IS NOT NULL
                      OR t.siup IS NOT NULL OR t.identity_number IS NOT NULL)
               ORDER BY t.id`,
        expectIndex: false,
    },
    {
        name: 'directory page',
        sql: `SELECT id FROM arsiteks WHERE verification_status = 'verified'
               ORDER BY id LIMIT 24 OFFSET 0`,
        expectIndex: true,
    },
    {
        name: 'marketplace suppliers',
        sql: `SELECT id FROM suppliers WHERE verification_status = 'verified' ORDER BY id`,
        expectIndex: false,
    },
    {
        name: 'material orders by buyer',
        sql: `SELECT id FROM material_orders WHERE user_id = ${client}
               ORDER BY created_at DESC, id ASC`,
        expectIndex: true,
    },
    {
        name: 'material orders by supplier',
        sql: `SELECT id FROM material_orders WHERE supplier_id = ${supplier}
               ORDER BY created_at DESC, id ASC`,
        expectIndex: true,
    },
    {
        name: 'conversations inbox',
        sql: `SELECT id FROM conversations
               WHERE user_one_id = ${client} OR user_two_id = ${client}
               ORDER BY last_message_at DESC NULLS LAST, id ASC LIMIT 100`,
        expectIndex: true,
    },
    {
        name: 'conversation last messages',
        sql: `SELECT DISTINCT ON (conversation_id) conversation_id, id
               FROM chat_messages
              WHERE conversation_id IN (${inbox})
              ORDER BY conversation_id, id DESC`,
        expectIndex: true,
    },
    {
        name: 'conversation unread counts',
        sql: `SELECT conversation_id, count(*)
               FROM chat_messages
              WHERE conversation_id IN (${inbox})
                AND sender_id <> ${client} AND is_read = false
              GROUP BY conversation_id`,
        expectIndex: true,
    },
    {
        name: 'owner projects',
        sql: `SELECT id FROM projects WHERE user_id = ${client}
               ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET 0`,
        expectIndex: true,
    },
    {
        name: 'retention candidates',
        sql: `SELECT id FROM projects
               WHERE warranty_end_at IS NOT NULL AND warranty_end_at < now()
               ORDER BY id`,
        expectIndex: false,
    },
    {
        name: 'auto-complete candidates',
        sql: `SELECT id FROM material_orders
               WHERE status::text = 'delivered'
                 AND updated_at < now() - interval '3 days'`,
        expectIndex: false,
    },
    {
        name: 'snag escalation candidates',
        sql: `SELECT id FROM project_snag_items
               WHERE status::text NOT IN ('resolved','closed')
                 AND due_at IS NOT NULL AND due_at < now()
                 AND escalated_at IS NULL`,
        expectIndex: false,
    },
    {
        name: 'prune notifications',
        sql: `SELECT id FROM notifications WHERE created_at < now() - interval '90 days'`,
        expectIndex: false,
    },
    {
        name: 'prune expired tokens',
        sql: `SELECT id FROM personal_access_tokens
               WHERE expires_at IS NOT NULL AND expires_at <= now()`,
        expectIndex: false,
    },
    {
        name: 'prune rate limits',
        sql: `SELECT key FROM rate_limit_hits WHERE hit_at < now() - interval '1 hour'`,
        expectIndex: false,
    },
];

const perfIndexes = [
    ['house_is_suspended_price_idx', 'CREATE INDEX house_is_suspended_price_idx ON house (is_suspended, price)'],
    ['projects_created_at_id_idx', 'CREATE INDEX projects_created_at_id_idx ON projects (created_at DESC, id ASC)'],
    ['users_created_at_id_idx', 'CREATE INDEX users_created_at_id_idx ON users (created_at DESC, id ASC)'],
];

function walk(node, visit) {
    visit(node);
    for (const child of node.Plans ?? []) {
        walk(child, visit);
    }
}

function measure(query) {
    const output = psql(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`);
    let parsed;
    try {
        parsed = JSON.parse(output);
    } catch (error) {
        fail(`could not parse the plan for ${query.name}: ${error.message}`);
    }
    const root = parsed[0]?.Plan;
    if (!root) {
        fail(`empty plan for ${query.name}`);
    }

    const nodes = [];
    walk(root, (node) => nodes.push(node));

    const seqScans = nodes
        .filter((node) => node['Node Type'] === 'Seq Scan' && node['Relation Name'])
        .map((node) => ({
            relation: node['Relation Name'],
            planRows: node['Plan Rows'] ?? 0,
            actualRows: node['Actual Rows'] ?? 0,
        }));

    return {
        name: query.name,
        expectIndex: query.expectIndex,
        planningMs: parsed[0]['Planning Time'] ?? 0,
        executionMs: parsed[0]['Execution Time'] ?? 0,
        rootNode: root['Node Type'],
        rootRows: root['Actual Rows'] ?? 0,
        buffers: root['Shared Hit Blocks'] ?? 0,
        seqScans,
    };
}

function runAll() {
    return queries.map(measure);
}

function printTable(rows) {
    const header = ['query', 'ms', 'top node', 'rows', 'seq scan'];
    const widths = [34, 9, 24, 8, 34];
    const line = (cells) => cells
        .map((cell, index) => String(cell).padEnd(widths[index]))
        .join('  ')
        .trimEnd();
    process.stdout.write(`\n${line(header)}\n`);
    process.stdout.write(`${'-'.repeat(widths.reduce((sum, width) => sum + width + 2, 0))}\n`);
    for (const row of rows) {
        const scans = row.seqScans.length === 0
            ? '-'
            : row.seqScans.map((scan) => `${scan.relation}(${scan.actualRows})`).join(', ');
        process.stdout.write(line([
            row.name,
            row.executionMs.toFixed(2),
            row.rootNode,
            row.actualRows ?? row.rootRows,
            scans,
        ]) + '\n');
    }
}

function assertStrict(rows) {
    if (!strict) {
        return;
    }
    const largeRelations = new Set(['house', 'projects', 'users', 'material_orders', 'notifications', 'chat_messages']);
    for (const row of rows) {
        if (!row.expectIndex) {
            continue;
        }
        for (const scan of row.seqScans) {
            if (largeRelations.has(scan.relation) && scan.planRows > 50000) {
                fail(`${row.name} sequential-scans ${scan.relation} (${scan.planRows} plan rows); add or fix an index`);
            }
        }
    }
}

let before = null;
if (compare) {
    for (const [name] of perfIndexes) {
        psql(`DROP INDEX IF EXISTS ${name}`);
    }
    before = runAll();
    for (const [, create] of perfIndexes) {
        psql(create);
    }
}

const after = runAll();

if (before) {
    process.stdout.write('\nBefore 0030 indexes\n');
    printTable(before);
    process.stdout.write('\nAfter 0030 indexes\n');
    printTable(after);
    process.stdout.write('\nPer-query delta (before -> after)\n');
    for (let index = 0; index < queries.length; index++) {
        const delta = before[index].executionMs - after[index].executionMs;
        process.stdout.write(
            `${queries[index].name}: ${before[index].executionMs.toFixed(2)} ms -> ` +
            `${after[index].executionMs.toFixed(2)} ms (${delta >= 0 ? '-' : '+'}${Math.abs(delta).toFixed(2)} ms)\n`,
        );
    }
} else {
    printTable(after);
}

if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ database, before, after }, null, 2));
    process.stdout.write(`\nwrote ${jsonPath}\n`);
}

assertStrict(after);
