# Architecture Decision Records

Every load-bearing decision in the 4Ceria rewrite, with its context, its decision and
its consequences. An ADR is immutable once **Accepted** — a change of mind is a *new*
ADR that supersedes the old one.

**Format:** `NNNN-title-in-kebab-case.md` · **Statuses:** `Proposed` · `Accepted` ·
`Superseded by ADR-NNNN` · `Rejected`

---

## The index

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-rewrite-the-stack.md) | Rewrite the stack: Laravel + MySQL → Go + PostgreSQL + Next.js | Accepted | 2026-10-19 |
| [0002](0002-strangler-fig-not-big-bang.md) | Strangler-fig, not big-bang | Accepted | 2026-10-19 |
| [0003](0003-parity-is-machine-checked.md) | Parity is machine-checked, never asserted | Accepted | 2026-10-19 |
| [0004](0004-visual-baseline-is-the-laravel-served-build.md) | The visual baseline is the Laravel-served build | Accepted | 2026-10-19 |
| [0005](0005-go-1-27-and-the-toolchain.md) | Go 1.27.2 and the 2026 toolchain | Accepted | 2026-10-19 |
| [0006](0006-postgresql-17-as-the-target.md) | PostgreSQL 17 is the target database | Accepted | 2026-10-19 |
| [0007](0007-native-postgres-enums.md) | Native PostgreSQL enums, one migration per added value | Accepted | 2026-10-19 |
| [0008](0008-collation-per-column-family.md) | Collation is decided per column family | Accepted | 2026-10-19 |
| [0009](0009-nextjs-16-app-router-in-web.md) | Next.js 16 App Router, in `web/` | Accepted | 2026-10-19 |
| [0010](0010-tailwind-4-is-adopted-legacy-app-first.md) | Tailwind 4 is adopted — and the upgrade lands in the legacy app first | Accepted | 2026-10-19 |
| [0011](0011-typescript-7-is-adopted-legacy-app-first.md) | TypeScript 7 is adopted — and the upgrade lands in the legacy app first | Accepted | 2026-10-19 |
| [0012](0012-money-is-integer-minor-units.md) | Money is integer minor units, end to end | Accepted | 2026-10-19 |
| [0013](0013-the-ledger-reference-registry.md) | The ledger reference vocabulary becomes a registry | Accepted | 2026-10-19 |
| [0014](0014-one-bids-table-with-a-role-discriminator.md) | One `bids` table with a role discriminator | Accepted | 2026-10-19 |
| [0015](0015-hired-professionals-are-profile-ids-everywhere.md) | Hired professionals are profile ids, everywhere | Accepted | 2026-10-19 |
| [0016](0016-sanctum-tokens-move-to-an-httponly-cookie.md) | Sanctum tokens move to an httpOnly cookie | Accepted | 2026-10-19 |
| [0017](0017-table-ownership-not-dual-write.md) | Table ownership, not dual-write | Accepted | 2026-10-19 |
| [0018](0018-users-and-tokens-stay-in-mysql.md) | `users` and `personal_access_tokens` stay in MySQL during the transition | Accepted | 2026-10-19 |
| [0019](0019-the-legacy-suite-is-the-oracle.md) | The legacy suite is the oracle, and its floor only rises | Accepted | 2026-10-19 |
| [0020](0020-escrow-invariants-live-in-the-database.md) | The escrow invariants live in the database | Accepted | 2026-10-19 |
| [0021](0021-a-visual-baseline-changes-only-through-an-adr.md) | A visual baseline changes only through an ADR | Accepted | 2026-10-19 |
| [0022](0022-the-post-parity-money-fix-is-separate.md) | The post-parity money fix is a separate, signed-off change | Accepted | 2026-10-19 |

---

## The rules

1. **One decision per ADR.** A record that contains two decisions contains none.
2. **Context before decision.** The reader must be able to reconstruct the situation
   without reading the rest of the repository.
3. **Consequences include the bad ones.** An ADR with only positive consequences has
   not been thought about.
4. **Supersede, never edit.** Changing your mind is a new ADR. The old one stays, marked
   `Superseded by ADR-NNNN`, because the reasoning that led to it is part of the
   history.
5. **A rejected decision is still a record.** "We considered Postgres and here is why
   not" is more useful than silence.

## Why this directory exists

`REFINEMENT-PLAN.md` opened with the rule *"Durable decisions go in `docs/adr/`"* — and
the directory was never created. Fifteen-plus load-bearing decisions ended up as prose
inside a 36 KB append-only log (`docs/CLEANUP-LOG.md`) that no reader opens. This
directory is the fix, and it is the primary portfolio artifact of the rewrite: a
reviewer can read 22 short records and understand every judgement the system embodies.
