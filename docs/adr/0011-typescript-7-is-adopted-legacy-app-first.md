# ADR-0011: TypeScript 7 is adopted — and the upgrade lands in the legacy app first

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The current project is on **TypeScript 6.0.3**. The latest is **7.0.2** — the **native
Go port** of the compiler, released 2026-07-08, **8–12× faster** on full builds.

The project carries a **ratchet**: a committed baseline of **96 errors**
(`typecheck-baseline.json`) that must never rise, enforced by
`scripts/typecheck-baseline.mjs` as a required CI check.

TypeScript 7 is *mostly* compatible. Microsoft's own statement:

> "TypeScript 7.0 has been made to be compatible with TypeScript 6.0's type-checking and
> command-line behavior. Practically any TypeScript code that compiles cleanly with
> TypeScript 6.0 (with the **`stableTypeOrdering` flag on**, and without any
> `ignoreDeprecations` flag set) should compile identically in TypeScript 7.0."

And the `typescript-go` feature matrix:

| Feature | Status | Note |
|---|---|---|
| Parsing / scanning | done | Exact same syntax errors as TS 6.0 |
| Type resolution | done | Same types as TS 6.0 |
| **Type checking** | **done** | **Same errors, locations, and messages as TS 6.0.** Types printback in errors may display differently. |
| JS-specific inference and JSDoc | done | Complete, but intentionally lacking some features |
| Declaration emit | done | Differs greatly, intentionally, to be closer to TS declarations |
| Language service (LSP) | in progress | |
| API | not ready | |

So the **error count and the error messages should be the same** — which means the
ratchet should carry over. But two conditions attach: `stableTypeOrdering` must be on,
and the claim is "practically", not "exactly".

## Decision

**Adopt TypeScript 7.0.2 everywhere, and land the upgrade in the legacy application
first**, so the ratchet baseline is re-measured under the new compiler before the
rewrite starts.

### Why "legacy app first"

1. **The ratchet baseline must mean the same thing on both sides.** 96 is a number
   measured with TS 6.0.3. If the port compiles with TS 7 and the legacy app with
   TS 6, "the typecheck baseline" is two different measurements, and the comparison
   between the two codebases is meaningless. Upgrading the legacy app first makes one
   compiler, one baseline, one meaning.
2. **The 10× speedup is worth having during the port.** 77 409 LOC of SPA, 285
   components, and a typecheck that runs on every save — this is the single largest
   productivity factor in the frontend track.
3. **It is a small, contained change.** The upgrade tool (`tsgo`/`tsc` under TS 7) is
   mostly a dependency bump plus a re-measured baseline. The 96 errors themselves are
   unchanged in count and location; the *fixes* for them are TypeScript-version-agnostic
   and can proceed on either version.

### The upgrade's shape

- **`typescript: 7.0.2`** in `devDependencies`. For TS 7 RC and later the command is
  `tsc` — not `tsgo` — so `npx tsc --noEmit` in `typecheck-baseline.mjs` keeps working
  unchanged.
- **`"stableTypeOrdering": true`** in `tsconfig.json`. This is Microsoft's own stated
  condition for identical behaviour, and it makes the error **order** deterministic,
  which the ratchet script's line-by-line diffing depends on.
- **The baseline is re-measured and committed** with
  `node scripts/typecheck-baseline.mjs --update`. The number is expected to be ≈96 —
  TS 7 reports the same errors at the same locations — and **the committed baseline
  records the actual measured value**, whatever it is.
- **The ratchet script is verified against the native binary** in the same commit.
  `typecheck-baseline.mjs` counts lines matching `/error TS\d+/` in the `tsc --noEmit`
  output. TS 7's documented compatibility ("same errors, locations, and messages") means
  the format is unchanged, but **the native binary's output stream and exit behaviour
  are not assumed** — the script's `execSync` call catches the non-zero exit and reads
  `err.stdout`, and that path is exercised by a test before the baseline is trusted.
- **The 96 errors are then fixed**, on TS 7, with the ratchet falling monotonically:
  96 → 84 → 57 → 19 → 0. The 27 `TS2367` errors are the highest-value group, because
  the compiler is reporting that **the project/bid/document status enums are duplicated
  about six times in the client** — the same disease as `AGENTS.md` trap #8, on the
  client side.

### The one thing that does *not* change

**`strict: true` is not flipped during the port.** That is a property of the *code*,
not of the compiler, and it is a separate concern:

| Phase | Setting |
|---|---|
| The legacy app, now | `strict: false` (unchanged) |
| The legacy app, during the port | `strict: false` — the port is a *move*; forcing a clean `tsc` would mean editing component internals mid-move, which is exactly the kind of change that risks a pixel delta |
| `web/src/lib/**` and `web/src/types/**` | `strictNullChecks: true` under a second tsconfig project |
| `web/src/**` | `strict: true`, once the backlog is zero |

