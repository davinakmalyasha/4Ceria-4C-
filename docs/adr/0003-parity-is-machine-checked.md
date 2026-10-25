# ADR-0003: Parity is machine-checked, never asserted

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

"100 % feature parity" and "byte-identical design" are the two requirements that make
this rewrite safe. Left as prose, they are unfalsifiable: a reviewer reading a case
study cannot tell whether they were achieved or merely intended.

The current repository contains a cautionary tale in its own history. `FINAL-SWEEP.md`
documents a feature that "computed, stored, displayed and scheduled a value while never
moving money at all" — and the lesson it records is *"assert on **ledger rows**, never on
a command's exit code, a `retention_released_at` timestamp, or a computed column. All
three were green while the feature did nothing."*

That failure mode — green checks over inert behaviour — is exactly what a rewrite
invites, because a rewrite produces a *new* implementation that must be compared to an
*old* one.

## Decision

Parity is expressed as **six machine-checked mechanisms**, each covering a different
class of drift, each a **required CI check** on `main`:

| # | Mechanism | Catches |
|---|---|---|
| 1 | **Route-set equality** — Laravel `route:list --json` vs the Go router's *declared* set vs its *live* registered set vs `routing/routes.yaml` | renamed, forgotten and phantom endpoints (AGENTS.md trap 7) |
| 2 | **Middleware + authorisation parity** — the normalised middleware set per route | authorisation drift — the #1 recurring bug class in this repo's history |
| 3 | **URI classification, three-way** — 2 000 URIs including adversarial near-misses, resolved through the real Laravel router, the Go mux and the gateway | greedy-regex and wrong-handler 404s |
| 4 | **Golden-file contracts** — `php artisan contract:capture --all` records request + response + **side-effect rows** | every field-level drift |
| 5 | **Visual regression** — zero-tolerance pixel diffing against a committed baseline | every pixel (ADR-0004, ADR-0021) |
| 6 | **The assertion-count floor** — the legacy suite may not drop below 546 tests / 2 144 assertions | "we fixed it by deleting the test" |

Plus a seventh, for the money specifically: **a differential corpus** comparing the PHP
`Money` implementation against the Go one over 2 000 randomised cases (`money-diff`), and
the **escrow invariants recomputed on both engines** after every slice cutover.

`docs/PARITY.md` is **generated** from these tools, committed, and CI-enforced. A
hand-edit to it is a CI failure. The matrix cannot drift from reality.

## Consequences

### Positive

- **"Done" is a question with an answer.** `docs/PARITY.md` says, per endpoint, what tier
  it is at and what verified it.
- **The risk that the rewrite ships worse becomes detectable.** The assertion floor, the
  golden files and the visual baselines are three independent instruments aimed at the
  same risk (R1).
- **The parity matrix is the primary portfolio artefact.** It is generated, so it cannot
  be a flattering fiction.
- **The golden files are the specification.** They are recorded from the working
  application, not written by hand.

### Negative

- **The tooling is a real cost** — a capture command, a parity checker, a replay
  corpus, a visual harness. Probably 2–3 engineer-weeks of the total, and it is the part
  most likely to be skipped under pressure.
- **Golden files must be regenerated when the legacy app legitimately changes**, and
  "legitimately" is a judgement call. The CI's `contract-freshness` job makes the
  *staleness* visible; it cannot make the judgement.
- **The visual baseline is the most fragile instrument** — a font, a Chromium patch or a
  platform difference all produce false diffs. Mitigated by pinning the browser, the
  fonts, the timezone and the locale (ADR-0004).

### Neutral

- The mechanisms are not new ideas. They are the standard strangler-fig toolkit,
  applied with the discipline this repository already demonstrates in its own test
  suite.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **A written parity checklist** | A checklist is only as good as the person ticking it, and it cannot detect a field that silently stopped being returned. |
| **Manual QA against both stacks** | Does not scale to 296 endpoints × 39 tabs × 60 overlays, and it is not repeatable. |
| **Only the legacy test suite as the oracle** | It tests the *legacy* behaviour, not the *new* implementation's agreement with it. The golden files bridge that gap. |

## References

- `docs/REWRITE-PLAN.md` §5, §9
- `docs/adr/0019-the-legacy-suite-is-the-oracle.md`
- `docs/adr/0021-a-visual-baseline-changes-only-through-an-adr.md`
- `FINAL-SWEEP.md` §4.9 — the "green while the feature did nothing" lesson
