# Backlog

Living list of deferred work. Statuses are updated as passes land; audit archives in `docs/audits/` keep history.

## Refinement tracks (2026-09 pass)
| Item | Status |
|---|---|
| D1 handover phantom `bids` relation | done |
| D2 real `walkthrough_status` column + `final_walkthrough_at` write | done |
| D3–D5 `markPaid` enum/amount/affordability overhaul | done |
| D6 budget dashboard fake fallbacks | done |
| D7 raw exception leak in budget 500s | done |
| D8 hardcoded 10% tax heuristic | done |
| D9 schedule delay cascade shifting | done |
| D10 dead `checkAndActivateBid` duplicate | done |
| B1 server-side favorites/wishlist | done |
| B2 Web Push (PWA `injectManifest`) | done (owner: paste VAPID trio into `.env`) |
| B3 PDF/CSV exports (ledger/payments/reports/admin) | done |
| B4 milestone-weighted progress % | done |
| B5 snag-list SLA aging + escalation command | done |
| C dispute/arbitration center | done |
| S1 payment-forgery chain closed (mint a payment stage, then self-verify it) | done |
| S2 proof gate + `refunded` terminal in `verifyProof`/`markPaid` | done |
| S3 escrow math unified in `ProjectFinancialService`; Add Funds now moves the ceiling | done |
| S4 affordability enforced on termin/addendum/material/design fee | done |
| S5 payment-referenced PARTIAL refunds (`refunded_amount`) | done |
| S6 change order mints exactly ONE payable stage (unique `change_order_id`) | done |
| S7 termination settlement: stages voided, fired pro cannot verify | done |
| S8 `markPaid` notifications + `payment_released` audit trail | done |
| S9 payment receipts moved to the private `railway` disk | done |
| S10 12 authz/IDOR/upload/enumeration fixes (daily-logs, sub-pros, requirement history, engineering-log delete, procurement binding, budget mass-assignment, CSV injection, evidence mimes, push SSRF, token revocation on suspend, quote self-pay, supplier email leak) | done |
| S11 CSP + security headers on the Vercel SPA origin; per-request token scoping; per-user draft keys | done |
| P1 maplibre off the dashboard chunk (−848 kB), duplicate CSS entry removed (−205 kB), 20+ hot indexes, `subProfessionals` eager load, dashboard double-fetch | done |
| Q1 6 live `ReferenceError`s (DailySiteLog, MaterialSwatchBoard, `Zap`, `isOwner`, `isContractor`, `onRefresh`) + `interior_approved_at` | done |
| Q2 TS type debt 184 → 96 (missing `Project`/`Bid`/`ProjectMilestone`/preset fields) | done |
| Q3 CI pipeline + `phpunit.xml` runs all 4 suites (was 1 of 3) + shared `DatabaseHarness` | done |
| Q4 production logging was being discarded; scheduler now `onOneServer` | done |
| N1 notification preferences, money/dispute types non-muteable | done |
| U1 DED → construction-brief → PBG gate UI (PBG 422'd forever; new-build handover was impossible) | done |
| U2 notification deep-links + ~25 new icon types; notary/supplier tabs now reachable | done |
| U3 server error messages reach the UI (`getApiErrorMessage`, 25 sites) | done |
| U4 favorites split-brain fixed (houses are server-backed) | done |

## Product ideas (not scheduled)
- **Payment gateway** (Midtrans/Xendit VA/QRIS) to replace manual proof-upload reconciliation; biggest trust upgrade available. **Prerequisite:** it must ship WITH hold/release ledger semantics or the SPK's escrow promise becomes a contractual mismatch. The dispute freeze must also cover the webhook path (a charge that clears while a dispute is open must not auto-apply).
- **KPR/mortgage calculator + affordability** on house listings (start with the deterministic Rp/m² widget — `house` has no income/DTI fields, and entering them is sensitive personal data under UU PDP).
- **Review parity**: professionals review owners (currently one-directional) + review reminders. The dormant `reliability_score` column on all 5 profile tables is the natural home.
- **Retention (potong) 5%**: `project_payment_termins.retention_amount` / `net_amount` columns exist and are never written — release at handover/SLF.
- **Payout ledger + platform fee**: the ledger records budget consumption, not who is owed; no pro has an earnings page and the platform has no revenue model.
- **RFI (request-for-information) workflow** — no table exists; `project_comments` is the closest host.
- **Real-time chat** — needs a group-room model (the current `Conversation` is pair-only); deprioritized.
- **Account deletion/export** (UU PDP self-service).
- **Referral program.**
- **Professional analytics dashboard** (profile views, bid win-rate, response time, earnings).
- **Warranty & maintenance reminder automation** beyond the 180-day window check.
- **e-Signature provider (PSrE)** for SPK enforceability (current: base64 image + snapshot).
- **WhatsApp Business notification channel** (market fit; app already records `whatsapp_order_id`).
- **Full refund accounting** beyond dispute-recorded ledger reversals (needs finance spec).

## Technical debt / quality
- Split `ProjectController` (3,183 non-blank LOC, 40+ methods) into per-domain controllers/services using `config/bids.php`.
- `npm run typecheck` ratchet: baselines in `scripts/typecheck-baseline.mjs` (run `node scripts/typecheck-baseline.mjs --update` to re-baseline; fails when new errors appear).
- Vite compression + PWA precache pruning (~4.7 MB precache).
- Feature-test breadth: only money-critical seams are covered (`tests/MoneyIntegrityTest.php`); add lifecycle/marketplace/admin coverage incrementally.
- Mobile fixed-width polish (CompareTool / PMGroupedApprovals / ChatOverlay noted in earlier audits).
- Index long-term: replace `whereJsonContains('published_bidding_roles')` with a pivot table for the discovery feed.
- `Project::$fillable` duplicate entries (`design_completed_at`, `requires_mep`) — harmless, clean up when touching.
