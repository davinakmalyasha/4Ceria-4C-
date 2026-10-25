# ADR-0021: A visual baseline changes only through an ADR

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

"Byte-identical design" is only meaningful if it is **enforced**. A screenshot
comparison that a developer can regenerate with a flag is a suggestion, not a gate — and
under delivery pressure, suggestions lose.

The failure mode is well known and it is quiet: the first baseline is captured slightly
wrong (a font did not load, the clock was not frozen, an animation was mid-flight), the
first diff is therefore noise, and once the team learns to regenerate baselines to make
the noise go away, the gate has stopped existing while still appearing in the CI config.

The other failure mode is the opposite: a legitimate change arrives — a dependency
upgrade, a deliberate design decision — and the gate blocks it, so somebody weakens the
threshold to `maxDiffPixelRatio: 0.001` "just this once".

## Decision

**A visual baseline may only change through an accepted ADR, and the CI enforces it
mechanically.**

The `visual-regression` job:

1. Runs Playwright with **zero tolerance** — `maxDiffPixels: 0`,
   `maxDiffPixelRatio: 0`, `threshold: 0` (the antialiasing tolerance is disabled).
   One changed pixel fails the build.
2. Uses `--update-snapshots=missing`, which creates a baseline **only when one is
   absent** (a genuinely new screen) and **never overwrites an existing one**.
3. **Asserts that no baseline changed:**

```bash
if ! git diff --quiet -- web/visual/baseline; then
  echo "::error::A visual baseline changed in this PR."
  echo "Baselines are frozen. Changing one requires:"
  echo "  1. a new file docs/adr/ADR-NNNN-*.md with 'Status: Accepted'"
  echo "  2. an ADR section titled 'Visual baseline' naming the screens"
  echo "  3. the PR body containing the token 'visual-baseline: regenerated'"
  echo "  4. owner approval (CODEOWNERS on web/visual/baseline/**)"
  git diff --stat -- web/visual/baseline
  exit 1
fi
```

4. **Asserts that every screen has a baseline.** A new screen without one is a **FAIL**,
   not a skip — otherwise a screen could be added by simply not being captured.
5. Pins the browser build, the fonts, the timezone, the locale, the clock and the
   animation state, so a diff is a *real* diff (ADR-0004).

## Consequences

### Positive

- **The gate cannot be quietly weakened.** Changing the threshold is a change to the
  expectations file, which is a code review, not a flag.
- **"NO CHANGE AT ALL" becomes verifiable.** A reviewer can read the baseline
  directory and see exactly which screens exist and what they must look like.
- **Design changes become decisions, not accidents.** A deliberate visual change is an
  ADR with a rationale, which is a *better* artefact than an unreviewed screenshot
  update.
- **The baseline is a complete inventory of the product's appearance** — 17 routes, 39
  dashboard tabs, 11 workspace tabs, 8 phases and 60 overlay surfaces.

### Negative

- **Legitimate changes are slower.** A dependency bump that shifts a shadow by one
  pixel requires an ADR and a review. That is the intended friction, but it is friction.
- **The baseline directory is large.** Roughly 135 screens × several role states, at
  1440×900 PNG. It is committed to the repository, and the size has to be managed
  (PNG optimisation, and a review of whether every role state earns its file).
- **A platform change in a contributor's environment produces false diffs.** The
  harness image pins the fonts and the browser, so this is contained — but a contributor
  running the harness locally on Windows will see differences the CI does not. The
  harness therefore runs in the container, and the local command says so.

### Neutral

- **The ADR gate has a documented escape valve** — the token
  `visual-baseline: regenerated` in the PR body — so a legitimate change is a
  two-minute operation once the ADR exists. The friction is in *writing down why*, not
  in the mechanics.
- **Post-parity, this ADR does not go away.** The visual baseline becomes the
  regression suite for the *next* decade of changes. It is an asset, not a phase.

## References

- `docs/REWRITE-PLAN.md` §7
- `docs/adr/0004-visual-baseline-is-the-laravel-served-build.md`
- `docs/adr/0003-parity-is-machine-checked.md`
