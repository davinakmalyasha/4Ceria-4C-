# Week 1 — the oracle, made correct, and the rewrite's instruments

**2026-10-20 → 2026-10-21**
**Scope:** `docs/REWRITE-PLAN.md` §13, days D1–D12.

This is the account of what changed, what was measured, and what the
instruments are. Every number here was produced by a command in this
repository, and every command is in `scripts/verify.php`.

---

## 1. The three false-green layers

The plan's first finding was that the repository's gates did not gate. All
three are closed.

| Layer | Was | Now |
|---|---|---|
| The CI's PHP job | `redis/redis-stack-action@v1` — **the repository does not exist** (HTTP 404). The job died at *action resolution*, before any project code ran, on every run since 2026-09-28. | A native `services: redis` image, every action pinned to a 40-hex commit SHA, every image pinned to a digest, and `scripts/ci/action-policy.sh` as a CI job that FAILS the build if a pin is ever removed. |
| The CI's schema job | Ran `schema:verify` against an **empty** database, with no `migrate` step. It could only ever fail, and it never meant anything. | Migrates first, verifies, then does a **full `migrate:reset` → `migrate` round-trip** and verifies again. |
| `composer verify` | Ran `"@php scripts/verify.ps1"`. Composer handed a PowerShell file to PHP, which found no `<?php` tag, echoed the whole file as text and **exited 0**. | `scripts/verify.php` — cross-platform, the same list CI runs, and it **fails**. |

`main` also had **no branch protection**. It does now: six required checks,
one approving review, linear history, no force-push, no branch deletion.

---

## 2. The nineteen defects

Every one was found by an audit, fixed in the legacy application (the oracle
must be right before it judges the port), and pinned by a test that fails when
the fix is reverted.

| | Defect | Severity |
|---|---|---|
| **B1** | `Project::selectedKontraktor` did not exist → `GET /api/admin/projects` returned **500** for every project. | Critical |
| **B2** | `Project::selectedArsitek()` joined `users.id` to an `arsiteks.id` — the relation **could never resolve**, and its shape was wrong too (`users` has `name`, the UI reads `nama`). | Critical |
| **B3** | Seven `accepted_*_bid` blocks read the bid relation **directly**, bypassing `visibleBids()` — so any authenticated user could read a rival's fee, pitch and **the contractor's own staff names**. | High |
| **B4** | The live ledger held **both spellings** of one model, so the unique index could not dedupe them and **Rp 5 500 000 was counted twice**. One project's escrow was understated by exactly that. | Critical |
| **B5** | `config/bids.php` declared `project_user_key` — a **user** id for the six roles whose column holds a **profile** id. It was also dead. | High |
| **B6** | 35 catch blocks echoed `$e->getMessage()` into a response — a `QueryException`'s message is the **full SQL with its bindings**. Four of them also took the HTTP status from `$e->getCode()`, which for a `QueryException` is the **SQLSTATE string** `'HY000'`. | High |
| **B7** | Six upload sites wrote to a hardcoded `'railway'` disk, so the private files were untestable and diverged from production. | High |
| **B8** | `isPrivatePath()` matched **one prefix** (`receipts/`), so the signed SPK contract, the KYC scan, the dispute evidence, the requirement image and the project document were all served from the **world-readable** disk. | High |
| **B9** | A **refunded** material order was not terminal, so a supplier could walk it back to `paid`. | Medium |
| **B10** | `TRUSTED_PROXIES=*` was accepted in **production** — the guard only caught "unset", and `*` parses to a non-empty list. Any client could rotate `X-Forwarded-For` and mint a fresh rate-limit bucket per request. | Medium |
| **B11** | The **owner's** counter-signature had no length bound and no format check, while the professional's had a 1.5 MB cap and an image regex — and the owner's signature is the half of the contract that binds the payment plan. | Medium |
| **B12** | The supplier named the **courier's** fee, with no tariff cap, while the sibling paths had one. | Medium |
| **B13** | The material listing's cache key hashed `$request->all()` on an **unauthenticated** route — an unbounded key space. | Medium |
| **B14** | `LocationPickerMap` hardcoded `fetch('/api/geocode/…')`, which resolves to the **SPA's own origin** in the standalone build. | Medium |
| **B15** | The module-level caches were never cleared on logout, so the next user of the device saw the previous user's project data. | Medium |
| **B16** | `useExploreHouses` called `setWishlist`, which **does not exist** — a `ReferenceError` on every heart click. | Low |
| **B17** | The **221-migration round-trip had never been executed**, and it was broken in **seven** places. | Critical |
| **B18** | The standalone build Vercel serves shipped **no Tailwind at all** — 15 kB, zero `--tw-` variables. | Critical |
| **B19** | `PayoutDestinationOwnershipTest` was **flaky**: its sentinel was a three-digit number, and the payload carries a dozen auto-increment ids. | High |

### The two that changed the schema

