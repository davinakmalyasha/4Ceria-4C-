# Feature roadmap (post deep-audit pass, 2026-08)

Grounded feature additions identified during the 4-agent audit. Each item lists what exists, what was added, and what remains. Evidence references point at the pre-refactor audit findings.

## Shipped in this pass

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
New `GET /projects/{project}/finance-ledger`: chronological union of `project_budget_transactions`, `payment_termins`, addendums, procurement authorizations with running available balance (budget - ledger). UI: statement tab inside ProjectBudgetManager + CSV export.

### B3 - Milestone-weighted progress % (M)
Add `project_milestones.weight` (default 1). Roll up weighted % per phase/project; feed into OverviewStats/PhaseTimeline instead of boolean counts.

### B4 - Procurement -> purchase bridge (M-L)
Link column `procurement_requests.material_order_id`; approved request pre-fills material quote/order; receipt auto-increments `quantity_on_site` via existing restock endpoint.

### B5 - Delivery confirmation loop (M)
Buyer-side `POST /material-orders/{id}/confirm-receipt` after courier `delivered` (add `confirmed_at`); supplier/buyer notifications on pickup/delivery; delivery-job transition guards now exist server-side (Phase 0).

### B6 - Notification preferences + digest (M-L)
`notification_preferences(user_id, type, channels)` table; central `NotificationService` so ~20 existing create sites respect mutes; preferences UI; weekly digest mail via queue.

### B7 - Role analytics endpoints (M)
`GET /me/analytics`: pro win-rate/response time/earnings trend (bid tables + paid termins), owner spend-by-phase (budget ledger), PM pending-approval counters across projects. No schema changes.

### B8 - Server-side favorites & saved searches (M)
Tables: `favorites(user_id, favoritable_type, favoritable_id)`, `saved_searches(user_id, params json, alert_enabled)`. CRUD pairs + wire hearts in Explore HouseCard; localStorage hook stays as optimistic cache.

### B9 - Review parity between parties (M)
Pros-review-owners (new polymorphic or `owner_ratings` table); make structural/mep/couriers reviewable by extending the role map (config/bids.php makes this trivial); "both parties reviewed" nudge.

### B11 - PDF/CSV export & reporting (M-L)
Budget statement CSV, milestone progress report PDF (dompdf or reuse jsPDF client-side pattern from QuoteHistoryTab/FinalHandover), weekly digest mail. Endpoint shape: `GET /projects/{project}/reports/export?format=csv|pdf`.

### Stretch
Snag-list SLA aging badges; KPR calculator widget on house details; account deletion/export (ProfileController).
