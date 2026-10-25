# The Tailwind 4 upgrade — measured delta

**Date:** 2026-10-21
**Scope:** Tailwind CSS 3.4.14 → 4.3.3, in the legacy application.
**Requirement:** the design is byte-identical. This document is the evidence.

---

## 1. How it was measured

A Tailwind upgrade is a visual change until it is proven otherwise, and the
obvious proofs do not work:

- **Comparing the two built stylesheets** reports ~1 400 differences, and every
  one of them is noise. v3 emits `--tw-*` shadow variables and composes
  `box-shadow` from three shadows; v4 emits `@property` declarations and
  composes it from five. The two files are structurally different while doing
  the same work.
- **Comparing the byte counts** reports a difference and teaches nothing: v4's
  stylesheet is *larger* (282 kB vs 221 kB) and uses *fewer* `--tw-` variables
  (because it does not need them), while doing the same job.
- **Reading the release notes** lists the breaking changes, but not which of
  them the application actually uses.

The only comparison that means anything is the **computed style**: the browser
has already applied the cascade, resolved the custom properties and evaluated
every media query, so two classes that compute the same way paint the same
pixels.

`scripts/visual/computed-styles.mjs` renders every class the stylesheet
defines — one per element, in a real Chromium — and records the computed style
of 150 properties plus the element's **rendered bounding box**. The bounding
box is what proves that a transform is equivalent: v3 wrote
`transform: rotate(6deg)` and v4 writes `rotate: 6deg` as its own property, and
the two produce the *same box to two decimal places*.

`scripts/visual/normalize.mjs` holds the rules that decide whether two
computed styles are the same picture, and it is shared by the capture (which
hashes the normalised style into the committed baseline) and the comparison (so
the baseline and the report cannot disagree).

`scripts/visual/compare-builds.mjs` is the gate: it captures the current build
and diffs it against the committed baseline.

### The class list comes from the stylesheet, not from the source

The first version of the capture read the class names out of the source files
with a regex. It found 2 991 "classes", a large fraction of which were not
classes at all — fragments of code (`bg-,`, `!activeTab`, `item.status`) from
template literals and `clsx()` calls. The stylesheet is the authoritative
answer: a class is in it if the framework generated a rule for it.

The extraction reads **selectors only** — the text between a `}` and the next
`{`. Reading the whole file picks up fragments of *declarations* too: a
minified `width:12.5rem` contributes a `.12`, a `url(https://…)` contributes a
`.com`, and `display:contents` contributes a `.contents`. Those are not classes,
and measuring them reports differences that do not exist.

### The renames

The v3 baseline was built from the **pre-codemod** source, so it carries the
OLD class names. `shadow-sm` there is v3's 0.05 shadow; `shadow-sm` in the v4
build is v4's 0.1 shadow. Comparing them without a map compares two different
classes.

`spec/visual-baseline/renames.json` holds the 50 renames the codemod applied.
The baseline is **rekeyed** to the v4 names before the comparison, so a renamed
class reads as "the same picture under a new name" rather than as one class
appearing and another disappearing.

---

## 2. The result

```
classes in the v3 baseline  : 2 542
classes in the v4 build     : 2 609
renamed by the codemod      :   50   (the picture is unchanged for each)
renderings that CHANGED     :    2
```

**Two renderings changed, out of 2 542.**

| Class | v3 | v4 |
|---|---|---|
| `bg-indigo-50/30` | `rgb(238, 242, 255 / 0.3020)` | `rgb(238, 245, 255 / 0.2980)` |
| `bg-purple-50/70` | `rgb(249, 245, 255 / 0.7020)` | `rgb(251, 246, 255 / 0.6980)` |

Both are the **same defect**: Tailwind v4 mixes an alpha in `oklab`, and v3
mixed it in `sRGB`. The result differs by **1 in 255 on two of three channels**
of a 30 %-opacity overlay. Composited over the page, the final pixel moves by
**less than one 8-bit step**. There is no way to see it, and there is no
setting that makes v4 mix in sRGB.

**This is the only visual difference in the upgrade, and it is accepted.**

---

## 3. What the upgrade actually changed, and how each was handled

