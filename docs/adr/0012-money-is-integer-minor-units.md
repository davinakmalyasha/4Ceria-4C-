# ADR-0012: Money is integer minor units, end to end

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The current application stores money in `decimal(24,2)` columns and computes it in
`App\Support\Money` — a 575-line value object holding **integer minor units** (sen).
The `Money` docblock records why: float cannot represent `decimal(24,2)` exactly, and
the class exists because that failure was real.

But the discipline is not universal. Two live paths still compute money in `float`:

- **`app/Services/BidCalculationService.php:19-81`** — `(float) ($project->budget ?? 0)`,
  `($priceInput / 100) * $projectBudget`, then `(int) max(1, ceil($calculatedTotal))`.
  The result is written to `bids_*.calculated_total`, which becomes the payment amount
  in `ProjectBudgetController::markPaid`.
- **`app/Services/TerminPlanService.php`** — `assertPercentagesWithinWhole` accumulates
  percentages in a `float`.

And the Go port surfaces a **third** problem: `Money::percentage()` implements
half-away-from-zero as `intdiv($minor * $bp + 5000, 10000)`. `intdiv` truncates **toward
zero**, so the `+5000` offset can only push the result **up**. On a negative amount that
is the wrong direction, and once the product is small it rounds the wrong way entirely:
`-Rp 1.00` at 5 % gives `-Rp 0.04` instead of `-Rp 0.05`.

The client has its own version of the problem: `ProjectBudgetManager.tsx:175-190`
re-derives the escrow balance in JavaScript and diverges from the server in four ways
(it ignores `refund`, `platform_fee` and `retention_release` rows, and double-counts
deposits the server's ceiling already includes). `docs/CONVENTIONS.md:25` forbids
exactly this — *"four divergent copies of this number shipped over 2026-08/09, and owners
were shown a figure the server would not honour."*

## Decision

**Money is integer minor units (sen) everywhere: in memory, in the domain layer, and on
the wire for new fields. The database keeps `numeric(24,2)`.**

1. **Go: `int64` minor units**, in a `money.Amount` value type with a `Currency`.
   Arithmetic across mismatched currencies is an **error**, never a silent coercion.
2. **The database keeps `numeric(24,2)`** — exact base-10, `SUM()` over it is exact, and
   it stays human-readable in a SQL client, which the `Money` docblock cites as a
   reason for the current design.
3. **The PHP rounding bugs are fixed in the port.** Go uses
   `mulDivRoundHalfAwayFromZero` on 128-bit arithmetic (`math/bits`, overflow-checked)
   and `int64` basis points for percentage accumulation. The `percentage` function is
   **odd** (`f(-x) == -f(x)`) as a property-tested invariant — a one-sided rounding rule
   cannot satisfy it.
4. **New wire fields are integers** (minor units). Existing wire fields keep their
   current string form (`"500000000.00"`) unchanged, so the byte-comparison against the
   Laravel golden files is unaffected.
5. **The client never computes an escrow balance.** The server computes it and the
   client renders it — but during the parity phase the server returns **both** the
   legacy client formula and the canonical one, and the client renders the legacy one
   (ADR-0022).

## Consequences

### Positive

- **The type system enforces the invariant.** A `float` cannot be passed where an
  `Amount` is expected. The `BidCalculationService` float path cannot be re-created by
  accident.
- **The rounding rule becomes a property, not a hope.** `f(-x) == -f(x)` and
  `Σ allocate(...) == total` are fuzz-tested and table-tested.
- **The overflow question is answered.** `int64` minor units reaches ±9.22 × 10¹⁸ sen
  (±9.22 × 10¹⁶ IDR) — about four orders of magnitude beyond any plausible construction
  contract — and the intermediate `minor × basisPoints` product is computed on 128 bits
  so it cannot overflow before the division.
- **The `Money` differential test proves the two implementations agree** — 2 000
  randomised cases through the `money-diff` CI job.

### Negative

- **`numeric(24,2)` → `int64` conversion happens at the boundary**, in the repository
  layer, on every read. It is a string parse (exact, no float) and it is cached per
  query.
- **The legacy float path stays in the Laravel app** until the money slice is cut over.
  It is a known defect (defect B-series) and is fixed in the Laravel app first, in W1.
- **The four currency formatters in the client stay four** during the parity phase.
  Consolidating them changes the output of 29 locale-less call sites and therefore
  changes pixels — it is a post-parity change (ADR-0022).

### Neutral

- **`float64` remains available on `Amount` for presentation only**, and is documented
  as such. The client may use it to render; it may never feed it back into arithmetic.
- **The `Money` value object ports to ~400 lines of Go** — the single highest-ROI piece
  of the rewrite, because it is pure, has no dependencies and is already correct in its
  design.

## References

- `docs/MONEY.md`
- `app/Support/Money.php` — the value object being ported
- `docs/REWRITE-PLAN.md` §6
- `docs/adr/0022-the-post-parity-money-fix-is-separate.md`
- `docs/CONVENTIONS.md:25` — the one-budget-formula rule
