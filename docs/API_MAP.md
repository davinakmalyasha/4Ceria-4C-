# API map

Single source of truth: `routes/api.php` (~490 lines). This is a navigational summary — check the file for exact signatures. All routes return JSON; errors render JSON for `api/*` via `bootstrap/app.php`.

## Public (no auth) — api.php:41–78
| Group | Endpoints |
|---|---|
| Auth | `POST /register` *(throttle 5/min)*, `POST /login` *(10/min)*, `POST /forgot-password` *(5/min)*, `POST /reset-password` *(5/min)* |
| Houses | `GET /houses` *(public; `?mine=true` is per-user and bypasses the shared cache)*, `GET /houses/{house}` |
| House Q&A | `GET /houses/{house}/questions` (+ answers nesting) |
| Professional directories | `GET /arsitek | /kontraktor | /interior | /notaris | /project-manager | /structural-engineers | /mep-engineers` (600 s cache) |
| Materials marketplace | `GET /marketplace/materials`, `GET /marketplace/suppliers(/{id})` |
| Geocode proxy | `GET /geocode/reverse`, `GET /geocode/search` (Nominatim, 30-day cache) |
| Share-token brief | `GET /brief/{token}` (budget stripped) |

## Authenticated core (`auth:sanctum` + `freeze_pending_termination`) — api.php:79+
**Profile/me**: `GET/PUT /me`, `DELETE /me/avatar`, `GET /me/unread-summary` (header heartbeat), portfolios CRUD, verification uploads.

**Projects** (`projects/{project}` prefix unless noted): index/show/store/update/destroy, bids matrix (`getBids`, `submitBid`, `shortlistBid`, `acceptBid`, `declineBid`), fee negotiation (`propose-fee-termins`, `negotiate-bid-fee`, `confirm-bid-fee`), contract signing (`sign-contract`, `client-sign-contract`), planning/brief gates, phase lifecycle (`broadcast-phase`, lock/kickoff/verify/authorize), mutual termination + freeze, **dispute center** (`GET/POST /disputes`, `GET /disputes/{id}`, `POST /disputes/{id}/reply|withdraw`, `GET /disputes/{id}/messages/{msg}/evidence` — an open dispute freezes payment paths with 422), PM bidding, milestones, comments, documents (vault), sticky notes, daily logs, payment termins (+proof upload/verify), engineering manual logs, proof-of-transfer, owner confirmation & final handover (BAST), snag items, change orders, timeline extensions, warranty claims, technical resourcing/engineering hires, share-token generate/revoke, external vendor invites, reviews & ratings, activity feed, executive reports, scheduling, BOM requirements + folders, budget/finance dashboard & mark-paid, addendum authorization, sub-professional management.

**Standalone under auth**: `/upload`, `/my-bids`, `/user/active-projects`, notifications list/mark-read, **favorites** (`GET /favorites`, `POST /favorites/toggle`, `POST /favorites/merge`, `DELETE /favorites/{type}/{id}`), **web push** (`GET /push/public-key` → 501 until VAPID configured, `POST /push/subscribe|unsubscribe`), chat (`conversations`, message send/read), houses/rooms mutations + house Q&A write, firm/team member rosters.

## Marketplace & logistics
- `merchant/*`: supplier profile get/update, materials CRUD (`apiResource->only(store,update,destroy)`).
- `logistics/*`: dashboard-stats (cached), available-jobs, my-jobs, job accept, status update.
- Quotes/orders: `material-quotes` CRUD + request-payment/mark-paid/post-delivery-job/approve; `material-orders` (`only[index,show,update]`); order reviews.

## Admin (`admin` middleware, prefix `admin`) — api.php:431+
stats (cached 600 s), professional verifications (list/history/status), house suspend, project force-terminate, user suspend/role, supplier verification, **dispute arbitration** (`GET /admin/disputes` + `?status=` filter with `open_count`, `GET /admin/disputes/{id}`, `POST .../reply`, `POST .../act` with `action in:dismiss,release_payment,record_refund,terminate_project,custom`, `GET .../messages/{msg}/evidence`), projects CSV export (`GET /admin/projects/export`).

## Removed in this pass
Breeze web auth (`routes/auth.php` — was never loaded), Notary Consultations block (commented), dead `create/edit` resource routes for houses/projects/materials.

## Reserved / future-facing endpoints (kept deliberately)
Owner decision: these stay routed as API-first surface for future clients (mobile app, integrations). Do NOT report as dead code; revisit if still unwired in a future audit. Re-verified 2026-09-22.

| Route | Backend | Note |
|---|---|---|
| `POST /projects/{id}/approve-construction-brief` | ProjectController::approveConstructionBrief | Brief approval gate, awaiting SPA wiring |
| `POST /projects/{id}/revise-construction-brief` | ProjectController::reviseConstructionBrief | Paired with above |
| `POST /projects/{id}/mark-complete` | ProjectController::markComplete | SPA currently PATCHes project fields instead (PhaseAssignedPro) |
| `POST /projects/{id}/requirements/{req}/usage` | ProjectRequirementController::logUsage | Restock/use are wired via dynamic mode param |
| `POST /projects/{id}/approve-engineering` | ProjectEngineeringController::approveEngineeringIntegration | Engineering flow uses verify-engineering + authorize-specialist |
| `POST /projects/{id}/approve-engineering-hire/{addendum}` | ProjectEngineeringController::approveEngineeringHire | Same |
| `POST /projects/{id}/reject-engineering-hire/{addendum}` | ProjectEngineeringController::rejectEngineeringHire | Same |
| `POST /projects/{id}/pm-bids` | BidProjectManagerController::store | PM **bids are created** via proposeFeeAndTermins; but `pm-bids/{id}/shortlist|accept|decline` ARE wired (ProjectProposals, PhaseBidsList, ProjectInterviews) |
| `PUT/POST/DELETE /team-members` writes | TeamMemberController@store/update/destroy | `GET /team-members` IS wired (AddendumProposalModal, ImportExternalVendorModal, RequestSpecialistModal); only mutations are unwired |
| `GET/POST /houses/{house}/questions`, `POST /questions/{question}/answers` | HouseQAController@index/storeQuestion/storeAnswer | Q&A UI pending (answers now owner/admin-gated) |
| `GET /templates/{filename}` | SpaController::showTemplate (web.php) | SPK preview rendered inline in React instead |

Related dead-code removed this pass: RegistrationDraftController, FirmMemberService::{resendInvitation,getJoinRequests}, ProjectScheduleService::updatePhase, Contact/Admin models, `riwayat_projects` + `pengajuan_spesialisasi` tables (drop migration 2026_08_25_000001), ~40 unimported frontend exports, Common/StatusBadge.tsx.
