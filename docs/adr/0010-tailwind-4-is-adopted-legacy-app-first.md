# ADR-0010: Tailwind 4 is adopted — and the upgrade lands in the legacy app first

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The current project is on **Tailwind 3.4.14**. The latest is **4.3.3**. The owner asked
for the latest version of the stack, and Tailwind 4 is not optional in the sense of
"nice to have" — it is a rewrite of the framework, and the project's 65 164 lines of
components are written against v3's semantics.

**Tailwind 4 is not pixel-compatible with Tailwind 3.** The breaking changes that
affect this application:

| Change | v3 | v4 | Impact here |
|---|---|---|---|
| **Default `border-*` colour** | `gray-200` | `currentColor` | Every uncoloured border in the app changes colour. **The single largest visual delta.** |
| **Default ring width** | `3px` (`ring`) | `1px` (`ring-1`) | `ring` → `ring-3` needed everywhere. |
| **Default ring colour** | `blue-500` | `currentColor` | Focus rings change colour. The app uses visible focus rings consistently. |
| **Default placeholder colour** | `gray-400` | current text colour at 50 % opacity | Every form placeholder changes. |
| **Preflight** | v3 reset | v4 reset; `<dialog>` margins reset to 0 | Layout shift on any `<dialog>`. |
| **Stacked variants** | right → left | left → right | Order-sensitive stacks must be reversed. |
| **Gradients** | `bg-gradient-to-*` | `bg-linear-to-*` | Rename. |
| **Shadows / blur** | `shadow-sm`, `blur-sm` | renamed | Rename. |
| **`outline-none`** | — | `outline-hidden` | Rename. |
| **The default palette** | hex | **OKLCH** | Rendered colour values shift by a hair through the OKLCH round-trip. |
| **Config** | `tailwind.config.js` | CSS `@theme` blocks | `corePlugins`, `safelist` and `separator` are **not supported** in v4. |
| **Plugin loading** | `plugins: []` in JS | `@plugin "…"` in CSS | `@tailwindcss/forms` works via `@plugin`. |
| **PostCSS plugin** | `tailwindcss` | `@tailwindcss/postcss` (or the `@tailwindcss/vite` plugin) | Build pipeline change. |
| **Browser baseline** | — | Safari 16.4+, Chrome 111+, Firefox 128+ | A real constraint on the PWA's audience. |
| **Source detection** | explicit `content` globs | automatic, with `@source` for explicit paths | The project's known purge bug needs explicit `@source`. |

So: adopting Tailwind 4 is a **large, visible change**, and the rewrite's second hard
requirement is that the frontend be **byte-identical**.

## Decision

**Adopt Tailwind 4.3.3 everywhere. The upgrade lands in the legacy Laravel application
first, as its own reviewed change with its own visual-diff delta report. The visual
baseline is then captured against the upgraded application, and the Next.js port
reproduces *that*.**

### Why "legacy app first" and not "in the port"

The visual baseline must describe **one consistent design**. If the legacy app is
Tailwind 3 and the port is Tailwind 4, there is no single baseline to compare against —
the gate would either fail on every screen, or (worse) be quietly re-baselined until it
meant nothing.

Upgrading first makes the comparison meaningful and it **isolates a large change in a
small one**:

- The upgrade is **one PR** in the legacy app: a dependency bump, a config migration,
  a codemod pass, and a delta report enumerating every screen that changed and by how
  much.
- The port's job stays **"reproduce"**, not "reproduce *and* upgrade". Mixing them
  means a pixel difference has two possible causes and no way to tell them apart.
- The legacy app is the oracle. Upgrading it **before** the port means the oracle and
  the port share a design system, and the visual gate compares like with like.

### The upgrade's shape

**Configuration moves to CSS.** The project's `tailwind.config.js` is small — a
`fontFamily.sans` extension, the forms plugin, and content globs — so the CSS-first
migration is small too:

```css
/* resources/css/app.css */
@import "tailwindcss";
@plugin "@tailwindcss/forms";

/* The project's own purge bug: classes defined in .ts files (STATUS_CONFIG,
   preset colours) were purged from production CSS — chips rendered unstyled.
   The globs must therefore be EXPLICIT, not left to auto-detection. */
@source "../../resources/js/**/*.{ts,tsx}";
@source "../../resources/views/**/*.blade.php";

@theme {
  --font-sans: Figtree, ui-sans-serif, system-ui, sans-serif;
}
```

**`npx @tailwindcss/upgrade` does the bulk of the work** (it handles the config
migration, the utility renames and the template changes), and its output is **reviewed
by hand** — the codemod catches roughly 90 %, and the remaining 10 % is exactly where
the pixels live.

### The CSS-entry fix that the upgrade forces

The upgrade is also the moment to fix a **live deployment defect** the current config
claims to have fixed but has not.

`vite.config.js:82-89` carries this comment:

> *"`resources/css/app.css` IS THE ONLY FILE WITH `@tailwind` DIRECTIVES. Without it in
> this input list, the standalone build emitted `index-*.css` from
> `resources/css/index.css` alone — confirmed to contain no `--tw-` variable and no
> `.container{` rule — so the frontend Vercel serves shipped with NO Tailwind at all."*

The **diagnosis is correct** and the **remedy does not work**. Adding a CSS file to
`rollupOptions.input` makes Vite emit it as a **separate entry** — its own asset plus a
JS facade — and Vite does **not** inject a `<link>` into `index.html` for a CSS-only
entry. The committed build proves it:

```
$ grep -o 'href="[^"]*\.css"' dist/index.html
href="/assets/index-DnKoKolg.css"

$ for f in dist/assets/*.css; do echo "$f $(stat -c%s $f) tw-vars=$(grep -c -- '--tw-' $f)"; done
app-BBqVl-Xr.css        206039  tw-vars=1     ← the real Tailwind output
index-DnKoKolg.css       15155  tw-vars=0     ← the only file the HTML links
```

`app-BBqVl-Xr.css` — the 206 KB Tailwind output — is referenced only by `sw.js` and
`manifest.json`, by no HTML. **The Vercel deployment ships no Tailwind and no
webfonts**, and every `flex`, `rounded-3xl` and `bg-white` in it is inert.

**The correct fix is to put the CSS in the HTML entry's module graph**, by importing it
from the JS entry:

```ts
// resources/js/app.tsx
import '../css/app.css';    // Tailwind — MUST come first
import '../css/index.css';  // the custom reset — MUST come after
```

Vite then emits a single CSS asset for the HTML entry and links it. This also makes
the two build modes agree — the Laravel mode links `app.css` and `index.css` separately,
**in that order**, and the order is load-bearing (§7.2 of the rewrite plan).

### The remaining decisions

| Question | Decision |
|---|---|
| **Restore v3's default border colour?** | **No.** Tailwind's own documentation says the compatibility variables are "not considered idiomatic usage". The change is real and is **quantified in the delta report**. The app's border usages mostly specify a colour; the upgrade tool's output is reviewed for the ones that do not. |
| **Restore v3's default ring width/colour?** | **No** — same reasoning. `ring` → `ring-3` is a mechanical rename the tool handles. |
| **Stacked variants** | Reversed where order-sensitive, per the tool's output. |
| **The browser baseline** | Chrome 111 / Safari 16.4 / Firefox 128 is acceptable for an Indonesian construction-marketplace PWA. Recorded as a limitation. |
| **The OKLCH palette shift** | Accepted, and included in the delta report. |
| **The 24 invalid Tailwind tokens** (`text-gray-750`, `border-zinc-150`, …) | They are still invalid in v4 — `tailwind.config.js` has no `extend.colors`, and v4 has no `extend` either. They are **fixed** as part of the upgrade, with the colour choices in the delta report. |

## Consequences

### Positive

- **"Use the latest" is honoured with no caveat.** The project ends on Tailwind 4.3.3,
  the current stable, with the CSS-first configuration and the OKLCH palette.
- **The deployment defect is fixed.** The Vercel build ships Tailwind and the webfonts
  for the first time, and the two build modes stop disagreeing.
- **The upgrade is isolated and reviewable** — one PR, one delta report, one decision
  point, before the rewrite starts.
