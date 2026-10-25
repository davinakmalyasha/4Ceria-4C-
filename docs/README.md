# Documentation

## The rewrite

The current application — Laravel 13 + MySQL + a Vite SPA — is being rewritten to
**Go 1.27.2 + PostgreSQL 17 + Next.js 16**, with 100 % feature parity and a
byte-identical frontend. The legacy application stays deployed and green throughout; it
is the oracle the rewrite is judged against.

| | |
|---|---|
| [`REWRITE-PLAN.md`](REWRITE-PLAN.md) | **The master plan.** The measured baseline, the 16 live defects, the target architecture, the parity contract, the 19 slices, the cutover and rollback runbooks, the CI matrix, the risk register, and the first two weeks day by day. |
| [`WEEK-1-REPORT.md`](WEEK-1-REPORT.md) | **What week 1 changed**, what was measured, and the instruments the rest of the rewrite runs on. |
| [`TW4-UPGRADE-DELTA.md`](TW4-UPGRADE-DELTA.md) | The measured Tailwind v4 upgrade: **2 renderings changed out of 2 542**, and the nine compatibility fixes that got it there. |
| [`POSTGRES-SCHEMA.md`](POSTGRES-SCHEMA.md) | The PostgreSQL 17 target schema, the collation decision per column family, and what is deliberately omitted. |
| [`adr/`](adr/) | **The 22 decisions.** Every load-bearing choice, with its context, its decision, its consequences (including the bad ones) and the alternatives rejected. Start at [`adr/README.md`](adr/README.md). |
| [`STACK.md`](STACK.md) | Every pinned version, verified against the live registry, and the rule for choosing *latest* versus *pinned*. |
| [`MONEY.md`](MONEY.md) | The escrow model: the three type-lists, the ceiling, the ledger, the reference registry, the retention split, the platform fee, the dispute freeze, the state machines, and **50 machine-checked invariants**. |
| [`PORTING.md`](PORTING.md) | How to port one endpoint, the definition of done for a ported endpoint and for a slice, and the 13 traps mapped to where each one now lives. |
| [`PARITY.md`](PARITY.md) | The live, **generated** parity matrix. One row per endpoint, with its tier, its upstream and what verified it. A hand-edit is a CI failure. |

## Read these

| | |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | **Start here.** Working rules, the verification gate, and 13 traps that have each cost real time. |
| [`DOMAIN.md`](DOMAIN.md) | The domain model: actors, project lifecycle, money flow, dispute arbitration. **Two known errors, both corrected in [`MONEY.md`](MONEY.md).** |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime topology, request lifecycle, storage layout, deploy pipeline. |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Auth, authorization and upload conventions. **Two known errors, both listed in the rewrite plan.** |
| [`API_MAP.md`](API_MAP.md) | Every route grouped by domain. `routes/api.php` is the real source of truth. |
| [`BACKLOG.md`](BACKLOG.md) | What shipped, and what is deliberately not scheduled. |

## Tracking documents

| | |
|---|---|
| [`CLEANUP-LOG.md`](CLEANUP-LOG.md) | Append-only record of remediation passes: what broke, why, and what fixed it. |
| [`FEATURE-ROADMAP.md`](FEATURE-ROADMAP.md) | Feature specs from the 2026-08 audit. Partly superseded by `BACKLOG.md`. |

## Archive

Historical material, kept for provenance. **It is not current guidance** and several documents
in here are actively wrong about the present state of the code.

| | |
|---|---|
| [`archive/upgrade-guide-2026-08.md`](archive/upgrade-guide-2026-08.md) | 55 KB of speculative upgrade advice from 2026-08. Superseded. |
| [`archive/optimization-2026-08/`](archive/optimization-2026-08/) | Backend/frontend performance blueprints and a completion report. Superseded. |
| [`audits/`](audits/) | Past audit findings. Read the status banner at the top of each first — these predate the fixes. |
| `architecture.puml` | Superseded by the diagram in `ARCHITECTURE.md`, and it describes a Flutter client that is not in this repository. |

## Conventions for adding to this directory

- Durable **facts** go in `DOMAIN.md` / `ARCHITECTURE.md` / `CONVENTIONS.md` and cite `file:line`.
- Durable **decisions** go in `adr/` — one decision per record, with context, decision,
  consequences (including the bad ones), and the alternatives rejected. An accepted ADR
  is immutable; changing your mind is a new ADR that supersedes the old one.
- **Findings** go in `audits/` and must carry a status column.
- Anything that becomes wrong gets moved to `archive/` in the same change that makes it wrong.
  A stale document that stays in place is worse than no document, because a reader cannot tell
  which kind it is.

## A note on trusting these documents

The rewrite plan's §2.3 lists **fifteen verified false statements** in the current
documentation — claims the code does not support, including a README claim about a
screenshot and an `AGENTS.md` claim that CI runs a list it has never run.

That is the standard to hold the new documents to: **every claim is generated, tested, or
cites a `file:line` that can be checked in under a minute.** A confident-sounding
document that nobody verified is worse than no document, because a reviewer cannot tell
which kind it is.
