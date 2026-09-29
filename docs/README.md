# Documentation

## Read these

| | |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | **Start here.** Working rules, the verification gate, and 13 traps that have each cost real time. |
| [`DOMAIN.md`](DOMAIN.md) | The domain model: actors, project lifecycle, money flow, dispute arbitration. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime topology, request lifecycle, storage layout, deploy pipeline. |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Auth, authorization and upload conventions. |
| [`API_MAP.md`](API_MAP.md) | Every route grouped by domain. `routes/api.php` is the real source of truth. |
| [`BACKLOG.md`](BACKLOG.md) | What shipped, and what is deliberately not scheduled. |

## Tracking documents

| | |
|---|---|
| [`CLEANUP-LOG.md`](CLEANUP-LOG.md) | Append-only record of remediation passes: what broke, why, and what fixed it. Also holds the durable design decisions. |
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
- Durable **decisions** go in `CLEANUP-LOG.md` with what was tried and rejected.
- **Findings** go in `audits/` and must carry a status column.
- Anything that becomes wrong gets moved to `archive/` in the same change that makes it wrong.
  A stale document that stays in place is worse than no document, because a reader cannot tell
  which kind it is.
