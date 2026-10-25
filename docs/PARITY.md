<!--
  GENERATED FILE — DO NOT EDIT BY HAND.

  Regenerate:  node tools/parity/matrix.mjs
  Verify:      node tools/parity/matrix.mjs --check

  A hand-edit to this file is a CI failure. Every row is derived:

    routing/routes.yaml            the endpoint set, its tier and upstream
    spec/contracts/laravel/**      whether a golden file exists, and its rows
    docs/MONEY.md §11              the money invariants
    internal/domain/escrow/*_test.go + db/postgres/tests/*.sql
                                   which invariants a test NAMES
-->

# Parity Matrix

**The live answer to "is the rewrite done?"** — per endpoint: which tier it is at,
which upstream serves it, and what verified it.

> **Legend — Parity**
> `—` not started · `◐` ported, not yet cut over · `●` cut over, verified
>
> **Legend — Upstream** `laravel` the legacy stack · `go` the new stack
>
> **Legend — Verified by**
> `routes` route-set equality · `mw` middleware parity ·
> `gold` golden-file contract · `side` side-effect rows

---

## Summary

| | Count |
|---|---|
| **Routes** | **296** |
| **Endpoints (method × path)** | **300** |
| Cut over to Go | 0 |
| With a recorded contract | 300 |
| …that also records side-effect rows | 112 |
| Tier 1 — byte-identical | 77 |
| Tier 2 — shape-identical | 180 |
| Tier 3 — compatible | 43 |

The contract capture has recorded all 300 endpoints; the Go handlers
are declared and answering `501`, so **0 are cut over**. "Ported" is not
claimed until a Go response matches its golden file.

---

## Endpoints

| Method | Path | Tier | Upstream | Verified by |
|---|---|---|---|---|
| `GET` | `/api/admin/disputes` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/admin/disputes/{dispute}` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/admin/disputes/{dispute}/act` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/admin/disputes/{dispute}/messages/{message}/evidence` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/admin/disputes/{dispute}/reply` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/admin/houses` | 1 | laravel | routes · mw · gold |
| `PATCH` | `/api/admin/houses/{id}/suspend` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/admin/professionals` | 1 | laravel | routes · mw · gold |
| `PATCH` | `/api/admin/professionals/{type}/{id}/status` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/admin/professionals/history` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/admin/projects` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/admin/projects/{project}/force-terminate` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/admin/projects/export` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/admin/stats` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/admin/users` | 1 | laravel | routes · mw · gold |
| `PATCH` | `/api/admin/users/{user}/role` | 1 | laravel | routes · mw · gold |
| `PATCH` | `/api/admin/users/{user}/suspend` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/arsitek` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/brief/{token}` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/consultations` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/consultations` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/consultations/{consultation}/respond` | 3 | laravel | routes · mw · gold · side |
| `GET` | `/api/contractor-subspecialties` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/conversations` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/conversations` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/conversations/{conversation}` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/conversations/{conversation}/messages` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/delivery-jobs` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/favorites` | 2 | laravel | routes · mw · gold |
| `DELETE` | `/api/favorites/{favorite}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/favorites/merge` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/favorites/toggle` | 2 | laravel | routes · mw · gold |
| `DELETE` | `/api/firm-members/{firmMember}` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/firm-members/{firmMember}/cancel` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/firm-members/{firmMember}/respond` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/firm-members/browse-owners` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/firm-members/invitations` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/firm-members/invite` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/firm-members/my-firms` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/firm-members/profile/{ownerId}` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/firm-members/quick-assign` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/firm-members/request-join` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/firm-members/roster` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/firm-members/search` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/firm-members/suggestions` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/firm-members/update-profile` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/forgot-password` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/geocode/reverse` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/geocode/search` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/hire-history` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/houses` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/houses` | 3 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/houses/{house}` | 3 | laravel | routes · mw · gold · side |
| `GET` | `/api/houses/{house}` | 3 | laravel | routes · mw · gold · side |
| `PATCH` | `/api/houses/{house}` | 3 | laravel | routes · mw · gold |
| `PUT` | `/api/houses/{house}` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/houses/{house}/questions` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/houses/{house}/questions` | 3 | laravel | routes · mw · gold · side |
| `POST` | `/api/houses/{house}/rooms` | 3 | laravel | routes · mw · gold · side |
| `GET` | `/api/interior` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/kontraktor` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/login` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/logistics/available-jobs` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/logistics/dashboard-stats` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/logistics/jobs/{id}/accept` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/logistics/jobs/{id}/status` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/logistics/my-jobs` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/logout` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/marketplace/materials` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/marketplace/suppliers` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/marketplace/suppliers/{id}` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/material-order-reviews` | 2 | laravel | routes · mw · gold |
| `DELETE` | `/api/material-order-reviews/{material_order_review}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/material-order-reviews/{material_order_review}` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/material-orders` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/material-orders/{material_order}` | 1 | laravel | routes · mw · gold |
| `PATCH` | `/api/material-orders/{material_order}` | 1 | laravel | routes · mw · gold |
| `PUT` | `/api/material-orders/{material_order}` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/material-orders/{material_order}/payment-proof` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/material-orders/{material_order}/verify-payment` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/material-quotes` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/material-quotes` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/material-quotes/{quote}/approve` | 1 | laravel | routes · mw · gold |
| `PUT` | `/api/material-quotes/{quote}/mark-paid` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/material-quotes/{quote}/payment-proof` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/material-quotes/{quote}/post-delivery-job` | 1 | laravel | routes · mw · gold · side |
| `PUT` | `/api/material-quotes/{quote}/request-payment` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/me` | 2 | laravel | routes · mw · gold |
| `PUT` | `/api/me` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/me/avatar` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/me/avatar` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/me/professional` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/me/unread-summary` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/mep-engineers` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/merchant/materials` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/merchant/materials` | 1 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/merchant/materials/{material}` | 1 | laravel | routes · mw · gold · side |
| `PATCH` | `/api/merchant/materials/{material}` | 1 | laravel | routes · mw · gold · side |
| `PUT` | `/api/merchant/materials/{material}` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/merchant/profile` | 1 | laravel | routes · mw · gold |
| `PUT` | `/api/merchant/profile` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/my-bids` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/notaris` | 3 | laravel | routes · mw · gold |
| `DELETE` | `/api/notification-preferences` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/notification-preferences` | 3 | laravel | routes · mw · gold |
| `PUT` | `/api/notification-preferences` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/notifications` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/notifications/{notification}/read` | 3 | laravel | routes · mw · gold · side |
| `POST` | `/api/notifications/read-all` | 3 | laravel | routes · mw · gold · side |
| `GET` | `/api/portfolios` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/portfolios` | 3 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/portfolios/{id}` | 3 | laravel | routes · mw · gold · side |
| `POST` | `/api/portfolios/{id}` | 3 | laravel | routes · mw · gold · side |
| `GET` | `/api/project-manager` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/projects` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}` | 2 | laravel | routes · mw · gold |
| `PATCH` | `/api/projects/{project}` | 2 | laravel | routes · mw · gold |
| `PUT` | `/api/projects/{project}` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/accept-bid` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/activity` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/addendums/{addendum}/approve` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/addendums/{addendum}/reject` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/approve-construction-brief` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/approve-engineering` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/approve-engineering-hire/{addendum}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/approve-planning` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/authorize-phase` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/authorize-specialist` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/bast` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/bids` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/bids` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/bids/{bid}/accept-invite` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/bids/{bid}/client-sign-contract` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/bids/{bid}/confirm-fee` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/bids/{bid}/negotiate` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/bids/{bid}/reject-invite` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/bids/{bid}/sign-contract` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/broadcast-phase` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/budget` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/budget/addendums` | 1 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/budget/addendums/{id}` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/budget/mark-paid` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/budget/sandbox` | 1 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/budget/sandbox/{id}` | 1 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/budget/sandbox/{id}` | 1 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/budget/sandbox/{id}/update` | 1 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/budget/transactions` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/change-orders` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/change-orders` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/change-orders/{changeOrder}/owner-decide` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/change-orders/{changeOrder}/pm-review` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/comments` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/comments` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/comments/{comment}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/comments/{comment}` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/daily-logs` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/daily-logs` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/daily-logs/{dailyLog}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/decline-bid` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/delays` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/disputes` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/disputes` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/disputes/{dispute}` | 1 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/disputes/{dispute}/messages/{message}/evidence` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/disputes/{dispute}/reply` | 1 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/disputes/{dispute}/withdraw` | 1 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/documents` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/documents` | 2 | laravel | routes · mw · gold |
| `DELETE` | `/api/projects/{project}/documents/{document}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/documents/{document}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/documents/{document}/verify` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/documents/approve-design` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/documents/revise-design` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/documents/submit-design` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/engineering-logs` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/engineering-logs/{milestone}` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/extensions` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/extensions` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/extensions/{extension}/owner-decide` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/extensions/{extension}/pm-review` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/handover/approve` | 1 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/handover/reject` | 1 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/import-external-vendor` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/initiate-walkthrough` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/invite` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/kickoff` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/legal-financials` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/lock-brief` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/mark-complete` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/material-folders` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/material-folders` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/material-folders/{folder}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/material-folders/{folder}` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/milestones` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/milestones` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/milestones/{milestone}` | 2 | laravel | routes · mw · gold |
| `PUT` | `/api/projects/{project}/milestones/{milestone}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/milestones/{milestone}/approve` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/mutual-termination` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/mutual-termination/{termination}/escalate` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/mutual-termination/{termination}/respond` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/mutual-termination/initiate` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/owner-accept` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/payment-termins` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/payment-termins` | 2 | laravel | routes · mw · gold |
| `DELETE` | `/api/projects/{project}/payment-termins/{termin}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/payment-termins/{termin}` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/payment-termins/{termin}/link-milestone` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/payment-termins/{termin}/unlink-milestone` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/payments/{type}/{id}/upload-proof` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/payments/{type}/{id}/verify-proof` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/pm-bids` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/pm-bids/{bid}/accept` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/pm-bids/{bid}/decline` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/pm-bids/{bid}/shortlist` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/procurement-requests` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/procurement-requests/{procurementRequest}/reject` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/procurement-requests/{procurementRequest}/verify` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/propose-fee` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/reject-engineering-bid/{bidId}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/reject-engineering-hire/{addendum}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/reject-planning` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/reject-specialist` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/reports` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/reports` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/reports/{report}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/reports/{report}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/request-engineering` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/requirements` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/requirements` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/requirements-history` | 2 | laravel | routes · mw · gold |
| `DELETE` | `/api/projects/{project}/requirements/{requirement}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/requirements/{requirement}` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/requirements/{requirement}/history` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/requirements/{requirement}/request-procurement` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/requirements/{requirement}/restock` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/requirements/{requirement}/usage` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/requirements/{requirement}/use` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/resign` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/review` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/revise-construction-brief` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/schedules` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/schedules/{schedule}` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/seal-construction` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/seal-design` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/seal-interior` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/seal-legal` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/share-token` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/share-token` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/shortlist-bid` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/snag-items` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/snag-items` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/snag-items/{snagItem}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/snag-items/{snagItem}/accept` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/sticky-notes` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/sticky-notes` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/sticky-notes/{stickyNote}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/projects/{project}/sticky-notes/{stickyNote}` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/projects/{project}/sub-professionals` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/sub-professionals` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/projects/{project}/sub-professionals/{id}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/sub-professionals/{id}/accept` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/sub-professionals/{id}/decline` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/sub-professionals/{id}/hire` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/sub-professionals/{id}/interview` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/sub-professionals/{id}/recommend` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/sub-professionals/shortlist-bid/{role}/{bidId}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/submit-engineering-interview` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/submit-planning` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/technical-audit-submit` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/terminate` | 1 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/update` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/update-planning-audit` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/verify-engineering/{addendum}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/projects/{project}/verify-legal` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/verify-payment` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/verify-pbg` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/verify-planning-pm` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/verify-slf` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/projects/{project}/warranty-claims` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/projects/{project}/warranty-claims` | 2 | laravel | routes · mw · gold |
| `PUT` | `/api/projects/{project}/warranty-claims/{claim}/status` | 2 | laravel | routes · mw · gold · side |
| `GET` | `/api/push/public-key` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/push/subscribe` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/push/unsubscribe` | 3 | laravel | routes · mw · gold |
| `POST` | `/api/questions/{question}/answers` | 3 | laravel | routes · mw · gold · side |
| `POST` | `/api/register` | 1 | laravel | routes · mw · gold |
| `POST` | `/api/reset-password` | 1 | laravel | routes · mw · gold |
| `DELETE` | `/api/rooms/{room}` | 3 | laravel | routes · mw · gold · side |
| `GET` | `/api/structural-engineers` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/suppliers/{supplier}/reviews` | 3 | laravel | routes · mw · gold |
| `GET` | `/api/team-members` | 2 | laravel | routes · mw · gold |
| `POST` | `/api/team-members` | 2 | laravel | routes · mw · gold · side |
| `DELETE` | `/api/team-members/{id}` | 2 | laravel | routes · mw · gold · side |
| `PUT` | `/api/team-members/{id}` | 2 | laravel | routes · mw · gold · side |
| `POST` | `/api/upload` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/user/active-projects` | 2 | laravel | routes · mw · gold |
| `GET` | `/api/verifications/documents/{type}/{id}/{field}` | 1 | laravel | routes · mw · gold |

---

## Screens

Captured by `node tools/visual/capture.mjs` from the legacy application and compared
by `node tools/visual/compare-screens.mjs` (ADR-0021).

| Screen | Baseline | Role | Path |
|---|---|---|---|
| `admin.route.admin` | `spec/visual-baseline/screens/admin.route.admin.png` | admin | `/admin` |
| `admin.route.admin-disputes` | `spec/visual-baseline/screens/admin.route.admin-disputes.png` | admin | `/admin/disputes` |
| `admin.route.admin-houses` | `spec/visual-baseline/screens/admin.route.admin-houses.png` | admin | `/admin/houses` |
| `admin.route.admin-projects` | `spec/visual-baseline/screens/admin.route.admin-projects.png` | admin | `/admin/projects` |
| `admin.route.admin-verification` | `spec/visual-baseline/screens/admin.route.admin-verification.png` | admin | `/admin/verification` |
| `admin.route.admin-verification-logs` | `spec/visual-baseline/screens/admin.route.admin-verification-logs.png` | admin | `/admin/verification/logs` |
| `arsitek.tab.dashboardfind-engineers` | `spec/visual-baseline/screens/arsitek.tab.dashboardfind-engineers.png` | arsitek | `/dashboard?tab=find-engineers` |
| `arsitek.tab.dashboardmanagement` | `spec/visual-baseline/screens/arsitek.tab.dashboardmanagement.png` | arsitek | `/dashboard?tab=management` |
| `arsitek.tab.dashboardmy-bids` | `spec/visual-baseline/screens/arsitek.tab.dashboardmy-bids.png` | arsitek | `/dashboard?tab=my-bids` |
| `arsitek.tab.dashboardmy-firm` | `spec/visual-baseline/screens/arsitek.tab.dashboardmy-firm.png` | arsitek | `/dashboard?tab=my-firm` |
| `arsitek.tab.dashboardoverview` | `spec/visual-baseline/screens/arsitek.tab.dashboardoverview.png` | arsitek | `/dashboard?tab=overview` |
| `arsitek.tab.dashboardprojects` | `spec/visual-baseline/screens/arsitek.tab.dashboardprojects.png` | arsitek | `/dashboard?tab=projects` |
| `guest.route.forgot-password` | `spec/visual-baseline/screens/guest.route.forgot-password.png` | guest | `/forgot-password` |
| `guest.route.help` | `spec/visual-baseline/screens/guest.route.help.png` | guest | `/help` |
| `guest.route.login` | `spec/visual-baseline/screens/guest.route.login.png` | guest | `/login` |
| `guest.route.pro-register` | `spec/visual-baseline/screens/guest.route.pro-register.png` | guest | `/pro/register` |
| `guest.route.register` | `spec/visual-baseline/screens/guest.route.register.png` | guest | `/register` |
| `guest.route.root` | `spec/visual-baseline/screens/guest.route.root.png` | guest | `/` |
| `guest.tab.dashboardarchitects` | `spec/visual-baseline/screens/guest.tab.dashboardarchitects.png` | guest | `/dashboard?tab=architects` |
| `guest.tab.dashboardconstructors` | `spec/visual-baseline/screens/guest.tab.dashboardconstructors.png` | guest | `/dashboard?tab=constructors` |
| `guest.tab.dashboardhouses` | `spec/visual-baseline/screens/guest.tab.dashboardhouses.png` | guest | `/dashboard?tab=houses` |
| `guest.tab.dashboardinterior` | `spec/visual-baseline/screens/guest.tab.dashboardinterior.png` | guest | `/dashboard?tab=interior` |
| `guest.tab.dashboardmarketplace-furniture` | `spec/visual-baseline/screens/guest.tab.dashboardmarketplace-furniture.png` | guest | `/dashboard?tab=marketplace-furniture` |
| `guest.tab.dashboardmarketplace-materials` | `spec/visual-baseline/screens/guest.tab.dashboardmarketplace-materials.png` | guest | `/dashboard?tab=marketplace-materials` |
| `guest.tab.dashboardnotaris` | `spec/visual-baseline/screens/guest.tab.dashboardnotaris.png` | guest | `/dashboard?tab=notaris` |
| `guest.tab.dashboardproject-manager` | `spec/visual-baseline/screens/guest.tab.dashboardproject-manager.png` | guest | `/dashboard?tab=project_manager` |
| `kontraktor.tab.dashboardfind-sub-contractors` | `spec/visual-baseline/screens/kontraktor.tab.dashboardfind-sub-contractors.png` | kontraktor | `/dashboard?tab=find-sub-contractors` |
| `kontraktor.tab.dashboardmanagement` | `spec/visual-baseline/screens/kontraktor.tab.dashboardmanagement.png` | kontraktor | `/dashboard?tab=management` |
| `kontraktor.tab.dashboardmarketplace` | `spec/visual-baseline/screens/kontraktor.tab.dashboardmarketplace.png` | kontraktor | `/dashboard?tab=marketplace` |
| `kontraktor.tab.dashboardmy-bids` | `spec/visual-baseline/screens/kontraktor.tab.dashboardmy-bids.png` | kontraktor | `/dashboard?tab=my-bids` |
| `kontraktor.tab.dashboardmy-firm` | `spec/visual-baseline/screens/kontraktor.tab.dashboardmy-firm.png` | kontraktor | `/dashboard?tab=my-firm` |
| `kontraktor.tab.dashboardoverview` | `spec/visual-baseline/screens/kontraktor.tab.dashboardoverview.png` | kontraktor | `/dashboard?tab=overview` |
| `kontraktor.tab.dashboardprojects` | `spec/visual-baseline/screens/kontraktor.tab.dashboardprojects.png` | kontraktor | `/dashboard?tab=projects` |
| `structural.tab.dashboardmanagement` | `spec/visual-baseline/screens/structural.tab.dashboardmanagement.png` | structural | `/dashboard?tab=management` |
| `structural.tab.dashboardmy-bids` | `spec/visual-baseline/screens/structural.tab.dashboardmy-bids.png` | structural | `/dashboard?tab=my-bids` |
| `structural.tab.dashboardmy-firms` | `spec/visual-baseline/screens/structural.tab.dashboardmy-firms.png` | structural | `/dashboard?tab=my-firms` |
| `structural.tab.dashboardoverview` | `spec/visual-baseline/screens/structural.tab.dashboardoverview.png` | structural | `/dashboard?tab=overview` |
| `structural.tab.dashboardprojects` | `spec/visual-baseline/screens/structural.tab.dashboardprojects.png` | structural | `/dashboard?tab=projects` |
| `user.tab.dashboardarchitects` | `spec/visual-baseline/screens/user.tab.dashboardarchitects.png` | user | `/dashboard?tab=architects` |
| `user.tab.dashboardconstructors` | `spec/visual-baseline/screens/user.tab.dashboardconstructors.png` | user | `/dashboard?tab=constructors` |
| `user.tab.dashboardhire-history` | `spec/visual-baseline/screens/user.tab.dashboardhire-history.png` | user | `/dashboard?tab=hire-history` |
| `user.tab.dashboardhouses` | `spec/visual-baseline/screens/user.tab.dashboardhouses.png` | user | `/dashboard?tab=houses` |
| `user.tab.dashboardinterior` | `spec/visual-baseline/screens/user.tab.dashboardinterior.png` | user | `/dashboard?tab=interior` |
| `user.tab.dashboardmarketplace-furniture` | `spec/visual-baseline/screens/user.tab.dashboardmarketplace-furniture.png` | user | `/dashboard?tab=marketplace-furniture` |
| `user.tab.dashboardmarketplace-materials` | `spec/visual-baseline/screens/user.tab.dashboardmarketplace-materials.png` | user | `/dashboard?tab=marketplace-materials` |
| `user.tab.dashboardmaterial-orders` | `spec/visual-baseline/screens/user.tab.dashboardmaterial-orders.png` | user | `/dashboard?tab=material-orders` |
| `user.tab.dashboardmy-houses` | `spec/visual-baseline/screens/user.tab.dashboardmy-houses.png` | user | `/dashboard?tab=my-houses` |
| `user.tab.dashboardnotaris` | `spec/visual-baseline/screens/user.tab.dashboardnotaris.png` | user | `/dashboard?tab=notaris` |
| `user.tab.dashboardoverview` | `spec/visual-baseline/screens/user.tab.dashboardoverview.png` | user | `/dashboard?tab=overview` |
| `user.tab.dashboardproject-manager` | `spec/visual-baseline/screens/user.tab.dashboardproject-manager.png` | user | `/dashboard?tab=project_manager` |
| `user.tab.dashboardprojects` | `spec/visual-baseline/screens/user.tab.dashboardprojects.png` | user | `/dashboard?tab=projects` |

Captured from the legacy application at 2026-01-01T00:00:00.000Z with the browser clock
pinned, in a 1440x900 viewport. Coverage is
representative: every distinct nav shape, not every role.

- **skipped** `/brief/:token`: needs a fixture parameter (a share token, a reset token) that the seed does not carry

- **skipped** `/reset-password/:token`: needs a fixture parameter (a share token, a reset token) that the seed does not carry

- **skipped** (supplier): no supplier user in the seed — its four tabs have no data to render

- **skipped** (logistics): no logistics user in the seed — its three tabs have no data to render

---

## The invariants

Every row is a MONEY.md §11 invariant. The **Named by** column is read from the
test sources: an invariant counts as covered only when a test NAMES it, and the
gap list is therefore the parity-risk list.

| # | Invariant | Named by |
|---|---|---|
| I1 | `DISBURSEMENT_TYPES` is exactly `{payment, refund, platform_fee, retention_release}` | Go + SQL |
| I2 | `CEILING_NEUTRAL_TYPES` = the same four; they spend but do not move the ceiling | Go + SQL |
| I3 | `PROFESSIONAL_EARNINGS_TYPES` = `{payment, refund, retention_release}` — excludes `platform_fee` | Go |
| I4 | `available = ceiling − Σ(DISBURSEMENT_TYPES)` | Go |
| I5 | Only `deposit` and `adjustment_down` move the ceiling | SQL |
| I6 | A `deposit` is never limited by the current balance | SQL |
| I7 | The opening budget's ledger row is written **directly**, not through `deductBudget` | — **uncovered** |
| I8 | `projects.budget` may not be written through `PUT /projects/{id}` | — **uncovered** |
| I9 | `summary()` returns the float keys, the `*_cents` keys and the `*_display` strings | — **uncovered** |
| I10 | `committed` does **not** reduce `available` | Go |
| I11 | Exactly one ledger row per `(project, reference, type)` | SQL |
| I12 | The dedupe key includes `transaction_type`, so a fee may share a payment's reference | SQL |
| I13 | The reference is **normalised** before writing | — **uncovered** |
| I14 | A unique violation is an **idempotent success**, not a 500 | Go + SQL |
| I15 | The project row is locked **before** the affordability check | — **uncovered** |
| I16 | Every ledger row records `actor_user_id` and `actor_role`; NULL is a *system* movement | SQL |
| I17 | A `refund` with no actor is an invariant violation; a `payment` with no actor is only informational | — **uncovered** |
| I18 | `recordPayment()`'s return value is checked by every caller | — **uncovered** |
| I19 | `transaction_type` is a closed set of 6 | Go |
| I20 | `retention_amount + net_amount === amount` exactly | Go |
| I21 | The percentage is configurable; the remainder goes to `net` | Go |
| I22 | `forTermin()` **reads** the persisted split | Go |
| I23 | Legacy rows (`net = 0`, `retention = 0`) pay the gross | Go |
| I24 | A **half-written** split holds back the recorded retention | Go |
| I25 | The termin payment debits the **net** | — **uncovered** |
| I26 | The release uses `retention_release`, never `payment` | SQL |
| I27 | The release is blocked by a claim in `open` or `fixing` | — **uncovered** |
| I28 | The release is **idempotent** | — **uncovered** |
| I29 | The warranty window is read from `projects.warranty_end_at` | — **uncovered** |
| I30 | A zero-retention stage is never released | — **uncovered** |
| I31 | The split is filled **on insert** | — **uncovered** |
| I32 | `retention_released_at` / `retention_released_amount` exist | — **uncovered** |
| I33 | The fee is a **separate** row sharing the payment's reference | Go |
| I34 | The fee is **0 %** by default | Go |
| I35 | The fee is clamped to `[0, 100]` | Go |
| I36 | The fee is charged only when the payment was written | Go |
| I37 | A fee that cannot be recorded does not fail the payment | Go |
| I38 | `assertNoOpenDispute()` is the single freeze gate; it raises 422 | Go |
| I39 | One open dispute per project (409) | — **uncovered** |
| I40 | A refund is **negative** and referenced by the **dispute** | SQL |
| I41 | `refunded_amount` equals the sum of the refund reversals | — **uncovered** |
| I42 | A refund cannot exceed the gross paid | — **uncovered** |
| I43 | `paid` / `refunded` are terminal on every payment object | — **uncovered** |
| I44 | The `Hire` rule requires all four of: role held, profile exists, project column non-null, ids match | — **uncovered** |
| I45 | The PM's id on a project is a **profile id**, like every other role | — **uncovered** |
| I46 | `bids.bidder_user_id` is the authoritative identity; the profile id is never a global key | — **uncovered** |
| I47 | The billing "fee percentage" of a bid is a **percentage of the ceiling**, and the computed total is stored | — **uncovered** |
| I48 | Percentage allocations sum to **exactly** 100 % ± 0.01 | — **uncovered** |
| I49 | A termin plan may not exceed the contract value | — **uncovered** |
| I50 | `Money::percentage()` is **odd**: `f(-x) == -f(x)` | — **uncovered** |

25 of 50 invariants are named by a test.

---

## How this file is produced

```
$ php artisan routes:export             # routing/routes.yaml, with tier + upstream
$ php artisan contract:capture --all    # spec/contracts/laravel/**
$ node tools/parity/matrix.mjs          # this file
```

`scripts/verify.php` runs the check, and CI asserts the result is unchanged.

---

## Related documents

| Document | What it adds |
|---|---|
| `docs/REWRITE-PLAN.md` §5 | The parity contract (P-1 … P-6) and the six mechanisms |
| `docs/adr/0003-parity-is-machine-checked.md` | Why parity is machine-checked |
| `docs/adr/0019-the-legacy-suite-is-the-oracle.md` | The assertion floor |
| `docs/adr/0021-a-visual-baseline-changes-only-through-an-adr.md` | The baseline gate |
| `docs/PORTING.md` §2 | The definition of done for a ported endpoint |
| `docs/MONEY.md` §11 | The 50 money invariants |
