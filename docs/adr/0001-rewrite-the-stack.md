# ADR-0001: Rewrite the stack — Laravel + MySQL → Go + PostgreSQL + Next.js

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

4Ceria Portal is a Laravel 13 API (205 files / 33 547 LOC) over MySQL 9.6, with a React 19
+ Vite SPA (327 files / 77 409 LOC) and 296 API endpoints across 7 licensed professional
roles.

The owner wants a portfolio-grade system that is "really really perfect in terms of code,
performance, security, scalability", and has chosen to change the stack rather than
continue refining the existing one.

The codebase is not broken. It is, in several places, genuinely excellent: a
575-LOC integer-minor-unit `Money` value object, a 225-LOC `Hire` authorisation rule, a
405-line `schema:verify` gate, an append-only `EnumValues` migration helper, a
`ForeignKeyIndexGuard` that prevents MySQL error 1553, a 546-test suite with **zero
mocking** against a real database, and a 13-entry `AGENTS.md` trap register that records
production incidents in the author's own words.

Those are real assets, and a rewrite spends them. The question is not "is the current
code good?" — it is "does the new stack produce a better artefact for the same effort?"

## Decision

Rewrite to **Go 1.27.2 + PostgreSQL 17 + Next.js 16**, with two hard constraints:

1. **100 % feature parity** — all 296 endpoints, all 285 components, all 11 journeys,
   every domain invariant.
2. **Byte-identical design** — every screen renders the same pixels, enforced by a
   zero-tolerance visual-regression gate.

The rewrite is executed as a **strangler** (ADR-0002), with the current application
remaining deployed and green for the entire duration (ADR-0019).

## Consequences

### Positive

- **Static analysis for the backend.** The repository has `php -l` (syntax only) and no
  type checking. Go gives `go vet`, `staticcheck`, `golangci-lint` and compile-time
  exhaustiveness — the compiler catches the wrong return type, the missing map key, the
  nil dereference. This is the single largest quality-per-hour gain in the rewrite.
- **A single money representation.** `App\Support\Money` already uses integer minor
  units; Go's `int64` makes the type system enforce it, and the two float-rounding bugs
  in the PHP original are fixed in the port (ADR-0012).
- **Real concurrency testing.** The escrow's correctness depends on `SELECT … FOR UPDATE`
  serialising concurrent payments. `go test -race` with 100 goroutines on one escrow row
  is a test **PHP cannot express**.
- **Native partial indexes and advisory locks** in PostgreSQL, plus catalog-only
  `ALTER TYPE … ADD VALUE` (ADR-0006, ADR-0007) — which permanently retires the ENUM
  trap that `AGENTS.md` documents.
- **Observability for free** — `pprof`, `runtime/metrics`, OpenTelemetry, `log/slog`.
- **A modern frontend** — Next.js 16 App Router, React Query, real routes instead of a
  39-tab `useState` machine.

### Negative

- **The knowledge is ~90 % reusable; the code is ~30 %.** The rewrite re-derives the
  knowledge and rewrites the code. The code rewrite is the expensive half and the less
  valuable half.
- **The full scope is ~830–1 040 net hours against ~340 available** in a 26-week,
  15-hour-per-week window. This is the dominant risk in the plan (R9).
- **The trap register must be carried, not inherited.** Each of the 13 `AGENTS.md` traps
  becomes an explicit guard, assertion or test in the new codebase (ADR-0003, §9 of the
  rewrite plan).
- **The two stacks coexist for ~20 weeks**, doubling the CI surface and the operational
  surface.

### Neutral

- The PostgreSQL move is *not* the point of the rewrite; it is a prerequisite for the Go
  port being pleasant. The Go port is the point.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Keep Laravel, polish it** | The lowest-risk, highest-certain-value option — and it was on the table. Rejected because the owner chose the rewrite, and because "I can build a Go system" is a legible portfolio signal that the existing repo cannot make. The honest caveat is recorded in the rewrite plan: a rewrite that ships worse is *worse than the original*, and the entire plan exists to make that detectable rather than merely feared. |
| **Go + MySQL** | Keeps the ENUM trap, the error-1553 trap, no partial indexes, no advisory locks, and the case-sensitivity problem is avoided — but so are all the PostgreSQL wins. Half the cost of the database move for none of its benefits. |
| **PostgreSQL + keep Laravel** | The highest value-per-week option (3–5 ew). It is the *first milestone* of this rewrite's Postgres track, and it is not discarded — the schema conversion work is identical. It is simply not the whole plan. |
| **A Go rewrite without the parity machinery** | Faster, and it would be a different project. Without golden files, visual baselines and the legacy oracle there is no evidence the result is equivalent, and the central risk (R1) becomes undetectable. |

## References

- `docs/REWRITE-PLAN.md` — the master plan
- `docs/adr/0002-strangler-fig-not-big-bang.md`
- `docs/adr/0019-the-legacy-suite-is-the-oracle.md`
- `AGENTS.md` — the 13 production traps this rewrite must not reintroduce
