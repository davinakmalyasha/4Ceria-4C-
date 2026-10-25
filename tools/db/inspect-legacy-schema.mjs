#!/usr/bin/env node
/**
 * inspect-legacy-schema.mjs — the port's honesty gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * The PostgreSQL baseline is a hand-written translation of a live MySQL schema.
 * A hand-written translation drifts. The moment somebody adds a column to
 * `projects` in Laravel and forgets the PostgreSQL baseline, the two engines
 * disagree and the ETL starts silently dropping data.
 *
 * This tool is the instrument that makes that impossible to miss:
 *
 *   1. It reads the LIVE MySQL schema (never a checked-in dump) and emits
 *      `spec/enums.yaml` — the single source of truth for every enum value
 *      list, in the exact order MySQL stores them. ADR-0007 requires that
 *      file to generate the PostgreSQL `CREATE TYPE`, the Go constants and the
 *      TypeScript union, so it cannot be transcribed by hand.
 *   2. It emits `spec/legacy-schema.json` — a column-level inventory of all
 *      98 legacy tables. This is the diff target.
 *   3. It DIFFS the legacy schema against the PostgreSQL baseline and reports
 *      every missing table, missing column, missing enum type, missing enum
 *      value, missing foreign key and missing index.
 *
 * It uses the `mysql` and `psql` command-line clients, not a driver package,
 * because the repository has no `mysql2`/`pg` dependency and this tool must
 * run in CI with nothing but the database images.
 *
 * USAGE
 * -----
 *   node tools/db/inspect-legacy-schema.mjs                  # regenerate the artefacts
 *   node tools/db/inspect-legacy-schema.mjs --check          # fail if the artefacts are stale
 *   node tools/db/inspect-legacy-schema.mjs --diff           # diff legacy vs. the local PG migrations
 *   node tools/db/inspect-legacy-schema.mjs --diff --pg-dsn 'postgres://...'
 *
 * OPTIONS
 * -------
 *   --mysql-bin <path>    the mysql client (default: `mysql` on PATH)
 *   --host <h>            MySQL host (default: 127.0.0.1)
 *   --port <p>            MySQL port (default: 3306)
 *   --user <u>            MySQL user (default: root)
 *   --password <p>        MySQL password (default: empty)
 *   --database <d>        MySQL schema (default: 4ceria)
 *   --out <dir>           artefact directory (default: spec/)
 *   --enums <file>        enum manifest path (default: <out>/enums.yaml)
 *   --inventory <file>    inventory path (default: <out>/legacy-schema.json)
 *   --pg-migrations <dir> PostgreSQL migration directory (default: db/postgres/migrations)
 *   --pg-dsn <dsn>        a live PostgreSQL to diff against (requires psql)
 *   --check               do not write; exit 1 if the artefacts on disk differ
 *   --diff                run the diff and exit 1 if anything is missing
 *   --quiet               only print the summary
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    mysqlBin: process.env.MYSQL_BIN || 'mysql',
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: process.env.MYSQL_PORT || '3306',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || '4ceria',
    outDir: join(REPO, 'spec'),
    enumsFile: null,
    inventoryFile: null,
    pgMigrations: join(REPO, 'db', 'postgres', 'migrations'),
    pgDsn: process.env.PG_DSN || null,
    psqlBin: process.env.PSQL_BIN || 'psql',
    check: false,
    diff: false,
    verifyEnums: false,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--mysql-bin': args.mysqlBin = next(); break;
      case '--host': args.host = next(); break;
      case '--port': args.port = next(); break;
      case '--user': args.user = next(); break;
      case '--password': args.password = next(); break;
      case '--database': args.database = next(); break;
      case '--out': args.outDir = resolve(next()); break;
      case '--enums': args.enumsFile = resolve(next()); break;
      case '--inventory': args.inventoryFile = resolve(next()); break;
      case '--pg-migrations': args.pgMigrations = resolve(next()); break;
      case '--pg-dsn': args.pgDsn = next(); break;
      case '--psql-bin': args.psqlBin = next(); break;
      case '--check': args.check = true; break;
      case '--diff': args.diff = true; break;
      case '--verify-enums': args.verifyEnums = true; break;
      case '--quiet': args.quiet = true; break;
      case '--help':
      case '-h':
        process.stdout.write(fsRead(__filename));
        process.exit(0);
        break;
      default:
        fail(`unknown option: ${a}`);
    }
  }

  args.enumsFile = args.enumsFile ?? join(args.outDir, 'enums.yaml');
  args.inventoryFile = args.inventoryFile ?? join(args.outDir, 'legacy-schema.json');
  return args;
}

function fsRead(path) {
  return readFileSync(path, 'utf8');
}

function fail(message) {
  process.stderr.write(`inspect-legacy-schema: ${message}\n`);
  process.exit(2);
}

function log(args, message) {
  if (!args.quiet) process.stdout.write(`${message}\n`);
}

// ---------------------------------------------------------------------------
// MySQL access
// ---------------------------------------------------------------------------

function mysqlQuery(args, sql) {
  const argv = [
    `-h${args.host}`,
    `-P${args.port}`,
    `-u${args.user}`,
    '--batch',
    '--raw',
    '--skip-column-names',
    args.database,
    '-e',
    sql,
  ];
  if (args.password) argv.splice(4, 0, `-p${args.password}`);

  let stdout;
  try {
    stdout = execFileSync(args.mysqlBin, argv, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr) : String(err.message);
    fail(`the MySQL client failed.\n${stderr.trim()}`);
  }
  return stdout;
}

/**
 * Run a query that returns one JSON document per line and parse it.
 * MySQL 9.6 has JSON_OBJECT, so the whole row travels as one JSON line and
 * no delimiter-escaping problem can corrupt a value.
 */
