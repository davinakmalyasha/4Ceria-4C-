# ADR-0022: The post-parity money fix is a separate, signed-off change

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The rewrite has two requirements that collide in exactly one place.

**Requirement 1 — parity.** Every screen renders the same pixels, and (P-4) the same
**values**, as the current application.

**Requirement 2 — correctness.** `docs/CONVENTIONS.md:25` says the escrow arithmetic
lives *only* in `ProjectFinancialService` and must never be re-derived "in a controller,
model or **component**", because *"four divergent copies of this number shipped over
2026-08/09, and owners were shown a figure the server would not honour."*

And `ProjectBudgetManager.tsx:175-190` **does** re-derive it:

```ts
const initialBudget = Number(dashboardData.project_budget || project.budget || 0);
const deposits         = transactions.filter(t => t.transaction_type === 'deposit').reduce(…);
const manualReductions = transactions.filter(t => t.transaction_type === 'adjustment_down').reduce(…);
const realPayments     = transactions.filter(t => t.transaction_type === 'payment').reduce(…);
const actualAvailablePool = initialBudget + deposits - manualReductions;   // ← double-counts
const actualRemaining     = actualAvailablePool - realPayments;            // ← misses refunds/fees/retention
```

The server's rule is `available = ceiling − Σ(payment|refund|platform_fee|retention_release)`,
and `deposit`/`adjustment_down` have **already moved the ceiling column** — so the
client's `+ deposits` and `− manualReductions` count them a second time. The two
figures disagree whenever a deposit or an adjustment exists, and **the client figure is
the one the owner sees**.

`SummaryFinancials.tsx:13-19` has a second instance: it counts a termin as paid when
`status === 'paid'`, which is exactly what `MoneyFigureConsistencyTest:227` forbids on
the server — *"excludes a termin flipped to paid with no ledger row, rather than
trusting the status."*

So: fixing the client changes what the owner sees, and parity says it must not change.

## Decision

**The server returns both figures. The parity phase renders the legacy one. The
canonical one is rendered only after a separate, signed-off change.**

```jsonc
"escrow": {
  "currency": "IDR",
  "legacy": {
    "_doc": "Reproduces ProjectBudgetManager.tsx:175-190 EXACTLY. RENDERED DURING PARITY.",
    "initial_budget_minor":     50000000000,
    "deposits_minor":            5000000000,
    "manual_reductions_minor":   1000000000,
    "real_payments_minor":      12000000000,
    "active_sandbox_minor":      2500000000,
    "available_pool_minor":     49000000000,
    "available_minor":          37000000000,
    "simulated_remaining_minor":34500000000,
    "spent_percentage":         24.489795918367346,
    "simulated_percentage":     29.591836734693878,
    "is_deficit":               false
  },
  "canonical": {
    "_doc": "ProjectFinancialService's truth. NOT rendered during parity.",
    "ceiling_minor":            50000000000,
    "disbursed_minor":          12000000000,
    "available_minor":          38000000000,
    "simulated_remaining_minor":35500000000,
    "spent_percentage":         24,
    "is_deficit":               false
  }
}
```

**The precision rules are non-negotiable** — they are what make the numbers identical:

1. All money is **integer minor units**. Existing wire fields keep their current string
   form (`"500000000.00"`, unchanged, so the byte-comparison with the Laravel golden
   files is unaffected); new fields are **integers**.
