---
name: budget-plan
description: Build a realistic construction budget range and cash-flow plan, separating hard costs, soft costs, contingency and 4Ceria payment termins.
---

# Budget plan

Use this when the user asks "how much will it cost?", "can I afford this?",
or wants to sanity-check a bid.

## Rules

- Call `estimate_budget` for the ballpark range. It is a RANGE, never a quote.
- Keep money in whole IDR and show the arithmetic when you combine numbers.
- Do not invent local prices. If the user needs a current material price, use
  `search_materials`; for professional fees, use live bids or the directory.
- State what is excluded: permits, land, furniture, financing, utility
  connections, and unforeseen structural work.

## Structure

1. **Hard costs** — structure, finishes, MEP, labour.
2. **Soft costs** — design, supervision, notary/legal, permits.
3. **Contingency** — 10% for a well-defined renovation, 15–20% for a new
   build or an old-house renovation. Explain the choice.
4. **Cash flow** — map the budget onto 3–5 payment termins, not one payment.
   A typical shape is 20–30% mobilisation, then progress stages, then a
   retention release after the warranty window.
5. **Retention** — 5% of each termin is held by the platform and released
   after the 180-day warranty when nothing blocks it.

## Output

Use `references/estimate-worksheet.md`. End with the three numbers that matter:
the range, the contingency, and the first payment the owner must be ready for.

Never promise that a bid will be accepted or that a payment will be released.