**B4 — the live double-count.** `project_budget_transactions.reference_model` held
both `'ProjectAddendum'` and `'App\Models\ProjectAddendum'` for the *same*
`(project, reference, type)`. The unique index could not see them as one, and
`paidTotalMoney()` — which sums every disbursement row — counted the payment
twice.

The fix is three layers, because the data had to be repaired *and* the class of
defect had to be closed:

1. `App\Support\LedgerReference` — one canonical spelling, and a model-level
   guard on `ProjectBudgetTransaction` that canonicalises on **every** save, so
   no code path can reintroduce a second spelling.
2. A migration that **voids** the duplicate rather than deleting it: the
   amount goes to zero, the original is preserved in `voided_original_amount`,
   and `voided_duplicate_of_id` points at the row that was kept. The ledger is
   an audit trail, and a row that was written is evidence that a write
   happened.
3. The duplicate detector, which grouped by the **raw** string and so could
   never see a cross-spelling pair. It now groups by the canonical form.

The escrow on project 14975 now reads **Rp 5 500 000**. It read Rp 11 000 000.

**B17 — the round-trip.** `migrate:reset` failed on the first of seven
broken `down()` methods: two dropped an index InnoDB had adopted as a foreign
key's backing store (MySQL error **1553**), one dropped a column a later
migration had already removed (**1091**), and one addressed a table a later
migration created and dropped again (**1146**). All 221 now roll back and
forward, and the round-trip is a CI gate.

**B18 — the build that shipped no stylesheet.** `resources/css/app.css` was a
separate Vite *entry*, and Vite emits no `<link>` for a CSS-only entry. The
standalone build therefore referenced a 15 kB stylesheet with **zero** utility
classes, and the 206 kB Tailwind bundle sat next to it, linked by nothing.
`vite.config.js:82-89` documented the cause and prescribed a fix that does not
work. The CSS is now imported by the JS entry, which is the only shape both
build modes agree on.

---

## 3. The Tailwind 4 upgrade, measured

ADR-0010 said: upgrade first, then capture the baseline. The upgrade was
**measured against the pre-upgrade build**, because "byte-identical" is a
requirement and not an intention.

The instrument is `scripts/visual/computed-styles.mjs`: it renders **every
class the stylesheet defines** — 2 542 of them — in a real Chromium, and
records 150 computed properties plus the element's **rendered bounding box**.
The bounding box is what proves a transform is equivalent: v3 wrote
`transform: rotate(6deg)` and v4 writes `rotate: 6deg` as its own property,
and the two produce the same box to two decimal places.

A textual diff of the two stylesheets reports ~1 400 differences and every one
is noise: v3 emits `--tw-*` shadow variables and composes `box-shadow` from
three shadows, v4 emits `@property` declarations and composes it from five.

**The result: 2 renderings changed out of 2 542**, both a one-in-255 alpha
difference because v4 mixes an alpha in `oklab` where v3 mixed it in `sRGB`.

Nine things had to be fixed for that to be true, and each was found by the
measurement rather than by reading the release notes:

| | What broke | How many elements |
|---|---|---|
| 1 | **The cascade layers.** v4 puts its utilities in `@layer utilities`, and an unlayered rule beats every layered one. The app's `index.css` was unlayered, so `* { margin: 0 }` began to beat `.p-4`. | 259 lost their padding |
| 2 | **The palette.** v4 recalibrated it: `amber-500` was `rgb(245, 158, 11)` and is `rgb(254, 154, 0)`. | 107 text, 92 background, 75 border |
| 3 | **The ring colour.** v3's preflight set `--tw-ring-color` to blue-500 at 50 %; v4's initial value is `currentcolor`. | 259 |
| 4 | **The shadow scale.** v4 renamed it, and the codemod did **not** apply the rename: 614 elements would have had their subtle shadow become the default one — twice as dark, one pixel further out. | 614 |
| 5 | **The blur scale.** v4's `blur-sm` is 8px; v3's was 4px, and v4 dropped the 4px step. | every `backdrop-blur-sm` |
| 6 | **The drop-shadow scale.** v3's `md`/`lg`/`xl` carried two shadows in one variable, and v4 split it in two. | 2 |
| 7 | **The transition property list.** v4 animates `display`, `pointer-events` and the gradient variables. | every `transition` |
| 8 | **The outline.** v3's `outline` left the width at the UA default; v4's sets 1px. | every `outline` |
| 9 | **The namespace collision.** The app's own `--radius-lg: 24px` **shadowed Tailwind v4's radius token**, so `rounded-lg` rendered at 24px instead of 8px. | every `rounded-lg` |

The app's own custom properties are now namespaced under `--app-*`, and the
gate is `scripts/visual/compare-builds.mjs`, wired into CI. The accepted
differences are **declared** in `spec/visual-baseline/accepted-differences.json`,
so a new one cannot slip through.

**81 classes that v3 silently ignored now render** — `z-100`, `aspect-4/3`,
`flex-2`, `mt-px`, `w-68`, `stroke-3` and the rest. Those are v3 bugs, fixed.

---

## 4. TypeScript 7, and the compatibility claim