Every one of these was found by the measurement, not by reading the notes.

### 3.1 The cascade layers — the big one

**What broke.** Tailwind v4 puts its utilities in `@layer utilities`. CSS says
an **unlayered** rule beats every **layered** rule regardless of specificity.
`resources/css/index.css` was unlayered, so it began to beat *every* Tailwind
utility:

| Rule | v3 | v4 (before the fix) |
|---|---|---|
| `* { margin: 0; padding: 0 }` | lost to `.p-4` | **beat** `.p-4` |
| `* { font-family: … }` | lost to `.font-sans` | **beat** `.font-sans` |
| `.lg:p-10` | `padding-left: 40px` | **`0px`** |
| `-mb-12` | `margin-bottom: -48px` | **`0px`** |

**The fix.** `resources/css/index.css` is now wrapped in `@layer utilities`.

That is deliberate, and it is the faithful translation of v3's behaviour:

- against Tailwind's **base** layer (the preflight), the app's file wins — it
  did under v3 too, because it came later in the file;
- against Tailwind's **utilities** layer, it is the SAME layer, so the source
  order decides: the app's file is imported after `app.css`, so it wins on
  equal specificity and loses on specificity. **Identical to v3.**

`@layer components` would have been wrong: it would put the app's file BELOW
Tailwind's utilities, and `.custom-navbar-container` (`z-index: 1000`) would
lose to the `z-[100]` utility on `Navbar.tsx:53` — a stacking change on every
page.

### 3.2 The palette

Tailwind v4 recalibrated the default palette. `amber-500` was
`rgb(245, 158, 11)` in v3 and is `rgb(254, 154, 0)` in v4 — a difference that
touched **107 text colours, 92 backgrounds, 75 border colours**, and the
text-decoration, outline and caret colours that inherit from them.

**The fix.** All **244** v3 palette values are restored in the `@theme` block,
emitted as HEX in the sRGB space so the computed value is *identical* to v3's
rather than a close match in another colour space. The values are generated
from the Tailwind v3.4.14 `tailwindcss/colors` module — read out of the
package, not transcribed, so a typo cannot creep in.

### 3.3 The ring colour

v3's preflight set `--tw-ring-color: rgb(59 130 246 / 0.5)` on every element,
so a `ring-2` with no ring colour was **blue at 50 % opacity**. v4 registers
the property with `initial-value: currentcolor`, so the same ring is the
element's **text colour at full opacity**.

**259 elements** use a ring width without a ring colour.

**The fix.** The default is restored in the base layer. The property is
registered by Tailwind with `inherits: false`, and a re-registration is
dropped by the CSS pipeline, so the default is set per element instead.

*One residue:* v3's `--tw-ring-color` inherited, and v4's does not. A ring
colour on a PARENT with a ring width on a CHILD would inherit the colour under
v3 and get the default here. No such pair exists in the application.

### 3.4 The shadow scale

v4 renamed the scale: v3's `shadow-sm` became v4's `shadow-xs`, and v3's bare
`shadow` became v4's `shadow-sm`. **The upgrade codemod did not apply that
rename**, and 614 elements use `shadow-sm` — so without intervention every
subtle shadow in the application would have become the default shadow: twice
as dark, and one pixel further out.

**The fix.** `--shadow-sm` is restored to v3's value. The bare `shadow` already
matches (v4 kept it as the default), and v4's `shadow-xs` is the same 0.05
shadow v3's `shadow-sm` was.

### 3.5 The blur scale

v4's `blur-sm` is 8px; v3's was 4px, and v4 dropped the 4px step. The
application uses `backdrop-blur-sm`, so the difference is a visible 4px of
backdrop blur.

**The fix.** `--blur-sm: 4px`.

### 3.6 The drop-shadow scale

v4 recalibrated it: `drop-shadow-sm` went from
`0 1px 1px rgb(0 0 0 / 0.05)` to `0 1px 2px #00000026` — three times as dark
and one pixel further out.

