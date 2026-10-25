# ADR-0004: The visual baseline is the Laravel-served build

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The rewrite must produce a **byte-identical** frontend. "Identical to what?" has two
candidate answers, and they are not the same thing.

**Candidate A — the Laravel-served build.** The blade at
`resources/views/app.blade.php` calls
`@vite(['resources/css/app.css', 'resources/js/app.tsx'])`, which emits an explicit
`<link>` for each entry. The result is the full Tailwind stylesheet, `index.css` and
the Google Fonts. This is the design the documentation describes and the screenshots
show.

**Candidate B — the standalone Vercel build.** `vite.config.js:81` adds
`resources/css/app.css` to `rollupOptions.input` as a **separate entry**. Vite emits a
CSS-only entry as its own asset plus a JS facade; it does **not** inject a `<link>` into
`index.html`. The committed `dist/` proves the consequence:

```
$ grep -o 'href="[^"]*\.css"' dist/index.html
href="/assets/index-DnKoKolg.css"

$ for f in dist/assets/*.css; do echo "$f $(stat -c%s $f) tw-vars=$(grep -c -- '--tw-' $f)"; done
app-BBqVl-Xr.css        206039  tw-vars=1     ← the real Tailwind output
index-DnKoKolg.css       15155  tw-vars=0     ← the only file the HTML links
vendor-maps-PhPnDjd-.css  65465  tw-vars=0

$ grep -c "fonts.googleapis" dist/index.html
0                       ← the blade has 3
```

**The Vercel deployment therefore ships no Tailwind and no webfonts.** Every `flex`,
`rounded-3xl` and `bg-white` is inert. `app-BBqVl-Xr.css` — the 206 KB Tailwind output
— is referenced only by `sw.js` and `manifest.json`, by no HTML.

The two candidates are therefore not two styles of the same design. They are **a design**
and **a page with no CSS**.

## Decision

**The baseline is Candidate A — the Laravel-served build.**

The Next.js port reproduces the intended design. The Vercel CSS bug is **fixed as part of
the port** and recorded as a published delta in `docs/PARITY.md` (`v1 → v2`).

> **And the baseline is captured *after* the Tailwind 4 upgrade lands in the legacy
> application** (ADR-0010). The upgrade is a large, visible change — a different
> preflight, `border-*` defaulting to `currentColor`, a different ring default, a
> different placeholder colour, an OKLCH palette — so the baseline has to describe **one**
> design. Upgrading the legacy app first means the port has a coherent target, the
> upgrade is isolated in a single reviewed PR with its own delta report, and the port's
> job stays *"reproduce"* rather than *"reproduce **and** upgrade"*.

## Consequences

### Positive

- **The port preserves a design, not a defect.** Nobody would want a page with no
  Tailwind.
- **The fix is forced anyway.** Next.js emits one stylesheet, so the split-entry
  problem cannot recur — but the port must deliberately order `index.css` **after**
  Tailwind, because the cascade is load-bearing (see below).
- **The delta is documented, not hidden.** `docs/PARITY.md` names the screens whose
  appearance changes and why.

### Negative

- **The port is not byte-identical to the current Vercel deployment.** It is
  byte-identical to the *intended* deployment. The difference is one CSS `<link>` and a
  font request. It is stated plainly here rather than buried.
- **A reviewer comparing the live Vercel site to the port will see a difference** — the
  live site is broken, the port is not. The README must say so, or it looks like the
  port changed the design.

### Neutral

Two findings from this investigation are now permanent requirements, independent of the
baseline choice:

1. **The CSS source order is load-bearing.** Tailwind v3 emits **no `@layer` at-rules**
   (verified: `grep -c "@layer"` → 0), so the cascade resolves by specificity, then
   source order. `index.css:1` declares
   `* { font-family: "Plus Jakarta Sans", sans-serif; … }` at specificity (0,0,0), which
   applies *directly* to every element and therefore **beats inheritance** from `<html>`.
   But `.font-sans` at (0,1,0) beats `*` and resolves to
   `Figtree, ui-sans-serif, system-ui, …` — and **Figtree is never loaded**
   (`tailwind.config.js` names it; the blade loads only "Plus Jakarta Sans"). So the app
   renders in **two font stacks** and one of them falls through to a platform font. The
   port must reproduce this, and the visual harness must **pin the platform fonts** or
   the baseline is machine-dependent.

2. **`index.css` must be emitted after Tailwind.** Its
   `.custom-navbar-container { z-index: 1000 }` beats the `z-100` utility on
   `Navbar.tsx:53` (same specificity, later source order). Reversing the order changes
   the navbar's stacking — visibly. The CI asserts the built stylesheet order, not only
   the visual result.
   *Under Tailwind 3 this depends on source order, because v3 emits no `@layer`
   at-rules. Under Tailwind 4 the cascade is a real
   `@layer theme, base, components, utilities`, so the requirement becomes explicit:
   the custom reset goes in the `base` layer, after Tailwind's own (ADR-0010).*

3. **The CSS must be in the HTML entry's module graph.** `resources/js/app.tsx:6`
   already imports `../css/index.css`; the Tailwind entry must be imported the same
   way. A CSS file added to `rollupOptions.input` becomes a **separate entry** and
   Vite emits no `<link>` for it — which is precisely why the standalone build ships
   no Tailwind today, and why `vite.config.js:82-89`'s comment describes a fix that
   does not work.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Baseline B — the current Vercel build** | It would require shipping a page with no CSS as "the design". No reviewer would accept that as a portfolio artefact, and it would make every later screenshot meaningless. |
| **Freeze the baseline per-screen, whichever is current** | Inconsistent: some screens would be compared against the broken build and some against the correct one, and the port could not be internally consistent. |

## References

- `docs/REWRITE-PLAN.md` §7.1, §7.2
- `vite.config.js:81`
- `resources/views/app.blade.php`
- `resources/css/index.css:1`
- `tailwind.config.js` (`fontFamily.sans: ['Figtree', …]`)
- `dist/index.html`, `dist/assets/*.css` — the evidence, in the repository