## Consequences

### Positive

- **"Use the latest" is honoured with no caveat.** The project ends on TypeScript 7.0.2,
  the current stable, and the rewrite's frontend track gets a **10× faster typecheck**
  for its entire duration.
- **The ratchet keeps its meaning.** One compiler, one baseline, one number, on both
  sides of the rewrite.
- **The 96-error cleanup is a real, visible improvement**, and it is the same work
  either way — only the compiler it runs under changes.
- **`stableTypeOrdering: true`** makes the error order deterministic, which makes the
  ratchet's diff output readable and its regressions attributable.

### Negative

- **The baseline number will change** — from 96 to whatever TS 7 measures. The
  *ratchet* is what matters; the number is a measurement. The committed
  `typecheck-baseline.json` records the new value and its timestamp.
- **The native binary is a new install shape.** `typescript@7.0.2` ships a platform
  binary rather than a JavaScript implementation. The CI image and the local
  environment must both be able to fetch and run it, and the `package-lock.json` must
  pin it. This is verified in the same commit as the bump.
- **The LSP is still in progress.** The *editor experience* on TS 7 is less mature than
  on TS 6 — language-service features are "in progress" per Microsoft's own matrix,
  and the API is "not ready". A developer using a TS-7-native editor may hit gaps.
  The CLI (`tsc --noEmit`) — which is what CI and the ratchet use — is complete.
- **`tsc` and `tsgo` are different packages.** For TS 7 RC and later the command name
  is `tsc`, so `npx tsc --noEmit` is unchanged — but a contributor with a stale
  global `tsc` on PATH could invoke the wrong compiler. The scripts use `npx` and pin
  the version, and `npm run typecheck` resolves the local binary first.

### Neutral

- **The `typecheck-baseline.mjs` script is unchanged in shape**, and gets one
  addition: a test that asserts the parser still counts the errors under the native
  binary's output.
- **The 96 errors' *fixes* are version-agnostic** — 38 missing API response fields, 27
  status-union duplications, 12 prop mismatches, 11 argument mismatches, and 8 one-line
  fixes. None of them depends on the compiler's version.
- **`web/` starts on TS 7** with the ratchet baseline seeded at the legacy app's
  post-upgrade number, and the baseline may only fall.

## Implementation (2026-10-21)

**This ADR is implemented.** TypeScript 7.0.2 is installed, and the two
compilers run side by side exactly as Microsoft prescribes.

```json
"@typescript/native": "npm:typescript@7.0.2",          // the native binary
"typescript":         "npm:@typescript/typescript6@6.0.2" // the API one
```

| Command | Compiler | Why |
|---|---|---|
| `npx tsc` | TypeScript **7.0.2** (native, Go) | the project-wide type-check — 5.2× faster |
| `npx tsc6` | TypeScript **6.0.3** (JS) | the API `typescript-eslint` imports |
| `npm run typecheck:check` | TypeScript 7 | the ratchet, called by path so it cannot drift to the other compiler |
| `npm run typecheck:parity` | **both** | the gate |

### The compatibility claim was MEASURED, not believed

Microsoft states that TypeScript 7 "reports the same errors, locations, and
messages as TypeScript 6.0 (with the `stableTypeOrdering` flag on)".

Verified here: **94 errors from each compiler, and the two lists are
byte-identical** — same files, same line and column, same codes, same text.
`stableTypeOrdering: true` is set in `tsconfig.json`, which is what makes
the union-ordering, and therefore the error text, identical.

The ratchet baseline is therefore **unchanged at 94** — but the ratchet only
counts, so a compiler that reported the same COUNT with different ERRORS
would pass it. `scripts/ci/assert-ts-parity.mjs` compares the two lists, line
for line, and is wired into CI.

### The speed

| | TypeScript 6.0.3 | TypeScript 7.0.2 |
|---|---|---|
| Full project type-check | 19.1 s | **3.7 s** |

### A broken ratchet found on the way

The ratchet had a latent defect: it invoked the compiler through
`execSync(process.execPath, …)`, and `process.execPath` is
`C:\Program Files\nodejs\node.exe` — the shell split it on the space, the
compiler never started, and the script counted **zero** errors and printed
`Typecheck OK: 0 errors (baseline 94)`.

A ratchet that reports success when its instrument is broken is worse than no
ratchet, because it is trusted. The script now uses `execFileSync`, checks
that the compiler binary EXISTS, and refuses to pass when the output contains
`Cannot find module`.

## References

- `docs/REWRITE-PLAN.md` §10, §13
- `docs/STACK.md` §1, §3
- `typecheck-baseline.json`, `scripts/typecheck-baseline.mjs`
- `devblogs.microsoft.com/typescript/announcing-typescript-7-0`
- `github.com/microsoft/typescript-go` — the feature matrix and the `stableTypeOrdering`
  condition
