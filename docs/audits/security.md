# Security audit archive — 8-agent sweep (this pass)

Consolidated findings from the security sweep. Severity as rated at discovery time. Items marked FIXED were addressed in this or earlier passes; everything else is open backlog. File:line references are from audit time and may drift after refactors.

## CRITICAL

**C1. Admin self-registration** — `AuthController.php:73`, root `RegisteredUserController.php:42` (deleted in cleanup), `RegistrationDraftController.php:76`: `role_type` allowlist includes `admin`; registering with it passes `AdminMiddleware` (`role_type==='admin' || hasRole('admin')`). FIX REQUIRED: strip `admin` (+ consider `supplier`/`logistics` flow) from public registration allowlists; create admins via seeder/console only.

**C2. sign-contract replay destroys payment history** — `ProjectController.php:2859–3026`: state gate permits re-entry forever (`contract_pending` → stays `contract_pending`); re-sign deletes ALL termins for the role **including paid ones** and recreates fresh `pending` rows; milestones never deleted on re-sign. Fix: distinct post-signature status; refuse when any termin is `verifying/paid`; delete only `pending/locked`.

## HIGH — concurrency / financial integrity
Only ONE `lockForUpdate()` exists codebase-wide (`ProjectRequirementHistoryController`). All money flows are check-then-act:
- **verify-proof replayable** (`PaymentVerificationService:86–293`): no status guard, no lock; ledger dedup is racy `exists()` check (`ProjectFinancialService:26–35`) with NO unique index on `(project_id, reference_model, reference_id)`. Double credit + repeated sub-pro activation.
- **mark-paid not idempotent** (`ProjectBudgetController:211–375`): raw `create()` per call double-counts budget dashboard; amount source uses `$bid->price` (= percentage number for %-fee bids) instead of `calculated_total ?? price`.
- **accept-bid race** (`ProjectController:1361–1630`, PM variant `BidProjectManagerController:130`): vacancy check outside tx, no lock, no unique constraint per project+role → duplicate hires/conflicting `selected_*`.
- **change-order approve mints duplicate termins** (`ProjectChangeOrderController:109–161`) — no status guard.
- **quote→order double-create** (`MaterialQuoteController:159–271`) — precheck outside tx.
- **stock decrement races** (`OrderService:41`, `MaterialOrderController:111`) — flag check-then-act.
- **termin verification authz broken**: any non-owner counts as authorized for termins (`PaymentVerificationService:117–119`), materials = literally anyone (:121–122); recipient can self-mark `paid` via `updatePaymentTermin` (:76–101).
- **paid termins deletable** (`ProjectPaymentTerminController:268–277`).
- **deductBudget false ignored** (`PaymentVerificationService:181`) → paid with NO ledger row.