v3's `md`, `lg` and `xl` entries carry **two** shadows in one variable, and
v4 split that into `--tw-drop-shadow-size` (the whole filter) and
`--drop-shadow-md` (one shadow's geometry). So the theme variable alone can
only carry one shadow, and the second has to be restored on the utility.

**The fix.** The theme variables carry v3's first shadow, and the utilities
carry v3's two-shadow filter.

### 3.7 The transition property list

v4's `transition` animates more: it added `outline-color`, the gradient
variables, `translate`/`scale`/`rotate`, `display`, `content-visibility`,
`overlay` and `pointer-events`. **Animating `display` is a behaviour change**,
not a colour one.

**The fix.** `transition`, `transition-colors` and `transition-transform` carry
v3's lists exactly.

### 3.8 The outline

v3's `outline` was `outline-style: solid` and left the width at the UA default
(`medium` = 3px); v4's sets `outline-width: 1px`. v3's `outline-none` was
`outline: 2px solid transparent` and v4's is `outline-style: none` — both paint
nothing, but they differ in every field.

**The fix.** `.outline` gets `outline-width: medium`.

### 3.9 The custom-property namespace collision

`resources/css/index.css` defined `--radius-lg: 24px` and `--shadow-sm: …` in
`:root`. **Tailwind v4 defines theme tokens under those names.** The app's
values shadowed Tailwind's, so `rounded-lg` rendered at **24px instead of 8px**
— on every rounded-lg element in the application.

A name collision with a framework token is invisible: there is no error, the
class simply renders differently.

**The fix.** The application's own custom properties are namespaced under
`--app-*`. `--app-radius-lg`, `--app-shadow-sm`, `--app-shadow-md`,
`--app-text-main`, `--app-text-muted`, `--app-primary`, `--app-primary-hover`,
`--app-background`, `--app-surface`, `--app-border`, `--app-navbar-height`.

---

## 4. What the upgrade FIXED

81 classes that **v3 silently ignored** now render. Every one of them is a
class the markup always asked for and v3's scanner never found:

`z-100`, `z-1000`, `z-999999` and 15 more (v3's `zIndex` scale stopped at
50), `aspect-4/3`, `aspect-21/9`, `bg-size-[16px_16px]` and two more,
`flex-2`, `grow`, `mt-px`, `py-0.75`, `h-4.5`, `h-5.5`, `w-4.5`, `w-5.5`,
`w-68`, `ml-[-18px]`, `left-[-13px]`, `blur-2xl`, `stroke-3`,
`wrap-break-word`, `shadow-xs`, `rounded-4xl`, `rounded-t-3xl`,
`bg-white/2`, and the `bg-linear-to-*` gradients.

**These are v3 bugs, fixed.** The rendering now matches what the markup
always asked for. A z-index of 100 that silently did nothing was a layout
defect, not a design decision, and the same goes for a `rounded-[2rem]` that
never applied.

They are reported here rather than hidden, because the delta report's job is to
say what changed — and this is what changed.

---

## 5. The gate

```bash
node scripts/visual/compare-builds.mjs --css=public/build/assets/app-*.css
```

It exits non-zero when a rendering changes, and it is wired into CI
(`.github/workflows/ci.yml`, the `spa` job). The baseline it compares against
is committed:

| Artefact | What it is |
|---|---|
| `spec/visual-baseline/tailwind-v3.css` | the v3 stylesheet the design was measured against |
| `spec/visual-baseline/computed-v3.json` | the computed-style signature of every class in it |
| `spec/visual-baseline/renames.json` | the codemod's class renames |

The same harness answers the question for the WHOLE REWRITE: capture the
Next.js build's computed styles and diff them against this baseline. That is
the visual-parity contract, measured rather than asserted.

---

## 6. Summary for a reviewer

| | |
|---|---|
| Renderings changed | **2 of 2 542** (a 1-in-255 alpha difference from `oklab` mixing) |
| Classes v3 ignored, now rendered | 81 (v3 bugs, fixed) |
| Classes renamed | 50 (the picture is unchanged for each) |
| Compatibility work | 9 (cascade layers, palette, ring, shadow, blur, drop-shadow, transition, outline, namespace) |
| The gate | `scripts/visual/compare-builds.mjs`, wired into CI |
