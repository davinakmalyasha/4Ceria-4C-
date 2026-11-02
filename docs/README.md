# Documentation

The API is Go, the frontend is Next.js, and PostgreSQL is the datastore.
MySQL still owns identity (ADR-0018); the frozen schema is in `db/mysql/`.

## Start here

| | |
|---|---|
| [`PORTFOLIO.md`](PORTFOLIO.md) | The pitch, screenshots, demo accounts and a two-minute demo script. |
| [`../AGENTS.md`](../AGENTS.md) | Working rules, commands and the traps that have each cost real time. |
| [`../README.md`](../README.md) | What the application is, how to run it, how to deploy it. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Topology, request lifecycle, data ownership, storage, CI. |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Auth, authorization, responses, money, uploads, data. |

## The domain

| | |
|---|---|
| [`DOMAIN.md`](DOMAIN.md) | Actors, project lifecycle, bid flow, disputes. |
| [`MONEY.md`](MONEY.md) | The escrow model: the ledger, the ceiling, the retention split, the platform fee, the dispute freeze, and the invariants. |
| [`API_MAP.md`](API_MAP.md) | Routes grouped by domain. `routing/routes.yaml` is the source of truth. |
| [`POSTGRES-SCHEMA.md`](POSTGRES-SCHEMA.md) | The PostgreSQL schema and the collation decision per column family. |

## Reference

| | |
|---|---|
| [`STACK.md`](STACK.md) | Pinned versions and why each is what it is. |
| [`FEATURE-ROADMAP.md`](FEATURE-ROADMAP.md) | Product work that is deliberately not scheduled. |
| [`adr/`](adr/README.md) | The decisions, with their consequences and rejected alternatives. |

The port-era documents (`PORTING.md`, `PARITY.md`, `REWRITE-PLAN.md`,
`WEEK-1-REPORT.md`, `CLEANUP-LOG.md`, the audits and screenshots) were
retired with the Laravel application. They remain in git history at
`72bdfb2`.