## HIGH — IDOR cluster (root cause: nested resources bound globally)
Fix pattern everywhere: `$project->relation()->findOrFail($id)` + participant gates.
- Payment termins: cross-project read/edit/delete/mark-paid/link-milestone; index has NO participant gate (`ProjectPaymentTerminController` throughout).
- Mutual termination `respond()`: only checks "not initiator" — any user cancels victims' projects; `{termination}` never checked against `{project}` (`ProjectMutualTerminationController:66–105`).
- Milestone self-approval: generic `update()` accepts `approval_status=approved` from the milestone's own pro, unlocking their own pay (`ProjectMilestoneController:277,354–363` vs gated `approve()`).
- `submitTechnicalAudit`: milestone/document ids validated `exists:` only — cross-project approval (`ProjectMilestoneController:483,516`).
- `proposeFeeAndTermins`: bid loaded globally (`$modelClass::find($bidId)`, :956) → owner of ANY project rewrites foreign bids; also missing alternation/cap rules that `negotiateBidFee` has.
- `ProjectExtensionController`: ZERO authorization on all 4 methods (index/store/pmReview/ownerDecide — approve extends victims' deadlines).
- Same unscoped-binding family in: ChangeOrder (pmReview/ownerDecide), Addendum (approve/reject/verifyLegalDisbursement/furnitureAddendum milestone binding), Handover snag status writer, Warranty updateStatus, Requirement/Folder helpers + ungated `logUsage`, PM-bid actions, Engineering addendum verify/approve/reject, Procurement verify twins, Legal getFinancials, Report index, Activity feed, Comments/Q&A posting, StickyNote store, SubProfessional index.

## HIGH — data exposure
- `SupplierController::show` + marketplace materials serialize nested full `User` → anonymous bank_account_number/email leak (:53–71, MaterialController:41). Also `MaterialOrderReviewController::getBySupplier:102`.
- `UserResource` includes email + bank fields; consumed publicly by House Q&A (`HouseQAController` routes api.php:59).
- Public professional dirs sanitize email/2FA but NOT bank fields (residual delta to prior fix) — `PublicProfessionalController:24`.
- `HouseResource:41–47` exposes owner email + all phones anonymously.
- KYC/NPWP/SIUP/receipts/bid-proofs/vault docs stored on PUBLIC disk; `/storage/{path}` fallback presigns any `portfolios/*|certificates/*` path anonymously with no throttle (`StorageFallbackController`, `ProfileController:249–274`, `PaymentVerificationService:62`, `ProjectDocumentController:88`).

## HIGH — uploads & validation
- SVG accepted by bare `image` rule on ~8 endpoints → stored XSS via public disk (`PortfolioController:29`, `FirmMemberController:381+`, `SupplierController:120`, review/delivery/logistics uploads, ImageService GD-fallback passthrough).
- Bid attachments: ZERO validation (`ProjectController:679–688`).
- Engineering logs: size-only validation (`ProjectEngineeringController:77–85`); milestone gallery has NO rule (`ProjectMilestoneController:170–177`).
- Generic `/upload` honors caller-controlled folder prefix (`ProjectController:2236–2242`) → namespace squatting incl. presigned prefixes.
- Negative prices accepted: material quote items (`MaterialQuoteController:43–44`), negotiation `selected_services[].price` (`ProjectController:1039–1044, 2765+`); termin amounts editable after payment; no upper bounds on bid prices; PM proposal unbounded length.

## MEDIUM
Firm member self-approve/resurrection + invite 500 after removal (`FirmMemberService:67–118`); roster phone leak (`getRoster:213`); courier job double-assign race (`LogisticsJobController:36–47`); sub-pro invitation replay/no expiry; self-dealing loop (owner can bid/hire/pay/review self — no guard anywhere); negotiation round integrity (non-unique round_number, unsynced counter); registration-draft hijack (client-chosen tempId returns password field + bearer token, `RegistrationDraftController:26–130`); project `status` mass-updatable via UpdateProjectRequest (contractor forces `completed`); share_token exposed in ProjectResource output to any viewer of show(); consultations unrouted-but-guardless (keep routes commented until fixed); forgot-password email enumeration paths; Google tokeninfo lacks `aud` check (controller deleted in cleanup — do not resurrect without fix).

## LOW / hardening
Rate limits coarse (single global limiter; `/storage/*`, `/templates/*` unthrottled; geocode cache-key cardinality); ErrorBoundary renders raw stacks; console.log leaks (PublicBrief full payload, CheckoutDrawer GPS coords — both still present? re-check after frontend purge: CheckoutDrawer was DELETED as dead code); two `_blank` links without rel noopener (EngineeringManualLogs:176,215); share links permanent (add TTL); contract signature HMAC has no timestamp validation; whatsapp_order_id only 32-bit entropy; rating dedup races (no unique indexes); null-deref 500s (`$user->supplier->id`); `L10` latent undefined-var bug in `inviteProfessional:2645`.

## Frontend
- F1 HIGH: bearer token + full profile incl. bank fields persisted in localStorage (`AuthContext.tsx:166,199–200`); XSS converts to account takeover.
- F2 HIGH: stored XSS — `project.title` interpolated into `<title>` inside print-window `document.write` (`ProjectContractViewerModal.tsx:58–68,122`); steals F1 token. Fix: escape or DOM-build.
- F3 MED: logout fire-and-forget POST cancelable by immediate redirect (`AuthContext.tsx:204–209`).
- Verified clean: SW never caches API responses; no source maps shipped; admin UI fully server-gated; env vars leak nothing; maps use zero-key tiles; quick-login dev-only.

## Infrastructure/auth hardening backlog
No dedicated login/reset throttles; Sanctum expiration unset; password reset doesn't revoke tokens; `SESSION_SECURE_COOKIE` unset; trustProxies not configured (per-IP rate limiting behind proxy ineffective); freeze middleware uses substring match on query string; dead public draft routes (removed where applicable).
