# The 4Ceria stack — pinned versions

| Layer | Version | Where |
|---|---|---|
| Go | 1.27.3 | `go.mod` |
| PostgreSQL | 17 (CI image), 18 locally | `db/postgres/migrations` |
| MySQL | 9.6 | `db/mysql/schema.sql`, identity only |
| Next.js | 16.4.3 | `web/package.json` |
| React | 19.3.1 | `web/package.json` |
| TypeScript | 7.0.2 | `web/package.json` |
| Tailwind CSS | 4.3.3 | `web/package.json` |
| Node | 20 (`.nvmrc`) | CI and the Vercel build |

## Rules

- **The wire contract is PHP-compatible JSON.** Go 1.27 ships
  `encoding/json/v2`, whose output may differ. Every test and build runs with
  `GOEXPERIMENT=nojsonv2`.
- **Money is integer minor units.** No float ever holds an amount.
- **Enums are append-only.** A new MySQL enum value is appended; a PostgreSQL
  enum type must carry the same values in the same order.
- **PostgreSQL sessions are UTC.** The pool pins every connection; the ETL
  reads MySQL walls as UTC.
- **Actions and images are pinned.** CI enforces a full commit SHA for every
  action and a digest for every image (`scripts/ci/action-policy.sh`).

## Why these versions

- **Go 1.27** — the rewrite's target toolchain; `encoding/json/v2` is the one
  behaviour that must be disabled for the byte contract.
- **PostgreSQL 17** — native enums, `CHECK` constraints for the escrow
  invariants, and `jsonb` for the columns the legacy schema stored as text.
- **MySQL 9.6** — the live identity store. Its schema is frozen in
  `db/mysql/`; it is not a second application database.
- **Next.js 16.4** — App Router, React Compiler, standalone output.
- **Tailwind 4.3** — CSS-first configuration; the utility names are unchanged,
  so the ported markup carries over.
