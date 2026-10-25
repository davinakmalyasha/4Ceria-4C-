# ADR-0002: Strangler-fig, not big-bang

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The rewrite must produce a system that is **byte-identical** in behaviour to a 296-endpoint
application with 98 tables, 11 user journeys and a financial ledger. A big-bang cutover —
"branch, rewrite everything, switch the DNS" — makes that claim unfalsifiable: if
something differs, nobody knows what.

The temptation is real. A strangler is slower to *start* and produces a hybrid system
for weeks, and it never yields a single clean commit that says "the new system works".

## Decision

Execute the rewrite as a **strangler-fig**, with a dedicated Go edge process that routes
per `(method, path)`:

```
Browser ──▶ cmd/gateway (Go) ──▶ Laravel 13 (legacy)   ← shrinks slice by slice
                │                └─▶ Go API (new)        ← grows slice by slice
                └──▶ web/ (Next.js) — same-origin BFF
```

- **`routing/routes.yaml`** declares all 296 routes once. Three consumers read it: the Go
  router, the gateway, and the parity checker. Flipping traffic is a one-line commit plus
  `SIGHUP`.
- **19 vertical slices**, each independently verifiable and independently reversible
  (ADR-0017 for the data model, §8 of the rewrite plan for the runbook).
- **A shadow comparator** samples reads routed to Go and compares them against the
  still-deployed Laravel handler. Writes are never shadowed — a shadowed `mark-paid`
  would double-write the ledger.
- **The legacy code is deleted only in a separate PR, 72 hours after a cutover** — never
  in the cutover PR, because the rollback procedure needs it to exist.

## Consequences

### Positive

- **Parity is falsifiable.** The existing React SPA keeps talking to `/api/*` unchanged
  while endpoints flip from Laravel to Go. If the SPA keeps working, the contract holds
  *by construction*. The SPA becomes a 250-endpoint contract test harness.
- **Rollback is a map edit.** Reverting one line in `routing/routes.yaml` and sending
  `SIGHUP` returns traffic to Laravel. The data model makes the rollback lossless
  (ADR-0017).
- **The risk is spread.** A failed slice costs one slice, not the project.
- **The legacy application is the oracle throughout** (ADR-0019), so it is never
  "migrated away from" untested.

### Negative

- **Three processes run at once** for ~20 weeks, with a gateway, an ETL, two databases
  and two ORMs.
- **The strangler pattern is more code than a rewrite.** The gateway, the route map, the
  ETL, the shadow comparator and the parity tooling are all *extra* work that a
  big-bang would not need.
- **The owner of the project domain is one indivisible cluster.** A `mark-paid` writes a
  bid row, a termin row, a ledger row **and** `projects.budget` — so the money slice
  cannot be cut over early, even though the money *library* is ported in week 2. This is
  the cost of refusing dual-write (ADR-0017).

### Neutral

- The gateway is a Go binary, not nginx, because per-route upstream selection and the
  shadow comparator both need logic and sit next to the router.
- The frontend does **not** switch per endpoint. It switches per *screen*, and each
  screen flips when its journey is green against both upstreams.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Big-bang** | Parity becomes unfalsifiable, and the failure mode is a system that is subtly wrong in ways nobody can name. Unacceptable for a financial ledger. |
| **Blue/green with a data migration** | A single data cutover is a single point of catastrophic failure. The per-table ownership model spreads it across 19 slices, each with its own rehearsal and rollback. |
| **Rewrite the frontend first** | The frontend is the smaller risk. A visual regression on a real endpoint is cheap to fix; a ledger double-charge is not. The frontend is ported *against the Go contract* once it exists. |

## References

- `docs/REWRITE-PLAN.md` §4, §8
- `docs/adr/0003-parity-is-machine-checked.md`
- `docs/adr/0017-table-ownership-not-dual-write.md`
