#!/usr/bin/env node
/**
 * seed-perf.mjs — deterministic synthetic data for query-plan work.
 *
 * The demo seed is far too small for PostgreSQL to choose honestly between a
 * sequential scan and an index. This script builds a SEPARATE database, applies
 * every migration and the demo seed (so enums and reference rows exist), then
 * inserts synthetic rows at the requested scale.
 *
 * USAGE
 *   PGPORT=5432 node tools/bench/seed-perf.mjs
 *   node tools/bench/seed-perf.mjs --database=4ceria_perf --houses=100000 \
 *     --projects=50000 --users=50000
 *
 * SAFETY
 *   The target name must start with `4ceria_perf`; the demo and verification
 *   databases are refused unless `--force` is passed. The target is dropped and
 *   recreated. The data is kept afterwards for `explain.mjs`.
 *
 * `--users` is the total identity count. About 10% become professional and
 * supplier fixtures; the rest are clients. Houses and projects reference those
 * clients.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = join(ROOT, 'db', 'postgres', 'migrations');
const SEED = join(ROOT, 'db', 'postgres', 'seed.sql');

function fail(message) {
    process.stderr.write(`seed-perf: ${message}\n`);
    process.exit(1);
}

function arg(name, fallback) {
    const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}

function integerArg(name, fallback, min, max) {
    const raw = arg(name, String(fallback));
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        fail(`--${name} must be an integer in [${min}, ${max}], got ${raw}`);
    }
    return value;
}

const database = arg('database', '4ceria_perf');
const houses = integerArg('houses', 100000, 0, 5_000_000);
const projects = integerArg('projects', 50000, 0, 2_000_000);
const users = integerArg('users', 50000, 200, 2_000_000);
const orders = integerArg('orders', 5000, 0, 1_000_000);
const conversations = integerArg('conversations', 2000, 0, 500_000);
const notifications = integerArg('notifications', 100000, 0, 5_000_000);
const force = process.argv.includes('--force');

if (!/^[A-Za-z0-9_]+$/.test(database)) {
    fail(`unsafe database name ${JSON.stringify(database)}`);
}
if (!database.startsWith('4ceria_perf') && !force) {
    fail(`refusing to touch ${database}; use a name starting with 4ceria_perf or pass --force`);
}
if (orders > 0 && projects === 0) {
    fail('--orders needs at least one project (project_id is part of the fixture)');
}

function psql(args, { databaseName = 'postgres', input, capture = true } = {}) {
    try {
        return execFileSync(process.env.PSQL_BIN || 'psql', [
            '-d', databaseName,
            '-v', 'ON_ERROR_STOP=1',
            ...args,
        ], {
            input,
            encoding: 'utf8',
            stdio: input !== undefined
                ? ['pipe', 'inherit', 'inherit']
                : capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
            env: process.env,
            maxBuffer: 64 << 20,
        });
    } catch (error) {
        const detail = error.stderr || error.stdout || error.message;
        fail(`psql failed: ${detail}`);
    }
}

function sql(statement, databaseName = 'postgres') {
    return psql(['-At', '-c', statement], { databaseName }).trim();
}

function quoteIdent(value) {
    return `"${value.replaceAll('"', '""')}"`;
}

const professionalRoles = [
    'arsitek', 'kontraktor', 'notaris', 'interior',
    'project_manager', 'structural', 'mep',
];
const perRole = Math.max(25, Math.floor(users / 100));
const suppliers = Math.max(25, Math.floor(users / 100));
const couriers = Math.max(10, Math.floor(users / 200));
const fixtureUsers = professionalRoles.length * perRole + suppliers + couriers;
const clients = Math.max(100, users - fixtureUsers);

process.stdout.write(
    `seed-perf: ${database} — clients=${clients}, per-role=${perRole}, ` +
    `houses=${houses}, projects=${projects}, orders=${orders}, conversations=${conversations}\n`,
);

sql(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
sql(
    `CREATE DATABASE ${quoteIdent(database)} TEMPLATE template0 ` +
    `LC_COLLATE 'C' LC_CTYPE 'C'`,
);

const migrations = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
for (const migration of migrations) {
    psql(['-q', '-f', join(MIGRATIONS, migration)], { databaseName: database, capture: false });
}
psql(['-q', '-f', SEED], { databaseName: database, capture: false });

const profileTables = [
    ['arsitek', 'arsiteks'],
    ['kontraktor', 'kontraktors'],
    ['notaris', 'notaris_profiles'],
    ['interior', 'interior_profiles'],
    ['project_manager', 'project_managers'],
    ['structural', 'structural_engineers'],
    ['mep', 'mep_engineers'],
];

const profileMap = profileTables
    .map(([role, table]) => `
        SELECT '${role}' AS role, id, user_id,
               row_number() OVER (ORDER BY id) AS rn,
               count(*) OVER () AS total
          FROM ${table}`)
    .join(' UNION ALL ');

const bulk = `
INSERT INTO users (name, email, password, role_type, created_at, updated_at)
SELECT 'Perf Client ' || i,
       'perf-client-' || i || '@example.test',
       'x',
       'user',
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval,
       now()
  FROM generate_series(1, ${clients}) AS i;

INSERT INTO users (name, email, password, role_type, created_at, updated_at)
SELECT 'Perf ' || r.role || ' ' || i,
       'perf-' || r.role || '-' || i || '@example.test',
       'x',
       r.role::role_type,
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval,
       now()
  FROM (VALUES ${professionalRoles.map((role) => `('${role}')`).join(',')}) AS r(role),
       generate_series(1, ${perRole}) AS i;

INSERT INTO users (name, email, password, role_type, created_at, updated_at)
SELECT 'Perf Supplier ' || i,
       'perf-supplier-' || i || '@example.test',
       'x',
       'supplier',
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval,
       now()
  FROM generate_series(1, ${suppliers}) AS i;

INSERT INTO users (name, email, password, role_type, created_at, updated_at)
SELECT 'Perf Courier ' || i,
       'perf-courier-' || i || '@example.test',
       'x',
       'logistics',
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval,
       now()
  FROM generate_series(1, ${couriers}) AS i;

INSERT INTO arsiteks (user_id, nama, rate_harga, spesialisasi, lokasi, verification_status, created_at, updated_at)
SELECT u.id, u.name, 150000 + (u.id % 50) * 1000, 'residensial', 'Bandung',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-arsitek-%@example.test';

INSERT INTO kontraktors (user_id, nama, rate_harga, spesialisasi, alamat, verification_status, created_at, updated_at)
SELECT u.id, u.name, 200000 + (u.id % 50) * 1000, 'bangun', 'Bandung',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-kontraktor-%@example.test';

INSERT INTO notaris_profiles (user_id, nama, rate_harga, spesialisasi, lokasi, verification_status, created_at, updated_at)
SELECT u.id, u.name, 100000 + (u.id % 50) * 1000, 'legal', 'Bandung',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-notaris-%@example.test';

INSERT INTO interior_profiles (user_id, nama, rate_harga, spesialisasi, lokasi, verification_status, created_at, updated_at)
SELECT u.id, u.name, 120000 + (u.id % 50) * 1000, 'interior', 'Bandung',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-interior-%@example.test';

INSERT INTO project_managers (user_id, nama, rate_harga, spesialisasi, lokasi, verification_status, created_at, updated_at)
SELECT u.id, u.name, 130000 + (u.id % 50) * 1000, 'manajemen', 'Bandung',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-project_manager-%@example.test';

INSERT INTO structural_engineers (user_id, nama, rate_harga, spesialisasi, lokasi, verification_status, created_at, updated_at)
SELECT u.id, u.name, 140000 + (u.id % 50) * 1000, 'struktur', 'Bandung',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-structural-%@example.test';

INSERT INTO mep_engineers (user_id, nama, rate_harga, spesialisasi, lokasi, verification_status, created_at, updated_at)
SELECT u.id, u.name, 140000 + (u.id % 50) * 1000, 'mep', 'Bandung',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-mep-%@example.test';

INSERT INTO suppliers (user_id, store_name, address, no_telp, category, bio, verification_status, created_at, updated_at)
SELECT u.id, u.name || ' Store', 'Bandung', '0800000000', 'material',
       'Synthetic supplier for plan work.',
       CASE WHEN u.id % 10 = 0 THEN 'pending'::verification_status ELSE 'verified'::verification_status END,
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-supplier-%@example.test';

INSERT INTO courier_profiles (user_id, vehicle_type, license_plate, is_active, verification_status, created_at, updated_at)
SELECT u.id, 'truck', 'B ' || (1000 + (u.id % 9000)) || ' XY', true, 'verified',
       u.created_at, u.updated_at
  FROM users u WHERE u.email LIKE 'perf-courier-%@example.test';

CREATE TEMP TABLE perf_clients AS
SELECT id, row_number() OVER (ORDER BY id) AS rn, count(*) OVER () AS total
  FROM users
 WHERE email LIKE 'perf-client-%@example.test';
CREATE UNIQUE INDEX ON perf_clients (rn);

CREATE TEMP TABLE perf_profiles AS
${profileMap};
CREATE UNIQUE INDEX ON perf_profiles (role, rn);

CREATE TEMP TABLE perf_suppliers AS
SELECT id, user_id, row_number() OVER (ORDER BY id) AS rn, count(*) OVER () AS total
  FROM suppliers;
CREATE UNIQUE INDEX ON perf_suppliers (rn);

INSERT INTO house (name, price, house_desc, br, ba, floors, kab_kota, province, id_user, is_suspended, created_at, updated_at)
SELECT 'Perf House ' || i,
       500000000 + (i % 1000) * 1000000,
       'Synthetic listing ' || i,
       2 + (i % 4), 1 + (i % 3), 1 + (i % 3),
       'Bandung', 'Jawa Barat',
       c.id, false,
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval,
       now()
  FROM generate_series(1, ${houses}) AS i
  JOIN perf_clients c ON c.rn = ((i - 1) % c.total) + 1;

INSERT INTO projects (user_id, title, description, budget, lokasi, jenis_proyek, status,
                      selected_arsitek_id, selected_kontraktor_id, selected_notaris_id,
                      selected_interior_id, pm_id, structural_id, mep_id,
                      target_role, published_bidding_roles, needed_phases,
                      created_at, updated_at, warranty_end_at)
SELECT c.id,
       'Perf Project ' || i,
       'Synthetic project ' || i,
       100000000 + (i % 500) * 1000000,
       'Bandung', 'residensial',
       (CASE WHEN i % 5 = 0 THEN 'in_progress'
             WHEN i % 3 = 0 THEN 'open'
             WHEN i % 7 = 0 THEN 'completed'
             ELSE 'accepted_arsitek' END)::project_status,
       a.id, k.id, n.id, it.id, pm.id, s.id, m.id,
       'arsitek', '["arsitek"]'::jsonb, '["design"]'::jsonb,
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval,
       now(),
       CASE WHEN i % 20 = 0 THEN now() - interval '30 days' ELSE NULL END
  FROM generate_series(1, ${projects}) AS i
  JOIN perf_clients c
    ON c.rn = CASE WHEN i <= 500 THEN 1 ELSE ((i - 1) % c.total) + 1 END
  JOIN perf_profiles a ON a.role = 'arsitek' AND a.rn = ((i - 1) % a.total) + 1
  JOIN perf_profiles k ON k.role = 'kontraktor' AND k.rn = ((i - 1) % k.total) + 1
  JOIN perf_profiles n ON n.role = 'notaris' AND n.rn = ((i - 1) % n.total) + 1
  JOIN perf_profiles it ON it.role = 'interior' AND it.rn = ((i - 1) % it.total) + 1
  JOIN perf_profiles s ON s.role = 'structural' AND s.rn = ((i - 1) % s.total) + 1
  JOIN perf_profiles m ON m.role = 'mep' AND m.rn = ((i - 1) % m.total) + 1
  JOIN perf_profiles pm ON pm.role = 'project_manager' AND pm.rn = ((i - 1) % pm.total) + 1;

INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id,
                  price, status, created_at, updated_at)
SELECT p.id, 'arsitek', a.user_id, a.id, a.id,
       90000000 + (p.id % 100) * 100000,
       (CASE WHEN p.id % 11 = 0 THEN 'accepted' WHEN p.id % 5 = 0 THEN 'shortlisted' ELSE 'pending' END)::bid_status,
       p.created_at, p.updated_at
  FROM projects p
  JOIN arsiteks a ON a.id = p.selected_arsitek_id
 WHERE p.id % 2 = 0;

INSERT INTO project_payment_termins (project_id, role_type, recipient_id, label, percentage,
                                     amount, retention_amount, net_amount, status, created_at, updated_at)
SELECT p.id, 'arsitek', p.user_id, 'Termin ' || t.n, 50,
       10000000, 1000000, 9000000, 'paid',
       p.created_at, p.updated_at
  FROM projects p
  JOIN generate_series(1, 2) AS t(n) ON true
 WHERE p.id % 3 = 0;

INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title,
                                         reference_type_id, reference_id, transaction_date,
                                         created_at, updated_at)
SELECT p.id, 'payment', 5000000, 'Synthetic payment', NULL, p.id, p.created_at, p.created_at, p.updated_at
  FROM projects p
 WHERE p.id % 3 = 0;

INSERT INTO materials (supplier_id, name, description, price, unit, category, stock, is_available, created_at, updated_at)
SELECT s.id, 'Perf Material ' || s.id, 'Synthetic material', 50000 + (s.id % 100) * 1000,
       'sak', 'material', 1000, true, s.created_at, s.updated_at
  FROM suppliers s;

CREATE TEMP TABLE perf_projects AS
SELECT id, row_number() OVER (ORDER BY id) AS rn, count(*) OVER () AS total
  FROM projects;
CREATE UNIQUE INDEX ON perf_projects (rn);

INSERT INTO material_orders (user_id, supplier_id, project_id, status, total_price,
                             shipping_cost, whatsapp_order_id, created_at, updated_at)
SELECT c.id, s.id, p.id,
       (CASE WHEN i % 7 = 0 THEN 'delivered' WHEN i % 3 = 0 THEN 'completed' ELSE 'paid' END)::material_orders_status,
       500000 + (i % 100) * 10000, 25000, 'perf-order-' || i,
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval,
       now() - ((i % 720) || ' days')::interval - (i || ' seconds')::interval
  FROM generate_series(1, ${orders}) AS i
  JOIN perf_clients c ON c.rn = ((i - 1) % c.total) + 1
  JOIN perf_suppliers s ON s.rn = ((i - 1) % s.total) + 1
  JOIN perf_projects p ON p.rn = ((i - 1) % p.total) + 1;

INSERT INTO material_order_items (order_id, material_id, quantity, price_at_order, created_at, updated_at)
SELECT o.id, m.id, 1 + (o.id % 5), 50000, o.created_at, o.updated_at
  FROM material_orders o
  JOIN LATERAL (SELECT id FROM materials WHERE supplier_id = o.supplier_id ORDER BY id LIMIT 1) AS m ON true;

INSERT INTO material_order_reviews (user_id, supplier_id, order_id, rating, comment, created_at, updated_at)
SELECT o.user_id, o.supplier_id, o.id, 3 + (o.id % 3), 'Synthetic review', o.created_at, o.updated_at
  FROM material_orders o
 WHERE o.id % 10 = 0;

INSERT INTO conversations (user_one_id, user_two_id, last_message_at, created_at, updated_at)
SELECT c.id, p.user_id,
       now() - ((i % 720) || ' hours')::interval,
       now() - ((i % 720) || ' days')::interval,
       now()
  FROM generate_series(1, ${conversations}) AS i
  JOIN perf_clients c ON c.rn = 1
  JOIN perf_profiles p ON p.role = 'arsitek' AND p.rn = ((i - 1) % p.total) + 1
 ON CONFLICT (user_one_id, user_two_id) DO NOTHING;

INSERT INTO chat_messages (conversation_id, sender_id, content, is_read, created_at, updated_at)
SELECT c.id,
       CASE WHEN m.n % 2 = 0 THEN c.user_one_id ELSE c.user_two_id END,
       'Synthetic message ' || m.n,
       m.n < 5,
       c.last_message_at - ((5 - m.n) || ' minutes')::interval,
       c.last_message_at - ((5 - m.n) || ' minutes')::interval
  FROM conversations c
  JOIN generate_series(1, 5) AS m(n) ON true
 WHERE c.user_one_id IN (SELECT id FROM perf_clients)
   AND c.user_two_id IN (SELECT user_id FROM perf_profiles WHERE role = 'arsitek');

INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at, push_sent_at)
SELECT c.id,
       'perf.test', 'Synthetic notification ' || i, 'Body ' || i, '{}'::json,
       now() - ((i % 180) || ' days')::interval - (i || ' seconds')::interval,
       now(), CASE WHEN i % 2 = 0 THEN now() ELSE NULL END
  FROM generate_series(1, ${notifications}) AS i
  JOIN perf_clients c ON c.rn = ((i - 1) % c.total) + 1;

INSERT INTO mail_outbox (to_email, subject, html, text_body, created_at)
SELECT 'perf-client-' || (1 + (i % ${clients})) || '@example.test',
       'Perf mail ' || i, '<p>perf</p>', 'perf',
       now() - ((i % 30) || ' days')::interval
  FROM generate_series(1, ${Math.min(orders, 10000)}) AS i;

INSERT INTO rate_limit_hits (key, hit_at)
SELECT 'perf-key-' || (i % 500), now() - ((i % 120) || ' minutes')::interval
  FROM generate_series(1, ${Math.min(notifications, 200000)}) AS i;

INSERT INTO personal_access_tokens (tokenable_type, tokenable_id, name, token, created_at, updated_at, expires_at)
SELECT 'App\\Models\\User', c.id, 'perf', 'perf-token-' || i, now() - interval '1 day', now(),
       CASE WHEN i % 2 = 0 THEN now() - interval '1 hour' ELSE now() + interval '30 days' END
  FROM generate_series(1, 2000) AS i
  JOIN perf_clients c ON c.rn = ((i - 1) % c.total) + 1;

ANALYZE;
`;

psql(['-q', '-f', '-'], { databaseName: database, input: bulk, capture: false });

const counts = sql(`
  SELECT
    (SELECT count(*) FROM users) || ' users, ' ||
    (SELECT count(*) FROM house) || ' houses, ' ||
    (SELECT count(*) FROM projects) || ' projects, ' ||
    (SELECT count(*) FROM bids) || ' bids, ' ||
    (SELECT count(*) FROM material_orders) || ' orders, ' ||
    (SELECT count(*) FROM conversations) || ' conversations, ' ||
    (SELECT count(*) FROM chat_messages) || ' messages, ' ||
    (SELECT count(*) FROM notifications) || ' notifications'
`, database);

process.stdout.write(`seed-perf: ${counts}\n`);
process.stdout.write(`seed-perf: kept ${database}; run node tools/bench/explain.mjs --database=${database}\n`);
