---
name: property-shortlist
description: Turn a property wish list into a ranked shortlist using live 4Ceria listings, with a comparison table and the questions to ask before a viewing.
---

# Property shortlist

Use this for "find me a house", "compare these listings", or "what can I get
for my budget?".

## Criteria first

Collect: city/kabupaten, budget band in IDR, bedrooms, bathrooms, land/floor
area if it matters, tenure (SHM/HGB), and must-haves (carport, garden, ready
to live, renovation project). If the user gives none, search broadly and ask
one clarifying question after showing the first results.

## Search

1. Call `search_houses` with city, price band and bedrooms.
2. Call `get_house` for the best 3–5 ids. Never describe a listing you did not
   retrieve.
3. If nothing matches, widen one criterion at a time and say which one.

## Compare

Use `references/comparison.md`. Rank by fit to the stated must-haves, then
price, then location. Keep prices exactly as returned. Do not estimate a
mortgage, taxes or renovation cost unless the user asks; if you do, label the
assumption and show the arithmetic.

## Before a viewing

Ask: certificate status, building permit, renovation history, flood/access
issues, what is included in the sale, and the monthly costs. Point the user at
the listing page to save or contact the seller.
