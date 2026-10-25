# ADR-0019: The legacy suite is the oracle, and its floor only rises

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

A rewrite's central risk is that it ships worse than the original and nobody notices.
The evidence in this repository is unusually good on one axis and unusually bad on
another.

**Good:** the test suite is genuinely excellent. 46 files, **546 tests / 2 144
assertions**, real MySQL, per-test transaction rollback, and **zero mocking** — no
Mockery, no `shouldReceive`, no `swap()`. The discipline is visible in the tests
themselves: `MoneyFigureConsistencyTest` asserts the *ledger* rather than a status flag;
`RetentionTest` asserts idempotency explicitly; `RoleNullComparisonBypassTest` attacks
the `null == null` class from the hardest angle (the attacker is the initiator, so a
pre-existing guard cannot fire first).

**Bad:** it has **never run in CI**. `redis/redis-stack-action@v1` does not exist, so
the job dies at action resolution. Every run since 2026-09-28 is red, and `main` has no
branch protection. The suite is a treasure nobody is checking.

A rewrite makes this worse, not better: a port replaces the implementation the tests
describe, and the temptation is to "update the tests" to match the new behaviour. That
is how a rewrite silently degrades.

## Decision

**The legacy suite is the oracle, and the rewrite is judged against it.**

1. **The legacy suite must run in CI before anything else happens.** Week 1. It is the
   first thing fixed.

2. **The assertion floor only rises.** The `legacy-php` CI job fails if the suite
   reports **fewer than 546 tests or fewer than 2 144 assertions**.

   > This is the cheapest possible defence against "we fixed it by deleting the test".
   > It costs one shell script and it makes the most common rewrite failure mode
   > mechanically impossible.

3. **The floor is raised as endpoints are ported.** When an endpoint is ported, its
   Laravel assertions are **added** to the Go suite and the floor is **raised in the
   same commit**. The total coverage never decreases — it migrates. Over the rewrite
   the floor moves from 546/2 144 to 546+_/2 144+_ and finally to the Go suite's own
   count, with the legacy job retired only when its floor is met by the Go suite.

4. **The legacy application stays deployed and green for the whole rewrite.** It is a
   live compose profile, it is a required CI check, and it is the rollback target.

5. **A golden-file suite is added alongside**, recorded from the legacy application, so
   the two implementations are compared field-by-field and not only through the legacy
   tests (ADR-0003).

## Consequences

### Positive

- **The rewrite cannot silently regress.** Any behaviour the legacy suite pins is
  pinned in Go too, or the floor fails.
- **The floor is the artefact a reviewer can check in ten seconds.** "The rewrite kept
  546 tests and added 212" is a verifiable claim, not a boast.
- **The legacy suite becomes a specification.** Re-expressing it in Go is how the
  rewrite *learns* whether it understands the escrow rules — and the tests that are
  hardest to re-express are the ones that encode an invariant the rewrite did not
  understand.

### Negative

- **The floor is a blunt instrument.** It cannot tell "removed a redundant assertion"
  from "removed a load-bearing one". It catches deletion; it does not judge quality.
  The golden files and the visual baselines are the finer instruments.
- **The legacy job costs ~20 minutes of CI per run** for the whole transition, and
  that time is spent on code that is being retired. Accepted: the alternative is
  retiring the oracle before the port is proven.
- **Writing the Go equivalents of 546 tests is real work** — estimated at 8–12
  engineer-weeks. It is also the work that most directly proves the port is correct.

### Neutral

- **The legacy suite is not deleted when the legacy app is retired.** It is retired at
  the same moment the floor is met by the Go suite, in its own commit, so the two never
  coexist with a gap.
- **The three test files the repository already distrusts** — the "tests that could not
  fail" cleaned up in `59dc6bb` — are not resurrected. The floor counts tests and
  assertions, not quality, and the quality work was already done.

## References

- `docs/REWRITE-PLAN.md` §2.1, §9, §11 (R1)
- `tests/Support/DatabaseHarness.php` — the rollback harness
- `tests/MoneyFigureConsistencyTest.php`, `tests/RetentionTest.php`,
  `tests/RoleNullComparisonBypassTest.php` — the discipline the floor protects
- `docs/adr/0003-parity-is-machine-checked.md`
- `.github/workflows/ci.yml:106` — the action that does not exist