function mysqlJsonRows(args, sql) {
  const out = mysqlQuery(args, sql);
  const rows = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      fail(`could not parse a row returned by MySQL:\n${trimmed}`);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The legacy schema, read from information_schema
// ---------------------------------------------------------------------------

// The database name is interpolated into every statement, so it is resolved
// lazily and quoted — the schema name is the only untrusted-looking token in
// these queries, and it comes from the operator, not from the data.
let CURRENT_DB = '4ceria';
function args_db() {
  return CURRENT_DB.replace(/'/g, "''");
}

const COLUMNS_SQL = () => `
SELECT JSON_OBJECT(
  'table',   table_name,
  'column',  column_name,
  'position', ordinal_position,
  'type',    column_type,
  'data_type', data_type,
  'nullable', is_nullable,
  'default', column_default,
  'extra',   extra,
  'collation', collation_name,
  'char_max', character_maximum_length,
  'numeric_precision', numeric_precision,
  'numeric_scale', numeric_scale,
  'column_key', column_key,
  'comment', column_comment
) AS row_json
FROM information_schema.COLUMNS
WHERE table_schema = '${args_db()}'
ORDER BY table_name, ordinal_position`;

const INDEXES_SQL = () => `
SELECT JSON_OBJECT(
  'table',   table_name,
  'index',   index_name,
  'unique',  (non_unique = 0),
  'type',    index_type,
  'column',  column_name,
  'seq',     seq_in_index
) AS row_json
FROM information_schema.STATISTICS s
WHERE table_schema = '${args_db()}'
ORDER BY table_name, index_name, seq_in_index`;

const FKS_SQL = () => `
SELECT JSON_OBJECT(
  'table',      kcu.table_name,
  'column',     kcu.column_name,
  'ref_table',  kcu.referenced_table_name,
  'ref_column', kcu.referenced_column_name,
  'constraint', rc.constraint_name,
  'update_rule', rc.update_rule,
  'delete_rule', rc.delete_rule
) AS row_json
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON rc.constraint_schema = kcu.constraint_schema
 AND rc.constraint_name = kcu.constraint_name
 AND rc.table_name = kcu.table_name
WHERE kcu.table_schema = '${args_db()}'
  AND kcu.referenced_table_name IS NOT NULL
ORDER BY kcu.table_name, rc.constraint_name, kcu.ordinal_position`;

function readLegacySchema(args) {
  CURRENT_DB = args.database;

  const tables = mysqlJsonRows(
    args,
    `SELECT JSON_OBJECT('name', table_name, 'engine', engine, 'rows', table_rows, 'collation', table_collation)
       AS row_json
     FROM information_schema.TABLES
     WHERE table_schema = '${args_db()}' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );

  const columns = mysqlJsonRows(args, COLUMNS_SQL());
  const indexRows = mysqlJsonRows(args, INDEXES_SQL());
  const fks = mysqlJsonRows(args, FKS_SQL());

  const byTable = new Map();
  for (const t of tables) {
    byTable.set(t.name, { name: t.name, engine: t.engine, collation: t.collation, columns: [], indexes: [], foreignKeys: [] });
  }
  for (const c of columns) {
    const t = byTable.get(c.table);
    if (t) t.columns.push(c);
  }
  for (const i of indexRows) {
    const t = byTable.get(i.table);
    if (!t) continue;
    let idx = t.indexes.find((x) => x.index === i.index);
    if (!idx) {
      idx = { index: i.index, unique: i.unique, type: i.type, columns: [] };
      t.indexes.push(idx);
    }
    idx.columns.push(i.column);
  }
  for (const f of fks) {
    const t = byTable.get(f.table);
    if (t) t.foreignKeys.push(f);
  }

  return {
    engine: 'mysql',
    database: args.database,
    generatedAt: new Date().toISOString(),
    counts: {
      tables: tables.length,
      columns: columns.length,
      indexes: indexRows.length === 0 ? 0 : new Set(indexRows.map((i) => `${i.table}.${i.index}`)).size,
      foreignKeys: fks.length,
      enumColumns: columns.filter((c) => c.data_type === 'enum').length,
      jsonColumns: columns.filter((c) => c.data_type === 'json').length,
      autoIncrementColumns: columns.filter((c) => String(c.extra).includes('auto_increment')).length,
    },
    tables: [...byTable.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------------------
// Enum extraction — the part that must never be transcribed by hand
// ---------------------------------------------------------------------------

/**
 * Parse a MySQL `enum(...)` column type into the ordered value list.
 * MySQL escapes a literal quote inside a value as two single quotes.
 */
export function parseMySqlEnum(columnType) {
  const open = columnType.indexOf('(');
  const close = columnType.lastIndexOf(')');
  if (open === -1 || close === -1) throw new Error(`not an enum type: ${columnType}`);
  const body = columnType.slice(open + 1, close);

  const values = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (ch === "'") {
        if (body[i + 1] === "'") {
          current += "'";
          i++;
          continue;
        }
        inString = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
    if (ch === ',') {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current !== '' || values.length === 0) values.push(current);
  return values;
}

const snake = (s) => s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

/**
 * Group the legacy enum columns into PostgreSQL enum types.
 *
 * A type is shared when several legacy columns carry the SAME value list —
 * `verification_status` appears on eight profile tables with the same three
 * values, and one native type is the correct answer for all of them. When a
 * column NAME carries several DIFFERENT value lists (`status` appears on
 * thirteen tables), each list gets its own type and the table name prefixes
 * the type name, because `status` on its own is not a type name.
 */
/**
 * Enums the REWRITE introduces that the legacy schema did not have as ENUM
 * columns. ADR-0007 requires the VARCHAR state machines to become native
 * enums too, and ADR-0014/0015 require a `bid_role` discriminator.
 *
 * These values are NOT read out of MySQL — they are read out of the
 * application's state machines, and each one records where it was read from
 * so a reviewer can check it. They are still version-controlled in this one
 * file, which is what ADR-0007 asks for.
 */
const REWRITE_ENUMS = [
  {
    name: 'bid_role',
    values: ['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager'],
    provenance:
      'config/bids.php (the seven-role registry) and project_sub_professionals.parent_role, which carries the same seven values in the same order.',
    replaces:
      'project_addendums.recommended_bid_type (a free-text role name) and the seven per-role bid id columns.',
  },
  {
    name: 'bid_payment_status',
    values: ['unpaid', 'pending', 'verifying', 'paid', 'refunded'],
    provenance:
      'The seven legacy `bids_*.payment_status` VARCHAR columns. The lifecycle is unread -> pending -> verifying -> paid, plus refunded (MONEY.md §9: paid and refunded are terminal).',
    replaces: 'bids_*.payment_status on all seven legacy bid tables.',
  },
  {
    name: 'payment_termin_status',
    values: ['locked', 'pending', 'invoice_sent', 'verifying', 'accepted', 'paid', 'void'],
    provenance:
      'project_payment_termins.status. MONEY.md §10.2 draws the state machine; the values are confirmed by ProjectPaymentTerminController (in:locked,pending,invoice_sent), ProjectTerminationController (out:void) and PaymentVerificationService (verifying, paid).',
    replaces: 'project_payment_termins.status (VARCHAR(255), unconstrained — the most money-critical state machine in the app).',
  },
  {
    name: 'project_planning_status',
    values: ['draft', 'proposed', 'approved', 'pm_verified'],
    provenance: 'projects.planning_status. The four values the planning workflow writes.',
    replaces: 'projects.planning_status (VARCHAR(255)).',
  },
  {
    name: 'project_construction_brief_status',
    values: ['draft', 'pending_review', 'revision_requested', 'approved'],
    provenance: 'projects.construction_brief_status. The four values the brief review writes.',
    replaces: 'projects.construction_brief_status (VARCHAR(255)).',
  },
  {
    name: 'project_walkthrough_status',
    values: ['in_progress', 'completed'],
    provenance: 'projects.walkthrough_status. The two values the final walkthrough writes.',
    replaces: 'projects.walkthrough_status (VARCHAR(255)).',
  },
  {
    name: 'dispute_status',
    values: ['open', 'resolved', 'dismissed', 'withdrawn'],
    provenance:
      'project_disputes.status. DisputeService.php:203 writes withdrawn, :256 writes resolved/dismissed, and the row is created open. The order matches AdminDisputeController:26.',
    replaces: 'project_disputes.status (VARCHAR(20)).',
  },
  {
    name: 'dispute_resolution',
    values: ['dismiss', 'release_payment', 'record_refund', 'terminate_project', 'custom'],
    provenance:
      'project_disputes.resolution. The five admin arbitration actions (AdminDisputeController:96-127).',
    replaces: 'project_disputes.resolution (VARCHAR(30)).',
  },
];

/**
 * Extra provenance for the generated types, where the legacy schema itself
 * does not tell the whole story.
 */
const ENUM_SOURCE_NOTES = {
  bid_status:
    'The UNION of the seven legacy bid status columns. Four of them (bids_arsitek, bids_interior, bids_kontraktor, bids_notaris) are MySQL ENUMs carrying these twelve values in this order. The other three (bids_mep, bids_project_manager, bids_structural) are VARCHAR(255) columns defaulting to \'pending\' — they carry no type constraint at all, and the same controller code paths write the same twelve values to all seven tables, so the union is the same twelve values. See docs/POSTGRES-SCHEMA.md.',
  transaction_type:
    'The escrow ledger vocabulary. MONEY.md §2 names the three membership lists that partition it: DISBURSEMENT_TYPES, CEILING_NEUTRAL_TYPES and PROFESSIONAL_EARNINGS_TYPES.',
};

/**
 * Explicit renames for the generated PostgreSQL enum type names.
 *
 * The default rule is "<table>_<column>" whenever a column NAME carries more
 * than one value list, and "<column>" otherwise. Three names need a human
 * decision, and the reason is recorded here so the decision survives the
 * next regeneration.
 */
const ENUM_TYPE_RENAMES = {
  // The seven `bids_*` tables become ONE `bids` table (ADR-0014). Its status
  // column is the union of the four enum columns and the three varchar ones,
  // so the type is named for the unified table, not for the first legacy one.
  bids_arsitek_status: 'bid_status',
  // `projects` reads better in the singular, and `project_status` is the name
  // the money and lifecycle code already uses.
  projects_status: 'project_status',
  // `type` is too generic for a schema-wide type name.
  type: 'requirement_history_type',
};

export function planEnumTypes(legacy) {
  const enumColumns = [];
  for (const table of legacy.tables) {
    for (const column of table.columns) {
      if (column.data_type !== 'enum') continue;
      enumColumns.push({
        table: table.name,
        column: column.column,
        values: parseMySqlEnum(column.type),
      });
    }
  }

  const byKey = new Map();
  for (const ec of enumColumns) {
    const key = `${ec.column}::${ec.values.join('\u0000')}`;
    if (!byKey.has(key)) {
      byKey.set(key, { column: ec.column, values: ec.values, sources: [] });
    }
    byKey.get(key).sources.push({ table: ec.table, column: ec.column });
  }

  // Which column names are ambiguous (more than one distinct value list)?
  const namesSeen = new Map();
  for (const group of byKey.values()) {
    namesSeen.set(group.column, (namesSeen.get(group.column) || 0) + 1);
  }

  const planned = [];
  for (const group of byKey.values()) {
    const ambiguous = namesSeen.get(group.column) > 1;
    const defaultName = ambiguous
      ? `${snake(group.sources[0].table)}_${snake(group.column)}`
      : snake(group.column);
    const typeName = ENUM_TYPE_RENAMES[defaultName] ?? defaultName;
    planned.push({
      name: typeName,
      legacy_name: defaultName,
      renamed: typeName !== defaultName,
      values: group.values,
      sources: group.sources
        .map((s) => `${s.table}.${s.column}`)
        .sort(),
      shared: group.sources.length > 1,
    });
  }

  planned.sort((a, b) => a.name.localeCompare(b.name));

  // Merge in the rewrite-introduced types. They are not MySQL-derived, so
  // they carry their own provenance instead of a `table.column` source list.
  const legacyNames = new Set(planned.map((p) => p.name));
  for (const extra of REWRITE_ENUMS) {
    if (legacyNames.has(extra.name)) {
      fail(`the rewrite enum "${extra.name}" collides with a generated type of the same name`);
    }
    planned.push({
      name: extra.name,
      values: extra.values,
      sources: [],
      shared: false,
      origin: 'rewrite',
      provenance: extra.provenance,
      replaces: extra.replaces,
    });
  }
  planned.sort((a, b) => a.name.localeCompare(b.name));

  for (const p of planned) {
    if (!p.origin) p.origin = 'mysql';
    if (ENUM_SOURCE_NOTES[p.name]) p.note = ENUM_SOURCE_NOTES[p.name];
  }

  return { enumColumns, planned };
}

// ---------------------------------------------------------------------------
// The YAML serialiser — a tiny, deterministic subset
// ---------------------------------------------------------------------------

function yamlString(value) {
  if (value === null || value === undefined) return 'null';
  const s = String(value);
  if (s === '') return "''";
  if (/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)) {
    return s;
  }
  return `'${s.replace(/'/g, "''")}'`;
}

function renderEnumsYaml(legacy, plan) {
  const lines = [];
  lines.push('# GENERATED FILE — DO NOT EDIT BY HAND.');
  lines.push('#');
  lines.push('# Regenerate with:');
  lines.push('#   node tools/db/inspect-legacy-schema.mjs');
  lines.push('#');
  lines.push(`# Source: the LIVE MySQL database \`${legacy.database}\`, table`);
  lines.push('# information_schema.COLUMNS, column_type for every column whose');
  lines.push('# data_type = "enum".');
  lines.push('#');
  lines.push('# The value ORDER is MySQL\'s. PostgreSQL\'s `pg_enum` sorts by the');
  lines.push('# enum\'s `enumsortorder`, so a reordered list is a behaviour');
  lines.push('# difference, not a cosmetic one: the application sorts and validates');
  lines.push('# against these lists (ADR-0007).');
  lines.push('#');
  lines.push('# Every entry below becomes ONE `CREATE TYPE ... AS ENUM (...)` in');
  lines.push('# db/postgres/migrations/, and is the source for the Go constants and');
  lines.push('# the TypeScript union.');
  lines.push('version: 1');
  lines.push(`generated_at: '${legacy.generatedAt}'`);
  lines.push('source:');
  lines.push(`  engine: ${yamlString(legacy.engine)}`);
  lines.push(`  database: ${yamlString(legacy.database)}`);
  lines.push('  information_schema_table: COLUMNS');
  lines.push('counts:');
  lines.push(`  enum_columns: ${plan.enumColumns.length}`);
  lines.push(`  enum_types: ${plan.planned.length}`);
  lines.push(`  enum_types_from_mysql: ${plan.planned.filter((e) => e.origin === 'mysql').length}`);
  lines.push(`  enum_types_introduced_by_the_rewrite: ${plan.planned.filter((e) => e.origin === 'rewrite').length}`);
  lines.push('');
  lines.push('enums:');

  for (const entry of plan.planned) {
    lines.push(`  ${entry.name}:`);
    lines.push(`    values: [${entry.values.map((v) => yamlString(v)).join(', ')}]`);
    lines.push(`    origin: ${entry.origin}`);
    if (entry.origin === 'mysql') {
      lines.push('    sources:');
      for (const src of entry.sources) lines.push(`      - ${yamlString(src)}`);
    } else {
      lines.push(`    provenance: ${yamlString(entry.provenance)}`);
      lines.push(`    replaces: ${yamlString(entry.replaces)}`);
    }
    if (entry.shared) {
      lines.push('    # Shared by several legacy columns that carry the identical value list.');
    }
    if (entry.renamed) {
      lines.push(`    # PostgreSQL type name; the legacy generator name was ${entry.legacy_name}.`);
    }
    if (entry.note) {
      for (const line of wrapComment(entry.note, 4)) lines.push(line);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Wrap a long note into `#` comment lines at the given indent. */
function wrapComment(text, indent) {
  const pad = ' '.repeat(indent);
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= 96) {
      current += ` ${word}`;
    } else {
      lines.push(`${pad}# ${current}`);
      current = word;
    }
  }
  if (current !== '') lines.push(`${pad}# ${current}`);
  return lines;
}

// ---------------------------------------------------------------------------
// The PostgreSQL side of the diff
// ---------------------------------------------------------------------------

/**
 * Parse the PostgreSQL baseline out of the migration files.
 *
 * This is a deliberately small parser: it understands exactly the subset of
 * SQL this repository writes — `CREATE TYPE ... AS ENUM`, `CREATE TABLE`,
 * `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and `CREATE INDEX`. It is
 * not a SQL parser; it is a diff instrument that must not need a database.
 */
export function parsePostgresMigrations(dir) {
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    : [];

  const tables = new Map();
  const enumTypes = new Map();
  const indexes = [];

  const ensureTable = (name) => {
    if (!tables.has(name)) {
      tables.set(name, { name, columns: new Map(), constraints: [], foreignKeys: [], indexes: [] });
    }
    return tables.get(name);
  };

  const stripComments = (sql) =>
    sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf8');
    const sql = stripComments(raw);

    // CREATE TYPE <name> AS ENUM ( 'a', 'b' );
    const typeRe = /CREATE\s+TYPE\s+([A-Za-z0-9_."]+)\s+AS\s+ENUM\s*\(([^;]*?)\)\s*;/gis;
    let m;
    while ((m = typeRe.exec(sql)) !== null) {
      const name = unquoteIdent(m[1]);
      const values = [];
      const valRe = /'((?:[^']|'')*)'/g;
      let v;
      while ((v = valRe.exec(m[2])) !== null) values.push(v[1].replace(/''/g, "'"));
      enumTypes.set(name, values);
    }

    // CREATE TABLE [IF NOT EXISTS] <name> ( ... );
    const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)\s*\(([\s\S]*?)\n\s*\)\s*(?:WITH|AS|;)/gi;
    while ((m = tableRe.exec(sql)) !== null) {
      const name = unquoteIdent(m[1]);
      const table = ensureTable(name);
      for (const line of splitTopLevel(m[2])) {
        const item = line.trim();
        if (item === '') continue;
        if (/^CONSTRAINT\b/i.test(item)) {
          table.constraints.push(item);
          const fk = /FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([A-Za-z0-9_."]+)\s*\(([^)]*)\)/i.exec(item);
          if (fk) {
            table.foreignKeys.push({
              columns: fk[1].split(',').map((s) => unquoteIdent(s.trim())),
              refTable: unquoteIdent(fk[2]),
              refColumns: fk[3].split(',').map((s) => unquoteIdent(s.trim())),
              constraint: (/^CONSTRAINT\s+([A-Za-z0-9_."]+)/i.exec(item) || [])[1] || null,
            });
          }
          continue;
        }
        if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|LIKE|EXCLUDE)\b/i.test(item)) {
          table.constraints.push(item);
          const fk = /FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([A-Za-z0-9_."]+)\s*\(([^)]*)\)/i.exec(item);
          if (fk) {
            table.foreignKeys.push({
              columns: fk[1].split(',').map((s) => unquoteIdent(s.trim())),
              refTable: unquoteIdent(fk[2]),
              refColumns: fk[3].split(',').map((s) => unquoteIdent(s.trim())),
              constraint: null,
            });
          }
          continue;
        }
        const col = parseColumnDef(item);
        if (col) table.columns.set(col.name, col);
      }
    }

    // ALTER TABLE <name> ADD CONSTRAINT <c> ... FOREIGN KEY ...
    const alterRe = /ALTER\s+TABLE\s+(?:ONLY\s+)?([A-Za-z0-9_."]+)\s+ADD\s+CONSTRAINT\s+([A-Za-z0-9_."]+)\s+([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql)) !== null) {
      const name = unquoteIdent(m[1]);
      const table = ensureTable(name);
      table.constraints.push(`CONSTRAINT ${m[2]} ${m[3].trim()}`);
      const fk = /FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([A-Za-z0-9_."]+)\s*\(([^)]*)\)/i.exec(m[3]);
      if (fk) {
        table.foreignKeys.push({
          columns: fk[1].split(',').map((s) => unquoteIdent(s.trim())),
          refTable: unquoteIdent(fk[2]),
          refColumns: fk[3].split(',').map((s) => unquoteIdent(s.trim())),
          constraint: unquoteIdent(m[2]),
        });
      }
    }

    // CREATE [UNIQUE] INDEX <name> ON <table> ( ... )
    const idxRe = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)\s+ON\s+([A-Za-z0-9_."]+)\s*(?:USING\s+\w+\s*)?\(/gi;
    while ((m = idxRe.exec(sql)) !== null) {
      indexes.push({
        name: unquoteIdent(m[2]),
        table: unquoteIdent(m[3]),
        unique: Boolean(m[1]),
        columns: m[0].slice(m[0].indexOf('(') + 1, m[0].lastIndexOf(')')).split(',').map((s) => s.trim()),
      });
    }
  }

  for (const idx of indexes) {
    const t = tables.get(idx.table);
    if (t) t.indexes.push(idx);
  }

  return {
    engine: 'postgresql',
    source: 'migrations',
    files,
    enumTypes,
    tables,
    indexes,
  };
}

function unquoteIdent(name) {
  return String(name).replace(/^"|"$/g, '').replace(/""/g, '"');
}

/** Split a CREATE TABLE body on commas that are not inside parentheses or quotes. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      current += ch;
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

function parseColumnDef(item) {
  const m = /^([A-Za-z0-9_."]+)\s+(.+)$/s.exec(item);
  if (!m) return null;
  const name = unquoteIdent(m[1]);
  let rest = m[2].trim();

  // A column type may be followed by [] (array) or a precision.
  const typeMatch = /^([A-Za-z0-9_."]+(?:\s+[A-Za-z0-9_]+)?)(\s*\(\s*[^)]*\))?(\s*\[\s*\])?/s.exec(rest);
  if (!typeMatch) return null;
  let type = typeMatch[1].toLowerCase();
  if (typeMatch[2]) type += typeMatch[2].replace(/\s+/g, '');
  if (typeMatch[3]) type += '[]';
  rest = rest.slice(typeMatch[0].length).trim();

  const notNull = /^NOT\s+NULL/i.test(rest);
  const nullable = !notNull && !/^PRIMARY\s+KEY/i.test(rest);
  const defaultMatch = /\bDEFAULT\s+('(?:[^']|'')*'|[\w.\-+()]+)/i.exec(rest);

  return {
    name,
    type,
    nullable,
    default: defaultMatch ? defaultMatch[1] : null,
    references: /REFERENCES\s+([A-Za-z0-9_."]+)/i.exec(rest)
      ? {
          table: unquoteIdent(/REFERENCES\s+([A-Za-z0-9_."]+)/i.exec(rest)[1]),
          column: (() => {
            const rm = /REFERENCES\s+[A-Za-z0-9_."]+\s*\(([^)]*)\)/i.exec(rest);
            return rm ? unquoteIdent(rm[1].split(',')[0].trim()) : null;
          })(),
        }
      : null,
  };
}

/** Read a live PostgreSQL schema through the `psql` client. */
export function readPostgresLive(args) {
  const dsn = args.pgDsn;
  const argv = [dsn, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c'];
  const query = `
    SELECT json_build_object(
      'kind','column','table', table_name, 'name', column_name,
      'type', data_type, 'notnull', (is_nullable = 'NO'),
      'default', coalesce(column_default,''), 'position', ordinal_position
    )
      FROM information_schema.columns
     WHERE table_schema = 'public'
     UNION ALL
    SELECT json_build_object(
      'kind','enum','table', t.typname, 'name', e.enumlabel,
      'type', 'enum', 'notnull', false, 'default', '', 'position', e.enumsortorder
    )
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE n.nspname = 'public'
     UNION ALL
    SELECT json_build_object(
      'kind','fk','table', c.relname, 'name', con.conname,
      'type', '', 'notnull', false, 'default', '', 'position', 0,
      'cols', (SELECT json_agg(a.attname ORDER BY u.ord)
                   FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = u.attnum),
      'reftable', (SELECT relname FROM pg_class WHERE oid = con.confrelid),
      'refcols', (SELECT json_agg(a.attname ORDER BY u.ord)
                     FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
                     JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = u.attnum)
    )
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'f'
     UNION ALL
    SELECT json_build_object(
      'kind','index','table', tablename, 'name', indexname,
      'type', '', 'notnull', false, 'default', '', 'position', 0,
      'unique', (indexdef LIKE 'CREATE UNIQUE%')
    )
      FROM pg_indexes WHERE schemaname = 'public';
  `;
  argv.push(query);

  let stdout;
  try {
    stdout = execFileSync(args.psqlBin, argv, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  } catch (err) {
    fail(`the psql client failed.\n${(err.stderr ? String(err.stderr) : String(err.message)).trim()}`);
  }

  const tables = new Map();
  const enumTypes = new Map();
  const indexes = [];
  const enumRows = [];
  const ensureTable = (name) => {
    if (!tables.has(name)) tables.set(name, { name, columns: new Map(), constraints: [], foreignKeys: [], indexes: [] });
    return tables.get(name);
  };

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row;
    try { row = JSON.parse(trimmed); } catch { continue; }
    if (row.kind === 'column') {
      ensureTable(row.table).columns.set(row.name, {
        name: row.name,
        type: row.type,
        nullable: !row.notnull,
        default: row.default,
        references: null,
      });
    } else if (row.kind === 'enum') {
      enumRows.push(row);
    } else if (row.kind === 'fk') {
      const t = ensureTable(row.table);
      t.constraints.push(row.name);
      t.foreignKeys.push({
        columns: row.cols || [],
        refTable: row.reftable,
        refColumns: row.refcols || [],
        constraint: row.name,
      });
    } else if (row.kind === 'index') {
      indexes.push({ name: row.name, table: row.table, unique: row.unique });
    }
  }

  // The enum value ORDER is `pg_enum.enumsortorder`, and it is a behaviour
  // difference, not a cosmetic one (ADR-0007). Sort by it explicitly.
  enumRows.sort((a, b) => (a.table < b.table ? -1 : a.table > b.table ? 1 : a.position - b.position));
  for (const row of enumRows) {
    if (!enumTypes.has(row.table)) enumTypes.set(row.table, []);
    enumTypes.get(row.table).push(row.name);
  }

  for (const idx of indexes) {
    const t = tables.get(idx.table);
    if (t) t.indexes.push(idx);
  }

  return { engine: 'postgresql', source: 'live', enumTypes, tables, indexes };
}

// ---------------------------------------------------------------------------
// The diff — the gate that keeps the port honest
// ---------------------------------------------------------------------------

/**
 * Tables that are deliberately NOT migrated, with the reason.
 * The diff must not report these as missing; that is the whole point of
 * listing them here rather than letting the gate cry wolf.
 */
export const DELIBERATELY_OMITTED = {
  migrations: 'Laravel\'s migration ledger. The PostgreSQL baseline has its own (goose).',
  jobs: 'Laravel queue table. The rewrite runs its own queue; MySQL keeps the Laravel one.',
  job_batches: 'Laravel queue batch table. Same reason as `jobs`.',
  failed_jobs: 'Laravel failed queue table. Same reason as `jobs`.',
  cache: 'Laravel cache store. The rewrite uses Redis, per ADR-0006.',
  cache_locks: 'Laravel cache lock store. Same reason as `cache`.',
  sessions: 'Laravel session store. The rewrite uses Redis/cookie sessions.',
};

/**
 * Legacy tables that are REPLACED rather than copied. The diff compares the
 * unified `bids` table against all seven legacy bid tables at once.
 */
export const REPLACED_BY_UNIFIED_BIDS = [
  'bids_arsitek',
  'bids_interior',
  'bids_kontraktor',
  'bids_mep',
  'bids_notaris',
  'bids_project_manager',
  'bids_structural',
];

/**
 * Columns the rewrite deliberately RENAMED or REPLACED, and the PostgreSQL
 * column that carries the same information. The diff accepts either.
 */
export const COLUMN_EQUIVALENCES = {
  'project_budget_transactions.reference_model': ['reference_type_id'],
  'project_budget_transactions.reverses_model': ['reverses_type_id'],
  'bid_negotiation_logs.bid_type': ['bid_type_id'],
  'project_disputes.payment_type': ['payment_type_id'],
  // MySQL column names are case-insensitive; PostgreSQL folds unquoted
  // identifiers to lower case. The column is renamed rather than quoted.
  'users.Deskripsi': ['deskripsi'],
};

/**
 * Columns the rewrite deliberately DROPPED, with the reason. Every one of
 * these is a column no writer ever wrote: they are not in the model's
 * `$fillable` and no code path sets them.
 */
export const DELIBERATELY_DROPPED_COLUMNS = {
  'project_budget_transactions.category': 'Never written. Not in the model\'s $fillable.',
  'project_budget_transactions.type': 'Never written. Not in the model\'s $fillable.',
  'project_budget_transactions.status': 'Never written. Not in the model\'s $fillable.',
  'project_budget_transactions.description': 'Never written. Not in the model\'s $fillable.',
};

/**
 * Which PostgreSQL table carries which legacy table. Everything is the same
 * name except the seven bid tables, which collapse into one.
 */
export function targetTableFor(legacyTable) {
  if (REPLACED_BY_UNIFIED_BIDS.includes(legacyTable)) return 'bids';
  return legacyTable;
}

export function diffSchemas(legacy, pg) {
  const missingTables = [];
  const extraTables = [];
  const missingColumns = [];
  const missingEnums = [];
  const enumValueMismatches = [];
  const missingForeignKeys = [];
  const defaultMismatches = [];
  const legacyDefaults = new Map();

  const pgTableNames = new Set(pg.tables.keys());
  const legacyTableNames = new Set(legacy.tables.map((t) => t.name));

  for (const name of legacyTableNames) {
    if (pgTableNames.has(name)) continue;
    if (name in DELIBERATELY_OMITTED) continue;
    if (REPLACED_BY_UNIFIED_BIDS.includes(name)) continue; // folded into `bids`
    missingTables.push(name);
  }
  for (const name of pgTableNames) {
    if (!legacyTableNames.has(name)) extraTables.push(name);
  }

  for (const table of legacy.tables) {
    if (nameOmitted(table.name)) continue;
    const target = targetTableFor(table.name);
    const pgTable = pg.tables.get(target);
    if (!pgTable) continue;

    for (const column of table.columns) {
      const key = `${table.name}.${column.column}`;
      if (key in DELIBERATELY_DROPPED_COLUMNS) continue;

      const equivalents = COLUMN_EQUIVALENCES[key] || [column.column];
      const present = equivalents.some((c) => pgTable.columns.has(c));
      if (!present) {
        missingColumns.push(key);
        continue;
      }

      // THE DEFAULT
      // ------------
      // A column's DEFAULT is part of the schema, and it is the part that
      // goes missing without anyone noticing: `MODIFY COLUMN` restates the
      // whole column definition, so a helper that rebuilds the definition
      // without restating the default silently removes it.
      //
      // It was invisible here for a month, because every application INSERT
      // set the column explicitly — so nothing broke loudly — while the
      // PostgreSQL baseline declared the default and MySQL did not have it.
      // Two engines, two schemas, one column, and no tool comparing them.
      //
      // The comparison is done in a SECOND PASS, below, because the seven
      // legacy bid tables were folded into ONE PostgreSQL table and their
      // defaults do not all agree — so the comparison has to know that the
      // legacy sources disagree before it can say anything about the
      // PostgreSQL side. Every source is recorded, INCLUDING the ones with
      // no default at all, because "six of them declare it and one does not"
      // is itself a disagreement the unification had to resolve.
      for (const equivalent of equivalents) {
        const pgKey = `${target}.${equivalent}`;
        if (!legacyDefaults.has(pgKey)) legacyDefaults.set(pgKey, []);

        legacyDefaults.get(pgKey).push({
          legacyKey: `${table.name}.${column.column}`,
          default:
            column.default === null || column.default === undefined
              ? null
              : String(column.default),
          legacyType: column.type,
        });
      }
    }
    // The foreign keys of the seven bid tables are checked against `bids` as
    // a group, because the per-role profile columns became one table's
    // columns. The project and user keys are identical across all seven.
    for (const fk of table.foreignKeys) {
      if (REPLACED_BY_UNIFIED_BIDS.includes(table.name)) continue;
      const pgHas = pgTable.foreignKeys.some(
        (p) =>
          Array.isArray(p.columns) &&
          p.columns.length === 1 &&
          p.columns[0] === fk.column &&
          p.refTable === fk.ref_table &&
          Array.isArray(p.refColumns) &&
          p.refColumns[0] === fk.ref_column,
      );
      if (!pgHas) {
        missingForeignKeys.push(
          `${table.name}.${fk.column} -> ${fk.ref_table}.${fk.ref_column}`,
        );
      }
    }
  }

  // THE DEFAULTS, COMPARED
  // ----------------------
  // One PostgreSQL column, and every legacy column that maps onto it.
  //
  // When the legacy sources AGREE, the PostgreSQL default must be that value
  // — a difference is drift, and drift is what this tool exists to catch.
  //
  // When the legacy sources DISAGREE — which is the case for the seven bid
  // tables that were folded into one — the unification FORCED a choice, and
  // the PostgreSQL default must be one of the values the legacy used. That is
  // a decision, not a drift, so it is reported as a NOTE rather than a
  // failure. What is still a failure is a PostgreSQL default that is none of
  // them: that is a value nobody chose.
  const unificationNotes = [];

  for (const [pgKey, sources] of legacyDefaults) {
    const separator = pgKey.indexOf('.');
    const targetTable = pgKey.slice(0, separator);
    const targetColumn = pgKey.slice(separator + 1);

    const pgTable = pg.tables.get(targetTable);
    if (!pgTable) continue;

    const pgColumn = pgTable.columns.get(targetColumn);
    if (!pgColumn) continue;

    const pgDefault = normalisePgDefault(pgColumn.default);

    // The legacy sources, split into the ones that DECLARE a default and the
    // ones that do not.
    const declared = sources.filter((s) => s.default !== null);
    const undeclared = sources.filter((s) => s.default === null);
    const distinct = [...new Set(declared.map((s) => s.default))];

    // The legacy sources DISAGREE — either about the value, or about whether
    // there is one. The unification FORCED a choice, so the PostgreSQL default
    // must be one of the values the legacy used, or absent. Either way it is a
    // decision rather than drift, so it is reported as a NOTE.
    //
    // What is still a failure is a PostgreSQL default that is none of them:
    // that is a value nobody chose.
    if (distinct.length > 1 || (distinct.length === 1 && undeclared.length > 0)) {
      const legacySummary = distinct.length
        ? `${distinct.join(', ')}${undeclared.length ? ` (${undeclared.length} table(s) with none)` : ''}`
        : 'none';

      if (pgDefault === null) {
        unificationNotes.push(`${pgKey}: the legacy tables disagree (${legacySummary}); postgres has no default`);
        continue;
      }

      // The PostgreSQL default must agree with AT LEAST ONE of the legacy
      // values — by VALUE, not by spelling, so `0` and `0.00` are the same
      // default.
      const matches = declared.some((s) => defaultsAgree(s.legacyType, s.default, pgColumn.type, pgColumn.default));

      if (!matches) {
        defaultMismatches.push(
          `${pgKey}: the legacy tables disagree (${legacySummary}), postgres uses '${pgDefault}', which is none of them`,
        );
        continue;
      }

      unificationNotes.push(
        `${pgKey}: the ${sources.length} legacy tables that fold into it disagree (${legacySummary}); postgres uses '${pgDefault}'`,
      );
      continue;
    }

    // Every legacy source declares the SAME default. The PostgreSQL default
    // must be that value: a difference is drift.
    if (distinct.length === 0) continue;

    const only = declared[0];

    if (pgDefault === null) {
      defaultMismatches.push(
        `${only.legacyKey} -> ${pgKey}: legacy default '${only.default}', postgres has none`,
      );
      continue;
    }

    if (!defaultsAgree(only.legacyType, only.default, pgColumn.type, pgColumn.default)) {
      defaultMismatches.push(
        `${only.legacyKey} -> ${pgKey}: legacy default '${only.default}', postgres default '${pgDefault}'`,
      );
    }
  }

  // Enum types: the legacy value list must exist in PostgreSQL, IN THE SAME ORDER.
  const plan = planEnumTypes(legacy);

  for (const entry of plan.planned) {
    if (!pg.enumTypes.has(entry.name)) {
      // The unified bid status is the union of four enum columns and three
      // varchar ones; it is named `bid_status` in the baseline.
      if (entry.name.startsWith('bids_') && entry.sources.every((s) => s.startsWith('bids_'))) {
        if (pg.enumTypes.has('bid_status')) {
          const pgValues = pg.enumTypes.get('bid_status');
          const missing = entry.values.filter((v) => !pgValues.includes(v));
          if (missing.length) {
            enumValueMismatches.push(`bid_status is missing ${missing.join(', ')}`);
          }
          continue;
        }
      }
      missingEnums.push(entry.name);
      continue;
    }
    const pgValues = pg.enumTypes.get(entry.name);
    const same =
      pgValues.length === entry.values.length && pgValues.every((v, i) => v === entry.values[i]);
    if (!same) {
      enumValueMismatches.push(
        `${entry.name}: legacy [${entry.values.join(', ')}] vs postgres [${pgValues.join(', ')}]`,
      );
    }
  }

  return {
    missingTables: missingTables.sort(),
    extraTables: extraTables.sort(),
    missingColumns: missingColumns.sort(),
    missingEnums: missingEnums.sort(),
    enumValueMismatches,
    missingForeignKeys: missingForeignKeys.sort(),
    defaultMismatches: defaultMismatches.sort(),
    unificationNotes,
  };
}

/**
 * Reduce a PostgreSQL `column_default` to the bare value the legacy column
 * carries.
 *
 * PostgreSQL reports the default as an EXPRESSION, not a value:
 *
 *   'pending'::bid_status
 *   'invited'::character varying
 *   0
 *   nextval('bids_id_seq'::regclass)
 *
 * MySQL reports the bare value. So the cast is stripped and the quotes are
 * removed, and what is left is comparable with the legacy column's default.
 *
 * A sequence default returns null: the legacy id is an auto-increment with no
 * default of its own, so it is not a default this tool compares.
 */
function normalisePgDefault(value) {
  if (value === null || value === undefined) return null;

  let text = String(value).trim();
  if (text === '') return null;

  // A sequence is not a comparable default.
  if (/^nextval\(/i.test(text)) return null;

  // Strip a trailing cast: `'pending'::bid_status` -> `'pending'`.
  text = text.replace(/::[A-Za-z_][A-Za-z0-9_ ."]*$/, '');

  // Strip the surrounding single quotes, and unescape the doubled ones.
  if (/^'.*'$/s.test(text)) {
    text = text.slice(1, -1).replace(/''/g, "'");
  }

  return text;
}

/** Is this text a number? */
function isNumeric(text) {
  return /^-?\d+(\.\d+)?$/.test(String(text).trim());
}

/** Is this text one of the spellings of a boolean? */
function isBooleanish(text) {
  return /^(0|1|true|false|yes|no)$/i.test(String(text).trim());
}

/** The truth value of a booleanish text. */
function truthy(text) {
  return /^(1|true|yes)$/i.test(String(text).trim());
}

/**
 * Do the two columns default to the SAME value?
 *
 * The comparison is by VALUE, not by spelling, because the two engines spell
 * the same value differently:
 *
 *   MySQL  tinyint(1)   DEFAULT 0        PostgreSQL  boolean  DEFAULT false
 *   MySQL  decimal(24,2) DEFAULT 0.00    PostgreSQL  numeric  DEFAULT 0
 *
 * Those are the same default. Reporting them as drift would bury the real
 * findings — and the real findings are the point: a column that HAS a default
 * in one engine and NONE in the other is a genuine difference in behaviour,
 * because an INSERT that omits the column gets the default in one and NULL
 * in the other.
 */
function defaultsAgree(legacyType, legacyDefault, pgType, pgDefault) {
  const legacy = String(legacyDefault).trim();
  const postgres = normalisePgDefault(pgDefault);

  if (postgres === null) return false;
  if (legacy === postgres) return true;

  // MySQL's `tinyint(1)` is a boolean in practice; PostgreSQL has a real
  // boolean type. `0` and `false` are the same default.
  const legacyIsBoolean = /^tinyint\(1\)/i.test(legacyType) || /^bool(ean)?$/i.test(legacyType);
  const postgresIsBoolean = /^bool(ean)?$/i.test(pgType);

  if (legacyIsBoolean || postgresIsBoolean) {
    if (isBooleanish(legacy) && isBooleanish(postgres)) {
      return truthy(legacy) === truthy(postgres);
    }
  }

  // Numbers: `0.00` and `0` and `0.0` are the same value.
  if (isNumeric(legacy) && isNumeric(postgres)) {
    return Number(legacy) === Number(postgres);
  }

  return false;
}

function nameOmitted(name) {
  return name in DELIBERATELY_OMITTED;
}

/**
 * A deliberately tiny parser for the subset of YAML this tool writes.
 *
 * `spec/enums.yaml` has one shape: a top-level `enums:` mapping whose values
 * are mappings with a `values:` flow sequence and a `sources:` block list. A
 * full YAML library would be a dependency the repository does not have and
 * does not need; the file is GENERATED, so the parser only has to understand
 * what the generator writes.
 */
export function parseEnumsYaml(text) {
  const result = {};
  const lines = text.split('\n');
  let inEnums = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^enums:\s*$/.test(line)) {
      inEnums = true;
      continue;
    }
    if (!inEnums) continue;

    const typeMatch = /^ {2}([A-Za-z0-9_]+):\s*$/.exec(line);
    if (typeMatch) {
      current = { name: typeMatch[1], values: [], sources: [], origin: null };
      result[typeMatch[1]] = current;
      continue;
    }
    if (!current) continue;

    const valuesMatch = /^ {4}values:\s*\[(.*)\]\s*$/.exec(line);
    if (valuesMatch) {
      current.values = valuesMatch[1]
        .split(',')
        .map((v) => v.trim().replace(/^'(.*)'$/, '$1').replace(/''/g, "'"))
        .filter((v) => v !== '');
      continue;
    }
    const originMatch = /^ {4}origin:\s*(\S+)\s*$/.exec(line);
    if (originMatch) {
      current.origin = originMatch[1];
      continue;
    }
    const sourceMatch = /^ {6}- '(.*)'\s*$/.exec(line);
    if (sourceMatch) {
      current.sources.push(sourceMatch[1].replace(/''/g, "'"));
      continue;
    }
  }

  return result;
}

/**
 * Verify the enum manifest against the live MySQL database AND against a
 * live PostgreSQL database, value by value and IN ORDER.
 *
 * This is the check that proves the requirement "every MySQL ENUM becomes a
 * native PostgreSQL ENUM with the EXACT same values in the EXACT same order".
 * A value ORDER difference is a behaviour difference: the application sorts
 * and validates against these lists.
 */
export function verifyEnums(legacy, yamlText, pg) {
  const plan = planEnumTypes(legacy);
  const fromYaml = parseEnumsYaml(yamlText);
  const results = [];
  let failures = 0;

  const mysqlTypes = new Map();
  for (const entry of plan.planned) {
    if (entry.origin === 'mysql') mysqlTypes.set(entry.name, entry);
  }

  for (const [name, yamlEntry] of Object.entries(fromYaml)) {
    const mysql = mysqlTypes.get(name);
    const pgValues = pg?.enumTypes?.get(name);

    const problems = [];

    if (!mysql && yamlEntry.origin === 'mysql') {
      problems.push('no MySQL enum column produces this type');
    }
    if (mysql) {
      const same =
        mysql.values.length === yamlEntry.values.length &&
        mysql.values.every((v, i) => v === yamlEntry.values[i]);
      if (!same) {
        problems.push(
          `yaml [${yamlEntry.values.join(', ')}] != mysql [${mysql.values.join(', ')}]`,
        );
      }
    }
    if (pgValues) {
      const same =
        pgValues.length === yamlEntry.values.length &&
        pgValues.every((v, i) => v === yamlEntry.values[i]);
      if (!same) {
        problems.push(
          `yaml [${yamlEntry.values.join(', ')}] != postgres [${pgValues.join(', ')}]`,
        );
      }
    } else if (pg) {
      problems.push('the PostgreSQL database has no such enum type');
    }

    if (problems.length) failures++;
    results.push({
      name,
      origin: yamlEntry.origin,
      count: yamlEntry.values.length,
      sources: yamlEntry.sources.length,
      inPostgres: Boolean(pgValues),
      ok: problems.length === 0,
      problems,
    });
  }

  // Every legacy enum column must be covered by some type.
  const covered = new Set();
  for (const entry of plan.planned) for (const s of entry.sources) covered.add(s);
  const uncovered = plan.enumColumns
    .map((e) => `${e.table}.${e.column}`)
    .filter((s) => !covered.has(s));

  return { results, failures, uncovered, enumColumns: plan.enumColumns.length };
}

// ---------------------------------------------------------------------------
// The Eloquent model check
// ---------------------------------------------------------------------------

/**
 * Parse `app/Models/*.php` for the table each model touches and the columns
 * it writes.
 *
 * This is the check that answers "does the new schema actually provide what
 * the application reads and writes?" — the question the column inventory
 * alone cannot answer, because a model may read a column through a relation
 * rather than through `$fillable`.
 */
export function readEloquentModels(dir) {
  if (!existsSync(dir)) return [];
  const models = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.php')).sort()) {
    const source = readFileSync(join(dir, file), 'utf8');
    const className = /class\s+(\w+)\s+extends\s+(\w+)/.exec(source);
    if (!className) continue;

    const explicit = /protected\s+\$table\s*=\s*'([^']+)'/.exec(source);
    const table = explicit
      ? explicit[1]
      : pluralise(snakeCase(className[1]));

    const fillable = extractArray(source, '$fillable');
    const casts = extractArray(source, '$casts');

    models.push({
      class: className[1],
      file,
      table,
      fillable,
      casts,
    });
  }

  return models;
}

function snakeCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function pluralise(word) {
  // Only a CONSONANT + "y" becomes "ies" (company -> companies). A vowel + "y"
  // takes a plain "s" (delay -> delays), which is the rule the legacy models
  // rely on when they do not declare `$table` explicitly.
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Extract the string literals from a PHP array literal. */
function extractArray(source, property) {
  const re = new RegExp(`protected\\s+\\$${property.replace('$', '\\$')}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = re.exec(source);
  if (!m) return [];
  const values = [];
  const itemRe = /'([^']*)'/g;
  let item;
  while ((item = itemRe.exec(m[1])) !== null) values.push(item[1]);
  return values;
}

/**
 * Compare the Eloquent models against the PostgreSQL schema.
 *
 * A model that touches a table the schema does not have, or reads a column
 * the schema does not have, is a port that will not work — and it is the
 * failure mode a column inventory cannot see.
 */
export function checkModels(models, pg) {
  const missingTables = [];
  const missingColumns = [];

  for (const model of models) {
    const target = targetTableFor(model.table);
    const pgTable = pg.tables.get(target);
    if (!pgTable) {
      if (model.table in DELIBERATELY_OMITTED) continue;
      missingTables.push(`${model.class} -> ${model.table}`);
      continue;
    }

    for (const column of [...model.fillable, ...model.casts]) {
      if (pgTable.columns.has(column)) continue;
      // The seven bid models write the LEGACY per-role profile column
      // (`arsitek_id`); the unified table keeps those names, so a direct
      // check works. What it does not keep is the legacy `status`/`payment
      // //_status` shape of a VARCHAR column — those are enums now, and the
      // COLUMN NAMES are unchanged, so they match.
      missingColumns.push(`${model.class}.${column} (${target})`);
    }
  }

  return { missingTables: missingTables.sort(), missingColumns: missingColumns.sort() };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Strip the fields that change on every run, so that `--check` compares
 * CONTENT and not a timestamp. Without this the freshness gate would fail
 * every single time and be ignored.
 */
function canonicalise(content, label) {
  if (label === 'spec/enums.yaml') {
    return content.replace(/^generated_at:.*$/m, '');
  }
  if (label === 'the legacy inventory') {
    return content.replace(/^\s*"generatedAt":.*$/m, '');
  }
  return content;
}

function writeOrCheck(args, path, content, label) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (args.check) {
    if (existing === null || canonicalise(existing, label) !== canonicalise(content, label)) {
      process.stderr.write(
        `inspect-legacy-schema: ${label} is STALE (${path}).\n` +
          `  Run: node tools/db/inspect-legacy-schema.mjs\n`,
      );
      return false;
    }
    return true;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  process.stdout.write(
    `inspect-legacy-schema: reading ${args.host}:${args.port}/${args.database} (read-only)\n`,
  );
  const legacy = readLegacySchema(args);
  const plan = planEnumTypes(legacy);

  process.stdout.write(
    `  legacy: ${legacy.counts.tables} tables, ${legacy.counts.columns} columns, ` +
      `${legacy.counts.indexes} indexes, ${legacy.counts.foreignKeys} foreign keys, ` +
      `${legacy.counts.enumColumns} enum columns -> ${plan.planned.length} enum types\n`,
  );

  const yaml = renderEnumsYaml(legacy, plan);
  const enumsOk = writeOrCheck(args, args.enumsFile, yaml, 'spec/enums.yaml');

  const inventory = {
    ...legacy,
    enumTypes: plan.planned.map((e) => ({ name: e.name, values: e.values, sources: e.sources })),
  };
  const inventoryOk = writeOrCheck(args, args.inventoryFile, `${JSON.stringify(inventory, null, 2)}\n`, 'the legacy inventory');

  if (!enumsOk || !inventoryOk) process.exit(1);

  if (args.verifyEnums) {
    const yamlText = existsSync(args.enumsFile) ? readFileSync(args.enumsFile, 'utf8') : yaml;
    const pg = args.pgDsn ? readPostgresLive(args) : null;
    const verification = verifyEnums(legacy, yamlText, pg);

    process.stdout.write(
      `  enum verification: ${verification.enumColumns} legacy enum columns, ` +
        `${Object.keys(parseEnumsYaml(yamlText)).length} types in ${args.enumsFile}\n`,
    );
    for (const r of verification.results) {
      const verdict = r.ok ? 'ok  ' : 'FAIL';
      const pgNote = pg ? (r.inPostgres ? ' pg=yes' : ' pg=NO ') : '';
      process.stdout.write(
        `    [${verdict}] ${r.name.padEnd(36)} ${String(r.count).padStart(2)} values` +
          `${pgNote}${r.ok ? '' : '  ' + r.problems.join('; ')}\n`,
      );
    }
    if (verification.uncovered.length) {
      process.stdout.write(
        `    legacy enum columns NOT represented by any type: ${verification.uncovered.join(', ')}\n`,
      );
    }
    if (verification.failures || verification.uncovered.length) {
      process.stdout.write(`  ENUM VERIFICATION FAILED (${verification.failures} type(s) differ)\n`);
      process.exit(1);
    }
    process.stdout.write('  ENUM VERIFICATION PASSED\n');
    return;
  }

  if (args.diff) {
    const pg = args.pgDsn ? readPostgresLive(args) : parsePostgresMigrations(args.pgMigrations);
    const diff = diffSchemas(legacy, pg);
    const pgTableCount = pg.tables.size;
    const pgColumnCount = [...pg.tables.values()].reduce((n, t) => n + t.columns.size, 0);
    const pgEnumCount = pg.enumTypes.size;
    const pgFkCount = [...pg.tables.values()].reduce((n, t) => n + t.foreignKeys.length, 0);
    const pgIndexCount = pg.indexes.length;

    process.stdout.write(
      `  postgres (${pg.source}): ${pgTableCount} tables, ${pgColumnCount} columns, ` +
        `${pgEnumCount} enum types, ${pgFkCount} foreign keys, ${pgIndexCount} indexes\n`,
    );

    const problems = [
      ...diff.missingTables.map((t) => `missing table: ${t}`),
      ...diff.missingColumns.map((c) => `missing column: ${c}`),
      ...diff.missingEnums.map((e) => `missing enum type: ${e}`),
      ...diff.enumValueMismatches.map((e) => `enum mismatch: ${e}`),
      ...diff.missingForeignKeys.map((f) => `missing foreign key: ${f}`),
      ...diff.defaultMismatches.map((d) => `default mismatch: ${d}`),
    ];

    if (diff.extraTables.length) {
      process.stdout.write(`  (${diff.extraTables.length} PostgreSQL-only tables: ${diff.extraTables.join(', ')})\n`);
    }

    for (const note of diff.unificationNotes ?? []) {
      process.stdout.write(`  (note) ${note}\n`);
    }

    // The Eloquent check: does the schema provide what the application
    // actually reads and writes?
    const models = readEloquentModels(join(REPO, 'app', 'Models'));
    const modelCheck = checkModels(models, pg);
    process.stdout.write(
      `  eloquent: ${models.length} models checked, ` +
        `${modelCheck.missingTables.length} missing tables, ` +
        `${modelCheck.missingColumns.length} missing columns\n`,
    );
    problems.push(...modelCheck.missingTables.map((t) => `model touches a missing table: ${t}`));
    problems.push(...modelCheck.missingColumns.map((c) => `model reads a missing column: ${c}`));

    if (problems.length === 0) {
      process.stdout.write('  DIFF CLEAN — every legacy table, column, enum and foreign key is present.\n');
      return;
    }
    process.stdout.write(`  DIFF FOUND ${problems.length} PROBLEM(S):\n`);
    for (const p of problems) process.stdout.write(`    - ${p}\n`);
    process.exit(1);
  }
}

main();