2. `legacy.spent_percentage` is an **IEEE-754 double**, because the client today
   computes `(realPayments / actualAvailablePool) * 100` in JavaScript. The server
   evaluates the **exact same expression in the exact same order** and emits it with
   `serialize_precision=-1` (PHP's default — round-trip exact). The client then does
   `Math.min(serverValue, 100)`, which is a pure clamp, not arithmetic. *Proof:* IEEE-754
   division and multiplication are deterministic, PHP doubles are IEEE-754, and the JSON
   round-trip is exact — so the double the client receives is bit-identical to the
   double the client computes today. A unit test asserts
   `server_value === client_expression` over 1 000 randomised fixtures.
3. `summary.legacy.percentage` is an integer, computed with an explicit `floor(x + 0.5)`
   — which equals JavaScript's `Math.round` for non-negative values. Pinned over 10 000
   randomised non-negative pairs.

**The shim is fenced, so it can never silently become the truth:**

- it lives in its own `legacyEscrowPayload()` method with a `@deprecated` docblock;
- a CI check asserts it is consumed **only** by `web/src/lib/money/legacyEscrow.ts`;
- a Pest test asserts `legacy !== canonical` on a fixture containing a deposit.

**The post-parity change** swaps `legacyEscrow.ts` to read `canonical`, removes the
`legacy` block from the response, deletes `legacyEscrowPayload()`, and produces a
**delta report** enumerating every screen whose figure changes and by how much. It is
its own ADR, its own PR, and it is the change the owner actually wants to ship — it just
must not be smuggled into a parity commit.

**Two other client-side money issues are in the same category and are deferred with it:**

- The **4 competing currency formatters** and the **30 locale-less
  `.toLocaleString()`** call sites. Consolidating them changes the *output* of 29
  sites, so it is post-parity. The parity phase keeps a `money` module with **six named
  output profiles** that reproduce each current behaviour exactly, and the consolidation
  codemod runs afterwards, proving each profile's golden test still passes.
- The **`Math.round(pct/100 × total)` percentage allocations** in `TerminBuilder`,
  `ContractSignModal` and `ProjectPayments`. These are live previews computed on every
  keystroke; moving them to the server would add a round-trip per keystroke — a
  behavioural change. The parity phase keeps the client expression verbatim and the
  server additionally returns the authoritative `allocations` block, which the client
  ignores. Post-parity, the client renders the server's `Money::allocate()` result
  (largest-remainder, so the parts sum exactly) and the delta report quantifies the
  per-row sen differences.

## Consequences

### Positive

- **Parity is preserved exactly.** The owner sees the same figure during the rewrite
  that they see today.
- **The correct figure is available immediately.** The `canonical` block is in the
  response from day one, so the fix is a one-line client change plus a delta report —
  not a re-analysis.
- **The shim cannot rot into production.** Three separate mechanisms fence it.
- **The delta report is itself a portfolio artefact**: "here is the exact number the
  product was showing, here is the number it should have shown, here is the difference,
  and here is why the fix was not smuggled into the rewrite."

### Negative

- **The response carries two sets of figures**, which is redundant and confusing until
  the post-parity change removes the legacy block. The `_doc` fields make the intent
  explicit, and the block is removed on a known date (the post-parity ADR).
- **The `legacy` block is a second implementation of a formula we know is wrong.** It is
  a transitional shim by construction, and it is written to look like one.
- **Two `Money::allocate()` rounding rules coexist** — the client's `Math.round` and the
  server's largest-remainder — for the duration. They differ by at most 1 sen per row,
  and the delta report quantifies it.

### Neutral

- **The Laravel application also grows an `escrowPayload()`** in week 1 (additive, and
  the current SPA ignores unknown keys), so the legacy block is available during the
  transition and the two stacks return the same shape.
- **The post-parity change is the single most user-visible change in the entire
  rewrite.** It gets its own ADR, its own review, and its own release note.

## References

- `docs/MONEY.md` §7
- `docs/REWRITE-PLAN.md` §6.3
- `docs/CONVENTIONS.md:25` — the one-budget-formula rule
- `resources/js/components/Projects/ProjectBudgetManager.tsx:165-260`
- `resources/js/components/Projects/Phases/SummaryFinancials.tsx:8-25`
- `tests/MoneyFigureConsistencyTest.php:227` — the server-side rule the client breaks
- `app/Services/ProjectFinancialService.php` — the canonical implementation
