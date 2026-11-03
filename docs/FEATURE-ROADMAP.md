# Feature roadmap (post deep-audit pass, 2026-08)

Grounded feature additions identified during the 4-agent audit. Each item lists what exists, what was added, and what remains. Evidence references point at the pre-refactor audit findings.

## Shipped in this pass

### B2 - Unified escrow ledger view (SHIPPED)
- Backend: `GET /api/projects/{project}/finance-ledger` (`FinanceLedgerHandler` in `roadmap.go`): summary + every `project_budget_transactions` row via `renderLedgerRow`. Owner/PM/admin gated. Covered by `TestFinanceLedgerHandler`.
- Frontend wiring to `ProjectBudgetManager` statement tab remains (API ready).

### B7 - Role analytics endpoint (SHIPPED, minimal)
- Backend: `GET /api/me/analytics` (`AnalyticsHandler`): posted/hired/active/spent (via `clientHistories`) + `bids_placed` + `saved_searches`. Covered by `TestAnalyticsHandler`. Win-rate/response-time trends remain future.

### B8 - Saved searches (SHIPPED, API)
- Backend: `saved_searches` table (0025) + `GET/POST/DELETE /api/saved-searches` (`roadmap.go`). Covered by `TestSavedSearchesCRUD`. Explore hearts wiring remains.

### B11 - Budget statement export (SHIPPED, minimal)
- Backend: `GET /api/projects/{project}/reports/export?format=csv|pdf` (`ExportReportHandler`): BOM CSV + hand-rolled single-page PDF. Owner/admin gated. Covered by `TestExportReportCSVAndPDF`. Design-grade PDF + weekly digest remain via `mail_outbox`.

### B5 - Delivery confirmation loop (SHIPPED, API)
- Backend: `POST /api/material-orders/{id}/confirm-receipt` (`ConfirmOrderReceiptHandler`) + scheduler auto-complete (`delivered` > 3d → `completed`). Buyer/owner/admin gated, idempotent.

### B12 - Chat history pagination (SHIPPED)
- Backend: `ChatController::show` accepts `?before_id=` cursor, returns `{data, meta:{oldest_id, has_more}}`; also skips the no-op mark-read UPDATE on already-caught-up polls.
- Frontend: `useChat.loadEarlierMessages()` + `hasMoreHistory/isLoadingEarlier`; "Load earlier messages" chip in `MessageThread` and the compact overlay thread.

### B10 - Warranty claim completion (PARTIAL: notifications)
- SHIPPED: filing a claim now notifies the hired contractor (`ProjectWarrantyController::store`, type `warranty_claim`). Add a bell icon branch for this type in `NotificationsDropdown::getIcon` if desired (default icon shows today).
- PENDING: `cost_impact` has no UI; resolved claims lack owner verification notes; no SLA aging badges. Backend already stores cost_impact owner-only.

### B1 - Negotiation-cap escape (PARTIAL: UX fix)
- Finding: `confirmBidFee` never had a cap — accepting the standing offer ALWAYS worked even at 5/5 rounds. The deadlock was informational only.
- SHIPPED: cap rejection message now explicitly points both parties to "Agree on Fee" / decline actions.
- PENDING (optional polish): surface remaining rounds as `negotiation_count` badge + disable counter-offer input at 5 in `NegotiationOfferForm`.

## Pending backlog (specs)

### B2 - Unified escrow ledger view (M)
Shipped (API): `GET /api/projects/{project}/finance-ledger` — see above. Remaining: chronological union with termins/addendums/procurement + running balance + UI statement tab + CSV button (CSV lives at `reports/export`).

### B3 - Milestone-weighted progress % (M)
Add `project_milestones.weight` (default 1). Roll up weighted % per phase/project; feed into OverviewStats/PhaseTimeline instead of boolean counts.

### B4 - Procurement -> purchase bridge (M-L)
Link column `procurement_requests.material_order_id`; approved request pre-fills material quote/order; receipt auto-increments `quantity_on_site` via existing restock endpoint.

### B5 - Delivery confirmation loop (M)
Shipped (API): `POST /material-orders/{id}/confirm-receipt` + auto-complete — see above. Remaining: `confirmed_at` column, pickup/delivery notifications, transition guards.

### B6 - Notification preferences + digest (M-L)
`notification_preferences` table exists; `shouldPushForPool/Tx` respects mutes + ALWAYS_ON; push fan-out live via `webpush-go` (VAPID env-gated); digest mail via `mail_outbox` + scheduler. Remaining: preferences UI polish.

### B7 - Role analytics endpoints (M)
Shipped (minimal): `GET /me/analytics` — see above. Remaining: win-rate/response-time/earnings trends, spend-by-phase, PM counters.

### B8 - Server-side favorites & saved searches (M)
Shipped (API): `saved_searches` CRUD — see above. `favorites` CRUD predates. Remaining: wire hearts in Explore HouseCard (localStorage stays as optimistic cache).

### B9 - Review parity between parties (M)
Pros-review-owners (new polymorphic or `owner_ratings` table); make structural/mep/couriers reviewable by extending the role registry in `internal/domain/identity`; "both parties reviewed" nudge.

### B11 - PDF/CSV export & reporting (M-L)
Shipped (minimal): `GET /projects/{project}/reports/export?format=csv|pdf` — BOM CSV + hand-rolled PDF. Remaining: milestone progress report design, weekly digest via `mail_outbox`.

### Stretch
Snag-list SLA aging badges; KPR calculator widget on house details; account deletion/export (ProfileController).