TypeScript 7 ships **no programmatic API**, so the ecosystem still runs against
the TypeScript 6 API. Microsoft publishes a compatibility package for exactly
this, and the two compilers live side by side:

```json
"@typescript/native": "npm:typescript@7.0.2",          // the native binary
"typescript":         "npm:@typescript/typescript6@6.0.2" // the API one
```

Microsoft states that TypeScript 7 reports "the same errors, locations, and
messages" as 6.0. **That was measured, not believed**: 94 errors from each
compiler, and the two lists are **byte-identical**.

The ratchet only COUNTS errors, so a compiler that reported the same count
with different errors would pass it and hide a regression.
`scripts/ci/assert-ts-parity.mjs` compares the lists, line for line, and is
wired into CI.

The typecheck got **5.2× faster** (19.1 s → 3.7 s).

**And the ratchet was found to be a gate that checked nothing.** It invoked the
compiler through `execSync(process.execPath, …)`, and `process.execPath` is
`C:\Program Files\nodejs\node.exe` — the shell split it on the space, the
compiler never started, and the script counted **zero** errors and printed
`Typecheck OK: 0 errors (baseline 94)`. It now uses `execFileSync`, checks
that the compiler binary exists, and refuses to pass when the output contains
`Cannot find module`.

---

## 5. The money differential, and a real bug it found

`internal/domain/money` is the Go port of `App\Support\Money`. A port is only
faithful if it produces the same answers for the same inputs, and the rounding
rules are exactly where a port drifts — so the two implementations are run
over the **same 2 000-case corpus** and their outputs are diffed.

**The differential found a real bug in the legacy application.** The PHP's
`percentage()` multiplied the amount by the basis points in a PHP integer, and
an integer overflow **becomes a float**; `intdiv(float, int)` then threw a
`TypeError` from deep inside an escrow path. The Go port computes the product
in 128 bits and returns the right answer — so the two engines disagreed, and
the Go port would have been *more* capable than the thing it replaces.

The PHP now decomposes the multiplication, so the intermediate never
overflows and the result is exact, and it refuses only what genuinely cannot
be represented. **Every case that produces a number produces the same number
in both engines.**

The Go port also fixes a real rounding bug the corpus pinned: the PHP's
`intdiv($minor * $bp + 5000, 10000)` is biased for negative amounts, because
`intdiv` truncates toward zero and the offset can then round the **wrong way**
entirely. `-Rp 1.00` at 5 % gave `0` instead of `-Rp 0.05` — a one-sen
understatement on every negative percentage, and refunds are real movements.

---

## 6. The instruments the rest of the rewrite runs on

| Instrument | What it proves |
|---|---|
| `routing/routes.yaml` | The API surface, **generated** (`php artisan routes:export`). 296 routes, 300 method/URI pairs. |
| `tools/parity/routes.mjs` | That the manifest, the **Laravel** route table and the **Go** route table agree. It found four `PUT|PATCH` routes whose PATCH half the exporter had dropped, and the SPA catch-all, which is not an endpoint. |
| `spec/visual-baseline/` | The Tailwind v3 baseline: the stylesheet, the computed-style signature of every class, the codemod's renames, and the **declared** accepted differences. |
| `tools/money/corpus.json` | 2 000 fixed-seed cases for the money differential. |
| `db/postgres/migrations/` | The PostgreSQL 17 target: 8 migrations, 86 tables, 36 enum types, every one verified against the live MySQL. |
| `scripts/ci/suite-floor.json` | The rising floor: **628 tests / 2 343 assertions**, and it may only go up. |
| `scripts/ci/action-policy.sh` | That every action is a pinned SHA and every image a pinned digest. |

---

## 7. The numbers, and where they stand

| | Before | Now |
|---|---:|---:|
| Pest tests | 546 | **628** |
| Pest assertions | 2 144 | **2 343** |
| Vitest tests | 20 | **27** |
| `tsc` errors (the ratchet) | 96 | **94** |
| Migrations that roll back | 214 of 221 | **221 of 221** |
| API routes in the manifest | — | **296** (300 method/URI pairs) |
| Classes measured against the Tailwind baseline | — | **2 542** |
| Renderings changed by the Tailwind upgrade | — | **2** (both a 1-in-255 alpha mix) |
| Money differential cases | — | **2 000**, all agreeing |
| PostgreSQL tables | — | **86** (from 98) |

---

## 8. What is next

1. **The escrow domain in Go** — `internal/domain/escrow`, ported from
   `ProjectFinancialService` with the same invariants, and checked against the
   same corpus.
2. **The gateway** — `cmd/gateway`, the chi router that registers its handlers
   against `routing/routes.yaml`, plus `GET /internal/routes` so the parity
   gate can compare the third table.
3. **The golden files** — `php artisan contract:capture`, one per endpoint, so
   the Go responses can be compared byte for byte.
4. **The visual harness** — the screenshot half of the parity contract, against
   the baseline this week produced.
5. **The Next.js port** in `web/`, against the same baseline.

The oracle is correct, the gates are real, and the instruments exist. The
rewrite can start.