- **The baseline describes one design.** The legacy app and the port share Tailwind 4,
  so the visual gate compares like with like.
- **The 24 invalid tokens are fixed** rather than preserved.

### Negative

- **The application's appearance changes.** The border-colour, ring and placeholder
  changes are visible. That is a *design* change, and it is exactly what the delta
  report exists to make reviewable.
- **The upgrade is a real chunk of work in a legacy app that is about to be retired.**
  It is the one piece of effort spent on code with a short remaining life — but it is
  the price of a consistent baseline, and without it the visual gate cannot exist.
- **`corePlugins`, `safelist` and `separator` are unavailable in v4.** The project uses
  none of them, so the loss is theoretical, but it is a real constraint on the design
  system's future.
- **The OKLCH palette shift is not exactly quantifiable** as a number of pixels. It is
  a sub-pixel colour rounding, and the delta report captures it as an image diff.

### Neutral

- **The `@tailwindcss/forms` plugin version moves to 0.5.11** and is loaded with
  `@plugin "@tailwindcss/forms";`.
- **The `@tailwindcss/vite` plugin is preferred over the PostCSS plugin** — Tailwind
  4 handles CSS imports and vendor prefixing itself (Lightning CSS), so
  `postcss-import` and `autoprefixer` can be dropped.
- **The `theme()` function is deprecated** in favour of CSS variables. The project
  does not use it.
- **The port's CSS layer question is now simpler.** Tailwind 4 emits a real
  `@layer theme, base, components, utilities` cascade, so `index.css` can be placed in
  an explicit layer rather than relying on source order — but it must still land
  **after** the base layer, and the CI still asserts the built stylesheet order.

## Implementation (2026-10-21)

**This ADR is implemented.** Tailwind CSS 4.3.3 is in the legacy application,
and the rendering was MEASURED against the committed Tailwind v3 baseline
rather than asserted.

| Artefact | What it is |
|---|---|
| `docs/TW4-UPGRADE-DELTA.md` | the measured delta, the nine compatibility fixes, and the reasoning |
| `spec/visual-baseline/tailwind-v3.css` | the v3 stylesheet the design was measured against |
| `spec/visual-baseline/computed-v3.json` | the computed-style signature of every class in it |
| `spec/visual-baseline/renames.json` | the 50 class renames the codemod applied |
| `scripts/visual/computed-styles.mjs` | renders every class in a real browser and records its computed style |
| `scripts/visual/normalize.mjs` | the rules that decide whether two computed styles are the same picture |
| `scripts/visual/compare-builds.mjs` | the gate |

**The result: 2 renderings changed out of 2 542**, both a one-in-255 alpha
difference caused by Tailwind v4 mixing an alpha in `oklab` where v3 mixed it
in `sRGB`. 81 classes that v3 silently ignored now render — v3 bugs, fixed.
50 classes were renamed, and the picture is unchanged for each.

The nine compatibility fixes were: the **cascade layers** (the app's CSS is now
in `@layer utilities`, which is the faithful translation of v3's cascade — an
unlayered file beat every Tailwind utility and 259 elements lost their
padding), the **palette** (all 244 v3 values, generated from the v3 package),
the **ring colour**, the **shadow scale**, the **blur scale**, the
**drop-shadow scale**, the **transition property list**, the **outline width**,
and the **`--app-*` namespace** (the app's own `--radius-lg: 24px` was
shadowing Tailwind v4's radius token, and `rounded-lg` rendered at 24px
instead of 8px on every element in the application).

**The gate runs in CI**, and the same harness is how the Next.js port will be
compared against this baseline.

## References

- `docs/REWRITE-PLAN.md` §7.1, §7.2, §10, §13
- `docs/STACK.md` §1, §3
- `tailwindcss.com/docs/upgrade-guide`
- `vite.config.js:82-89` — the comment that documents the bug and prescribes a fix
  that does not work
- `dist/index.html`, `dist/assets/*.css` — the evidence, committed
- `resources/css/app.css`, `resources/css/index.css`, `resources/js/app.tsx:6`
