# API map

Single source of truth: `routes/api.php` (~449 lines). This is a navigational summary — check the file for exact signatures. All routes return JSON; errors render JSON for `api/*` via `bootstrap/app.php`.

## Public (no auth) — api.php:41–78
| Group | Endpoints |
|---|---|
| Auth | `POST /register`, `POST /login`, `POST /forgot-password`, `POST /reset-password` |
| Registration drafts | `GET/POST /registration/draft/{tempId}`, `POST /registration/submit/{tempId}` *(hardening backlog: draft hijack — audits M17)* |
| Houses | `GET /houses`, `GET /houses/{house}` |
| House Q&A | `GET /houses/{house}/questions` (+ answers nesting) |
| Professional directories | `GET /arsitek | /kontraktor | /interior | /notaris | /project-manager | /structural-engineers | /mep-engineers` (600 s cache) |
| Materials marketplace | `GET /marketplace/materials`, `GET /marketplace/suppliers(/{id})` |
| Geocode proxy | `GET /geocode/reverse`, `GET /geocode/search` (Nominatim, 30-day cache) |
| Share-token brief | `GET /brief/{token}` (budget stripped) |

## Authenticated core (`auth:sanctum` + `freeze_pending_termination`) — api.php:79+
**Profile/me**: `GET/PUT /me`, `DELETE /me/avatar`, `GET /me/unread-summary` (header heartbeat), portfolios CRUD, verification uploads.

**Projects** (`projects/{project}` prefix unless noted): index/show/store/update/destroy, bids matrix (`getBids`, `submitBid`, `shortlistBid`, `acceptBid`, `declineBid`), fee negotiation (`propose-fee-termins`, `negotiate-bid-fee`, `confirm-bid-fee`), contract signing (`sign-contract`, `client-sign-contract`), planning/brief gates, phase lifecycle (`broadcast-phase`, lock/kickoff/verify/authorize), mutual termination + freeze, PM bidding, milestones, comments, documents (vault), sticky notes, daily logs, payment termins (+proof upload/verify), engineering manual logs, proof-of-transfer, owner confirmation & final handover (BAST), snag items, change orders, timeline extensions, warranty claims, technical resourcing/engineering hires, share-token generate/revoke, external vendor invites, reviews & ratings, activity feed, executive reports, scheduling, BOM requirements + folders, budget/finance dashboard & mark-paid, addendum authorization, sub-professional management.

**Standalone under auth**: `/upload`, `/my-bids`, `/user/active-projects`, notifications list/mark-read, chat (`conversations`, message send/read), houses/rooms mutations + house Q&A write, firm/team member rosters.

## Marketplace & logistics
- `merchant/*`: supplier profile get/update, materials CRUD (`apiResource->only(store,update,destroy)`).
- `logistics/*`: dashboard-stats (cached), available-jobs, my-jobs, job accept, status update.
- Quotes/orders: `material-quotes` CRUD + request-payment/mark-paid/post-delivery-job/approve; `material-orders` (`only[index,show,update]`); order reviews.

## Admin (`admin` middleware, prefix `admin`) — api.php:396–415
stats (cached 600 s), professional verifications (list/history/status), house suspend, project force-terminate, user suspend/role, supplier verification.

## Removed in this pass
Breeze web auth (`routes/auth.php` — was never loaded), Notary Consultations block (commented), dead `create/edit` resource routes for houses/projects/materials.
