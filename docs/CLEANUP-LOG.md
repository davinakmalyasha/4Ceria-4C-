# Cleanup & Refinement Log

Working record of the make-it-make-sense pass. Every delete/move/rename is listed here so review is a checklist.
**No commits were made by the agent** — everything is staged/unstaged in the working tree for owner review.

## Decisions locked by owner
- Storage: **hard cutover** to `railway` disk + `RAILWAY_STORAGE_*` env vars (no fallback)
- Dead frontend components: **hard delete**
- Commits: **none by agent** — owner reviews and commits

## ⚠️ DEPLOY BLOCKER (owner action required)
The storage config now reads `RAILWAY_STORAGE_*`. At your next Railway deploy you MUST rename these
dashboard variables (values unchanged) or contracts/KYC/verification-document endpoints will lose
private-bucket access:

| Old (dashboard)            | New (dashboard)                 |
|----------------------------|---------------------------------|
| SUPABASE_STORAGE_KEY_ID             | RAILWAY_STORAGE_ACCESS_KEY_ID      |
| SUPABASE_STORAGE_SECRET_ACCESS_KEY  | RAILWAY_STORAGE_SECRET_ACCESS_KEY  |
| SUPABASE_STORAGE_REGION             | RAILWAY_STORAGE_REGION             |
| SUPABASE_STORAGE_BUCKET             | RAILWAY_STORAGE_BUCKET             |
| SUPABASE_STORAGE_ENDPOINT           | RAILWAY_STORAGE_ENDPOINT           |

---

## Phase 0 — Safety prep
- `.gitignore`: added `/.playwright-mcp/`; added `!refinement-tests/` + `!refinement-tests/**`
  negations (the generic `fix_*.php` / `seed_*.php` scratch patterns were silently blocking the
  owner-mandated test dir from ever being committed).
- Staged previously-untracked LIVE files: `app/Http/Controllers/Api/UnreadSummaryController.php`,
  `resources/js/hooks/useUnreadCounts.ts`, `public/pwa-192x192.png`, `public/pwa-512x512.png`,
  all of `refinement-tests/`.
- Staged worktree deletion of `database_schema_reference.md` (was deleted earlier, never staged).

## Phase 1 — Storage truth-pass (`supabase` → `railway`)
- `config/filesystems.php`: disk key `supabase` → `railway`; env reads renamed to `RAILWAY_STORAGE_*`
  (**hard cutover**, no fallback); misleading comments rewritten. Also removed the never-referenced
  standalone `'s3'` disk entry (`PUBLIC_STORAGE_DRIVER=s3` selects the driver *inside* the `public`
  disk config — unaffected).
- `.env` + `.env.example`: variable names swapped, values untouched.
- Call sites renamed (`disk('supabase')` → `disk('railway')`, `store(...,'supabase')` → `'railway'`):
  - `app/Services/ProjectContractService.php` (SPK snapshots)
  - `app/Models/ProjectDocument.php` (file_url accessor + comment)
  - `app/Models/ProjectRequirement.php` (image_url accessor)
  - `app/Http/Controllers/StorageFallbackController.php` (+ `$supabase` var renamed)
  - `app/Http/Controllers/Api/SecureVerificationDocumentController.php`
  - `app/Http/Controllers/Api/ProjectController.php` (signature/snapshot IO)
  - `app/Http/Controllers/Api/ProjectRequirementController.php`
  - `app/Services/ImageService.php` (comment)
- Post-condition: repo-wide case-insensitive grep for "supabase" = **zero hits**; 10 modified PHP files lint-clean.

## Phase 2 — Backend dead-code purge
Deleted (git rm):
- `routes/auth.php` — **never registered** in bootstrap/app.php; every route in it didn't exist at runtime
- `app/Http/Controllers/Auth/*` (11 Breeze controllers) + `app/Http/Requests/Auth/LoginRequest.php`
- `app/View/Components/{AppLayout,GuestLayout}.php` (only consumers were deleted blades)
- Root legacy controllers: `ProjectController.php`, `ProfileController.php`, `ProjectLegalController.php`
  (routed twins live under `Api\`; root ProjectController even rendered a nonexistent view)
- Orphans: `Services/ProjectLegalService.php`, `Services/ProjectEngineeringService.php`,
  `Notifications/BudgetAuthorized.php`, `Policies/HousePolicy.php`,
  `Api/ConsultationController.php` (only referenced by a commented-out route block),
  `Api/GoogleAuthController.php` (never routed; also lacked OAuth `aud` validation),
  `Requests/ProfileUpdateRequest.php`
- **102 of 103 Blade views** (~10,400 lines): everything except `resources/views/app.blade.php`
  (the sole reachable view via SpaController). Includes Breeze auth pages, old dashboard/house/admin
  eras, empty stub files. Plus all 11 legacy `public/css/*.css` referenced only by those blades.

Method trims (verified zero inbound refs before cutting):
- `Api/ProjectFeatureController.php`: 1,204 → ~100 lines. Kept only routed
  `pmVerifyProcurement` + `pmRejectProcurement` + their `logActivity` helper.
- `Api/ProjectAddendumController.php`: removed unrouted legal-disbursement trio
  (`requestLegalDisbursement`, `verifyLegalDisbursement`, `getLegalFinancials`) — live equivalents
  live in `Api/ProjectLegalController`.
- `Api/ProjectRequirementController.php`: removed unrouted `pmVerifyProcurement`/`pmRejectProcurement`
  twins (they had NO auth checks; the routed ones in FeatureController do).
- `Api/ProjectController.php`: removed unrouted `getContractSignature()` (HMAC signature-image endpoint).

Route tightening:
- `apiResource` constrained to methods that actually exist:
  `houses->only([store,update,destroy])`, `projects->only([store,update,destroy])`,
  `materials->only([store,update,destroy])` (previously generated dead create/edit routes).
- Removed the commented Notary Consultations block from `routes/api.php`.

⚠️ AUDIT CORRECTION: the sweep flagged `ProjectLegalController::syncProjectLegalScope` as unwired.
Manual verification found it IS called from `ProjectController::acceptBid` (:1512) and
`signContract` (:3171) — **kept**. All other deletions re-verified against the live tree.

Post-condition: full `php -l` sweep clean; `composer dump-autoload` OK (10,167 classes);
router boots without class-not-found errors (smoke suite router check PASS).

## Phase 3 — Frontend purge
Deleted 32 components/constants with **zero inbound imports** (each name re-grepped across
`resources/js` immediately before deletion; one reported reference for ChatWidget was a false
positive — `components/docs/InteractiveWidgets.tsx` imports `./widgets/ChatWidget`, not this file):
Dashboard/FirmRoster, Dashboard/JoinRequestsList, Dashboard/TeamMemberManager,
Engineers/InviteToProjectModal, Marketplace/CheckoutDrawer, Overview/OverviewProjectCards,
Projects/BiddingBrief/BriefHeader, Projects/BidComparisonModal, Projects/ContractReviewModal,
Projects/ProjectComments, Projects/ProjectFiles, Projects/ProjectMilestones,
Projects/ProjectQuickSelectModal, Projects/ProjectVault, Projects/Details/{EngineeringBidForm,
ProjectTeam,ProjectDetailBids,ProjectDetailEdit,ProjectDetailHeader,ProjectDetailInfo,
ProjectDetailReviews}, Projects/Phases/{ConstructionBriefManager,ConstructionProgress,
DesignJournal,EngineeringBudgetCard,LegalProgress,LegalRequirementsConfig,OwnerApprovalBanner},
ChatWidget, PostProjectForm, ProfessionalProfileModal, constants/InteriorStandardPresets.
Post-condition: `npm run build` green (20.4s, PWA precache 40 entries).

## Phase 4 — Trash & hygiene
- Local rm: `.playwright-mcp/` (MCP debug output), `scratch/` (26 superseded scripts),
  `tmp/create_courier.php`, empty `database/database.sqlite`.
- git rm: `public/whatsapp-qr.png` (zero refs incl. mobile/), `database/schema/mysql-schema.sql`
  (regenerable via schema:dump).
- `.dockerignore`: dropped stale `GEMINI.md` line; added `docs`.
- Docs moved out of root: `upgrade.md` → `docs/upgrade-guide.md`;
  `backendOptimization.md` → `docs/optimization/backend.md`; `frontendOptimization.md` →
  `docs/optimization/frontend.md`; `Optimization.md` → `docs/optimization/completion-report.md`;
  `arsitektur_aplikasi.puml` → `docs/architecture.puml` (now tracked).

## Phase 5 — Context layer (all new files)
- `AGENTS.md` (repo root) — agent entry point: commands, PHP/Octane traps, storage conventions, working rules.
- `docs/ARCHITECTURE.md` — topology, request lifecycle, disk layout, deploy pipeline, frontend structure.
- `docs/DOMAIN.md` — roles, ID-convention traps, project lifecycle, money flow, collaboration surfaces.
- `docs/CONVENTIONS.md` — auth, authorization patterns (nested-resource scoping rule), resources, caching, uploads, frontend rules, known phantom endpoints.
- `docs/API_MAP.md` — route inventory by domain.
- `docs/audits/{security,performance-runtime,dead-code}.md` — condensed archives of the 8-agent sweep + this cleanup's audit (incl. the corrected `syncProjectLegalScope` claim).
- `README.md` — env table updated for `RAILWAY_STORAGE_*` / `PUBLIC_STORAGE_DRIVER`; layout notes now point at `docs/`.

## Post-verification fixes
- `composer.json` `dev` script: bare `php` → explicit `C:\laragon\bin\php\php-8.5.7\php.exe`
  (PATH's 8.2 cannot parse vendor); `octane:start` → `octane:start --server=frankenphp --port=9000`
  (built-in server segfaults on Windows/8.5). Local-dev only; Docker never runs `composer dev`.

## Final verification (all green)
- `php -l` sweep over app/, routes/, config/, database/: **clean**
- `composer dump-autoload`: 10,167 classes, patch script OK
- `npm run build`: green (PWA precache 40 entries)
- `refinement-tests/smoke-api.php`: **10/10 PASS** (houses, directories, unread-summary, vault 403, schedule 401/403)
- Playwright: login session → dashboard (0 console errors) → My Projects → project detail page
  (workspace menu, budget, MapLibre map, gallery) → 0 console errors.

## Review guide
`git status` shows: staged deletions (~1,650 files incl. the prior session's cleanup), staged
renames (`_legacy/controllers/`), staged new files (UnreadSummaryController, useUnreadCounts hook,
PWA icons, refinement-tests/, docs/), and modified files (filesystems, controllers, routes, configs,
composer.json, README, .gitignore, .dockerignore). `git diff --cached --stat` for the big picture;
`git diff -- <file>` per file. Nothing was committed by the agent.

---

## 2026-08-24 -- Security & Integrity Hardening Pass (agent, no commits)

Scope: full audit remediation (6 sub-agent audits: security / backend bugs / refactor+dead-code /
features / performance / frontend). **Additive + refinement only -- nothing that worked was removed.**

### P0 Critical (takeover & money integrity)
- AuthController + RegistrationDraftController: removed dmin from registration allowlists
  (was: anyone could self-register as admin = full takeover). Admin accounts are now console-only.
- Registration drafts: passwords are bcrypt-hashed at cache time; plaintext is never stored and
  never echoed back by show(). Legacy drafts (plaintext) still complete safely. min length unified to 8.
- PaymentVerificationService::verifyProof: termin verify now restricted to the termin recipient
  (or hired pro for legacy rows); material verify restricted to that order's supplier / PM;
  standard addendums require actual project participation. Previously ANY authenticated user
  verified ANY payment on ANY project.
- ProjectController::signContract: replay guard (refuses when a termin for the role is
  verifying/paid) + only deletes termins not in flight.
- ProjectBudgetController::markPaid: idempotency guards on all 7 types + ledger writes via
  updateOrCreate keyed (project_id, reference_model, reference_id); 422-class errors surfaced properly.
- ProjectExtensionController: participant gates (index/store), PM-only review, owner-only decide,
  binding checks, null-deadline fallback.
- Mutual termination: profile-id vs user-id comparisons fixed via HandlesProjectAuthorization;
  respond/escalate restricted to project participants + binding checks. (Any user used to be able
  to cancel any project.)
- inviteProfessional: fixed undefined $professional fatal (endpoint was dead-on-arrival) +
  existence validation.
- Freeze middleware: bypass via ?x=mutual-termination in query string closed (path-only match).
- Frontend: QuickLoginPanel dev glob wrapped in import.meta.env.DEV -- seeded credential dictionary
  was being INLINED into production bundles.

### P1 Deploy perf
Dockerfile: OPcache enabled+tuned. entrypoint.sh: config/route/view/event caches (verified all four
succeed). nginx.conf: gzip + immutable /build/ caching. supervisord.conf: queue worker + scheduler
programs (queued mail was silently never sent in prod). .dockerignore: public/hot excluded.

### P2 Authorization sweep
- Binding checks (child.project_id === project.id) added across: PM bids, change orders, warranty
  claims, snag items, addendums (+furniture milestone), requirements, material folders, procurement
  requests, engineering addenda, milestones, payment termins, timeline extensions.
- Zero-auth endpoints gated: legal financials, warranty CRUD, change orders, snag read/status,
  BAST data, requirements index/history/procurement/logUsage, material folders index.
- Interior designer hire-check enforced in BOTH isAuthorizedPro copies (any interior user used to
  have BOM write access on every project).
- Milestones: professionals can no longer self-approve (pproved/is_completed stripped for
  non-owner/PM); lead-pro cannot finalize alone (two-step flow completed by owner/PM);
  technical-audit ids validated per-project.
- Payment termins: broken $project->pm_id === profile->id comparison fixed; paid status removed
  from self-service create/update; contractor delete scoped to own role + never deletes verifying/paid.
- KYC (NPWP/SIUP/portfolio/certificates) NEW uploads -> private railway disk (legacy public files
  keep rendering). Avatar SVG uploads rejected (stored-XSS).
- PII stripping: UserResource bank/email owner-or-admin only; HouseResource contact fields gated
  (anon scrapers get nothing, authed users keep phones); ProjectResource share_token + bidder
  emails/identity numbers/NPWP/KYC paths null unless privileged viewer.
- Auth hardening: sanctum token expiration (2 days idle); password reset revokes ALL tokens;
  login throttle 10/min + forgot/reset 5/min; forgot-password response identical for unknown emails
  (enumeration closed).
- Geocode proxy: failures cached 5 min instead of poisoning 30-day keys; coords rounded to 4dp
  (Redis key-cardinality DoS closed).

### P3 Money correctness & state machines
- ProjectFinancialService: affordability = budget - ledger payments (was raw budget); dedup
  matches both reference spellings; recordTransaction normalizes to FQCN.
- deductBudget() false return now HONORED in verifyBidPayment + PaymentVerificationService
  (insufficient budget aborts with 422 instead of marking pros paid with no ledger row).
- OrderService stock decrement/increment: atomic flag claim + transaction (double-decrement closed).
- Quote approval: duplicate-order race closed (lockForUpdate re-check inside tx).
- Courier job accept: atomic conditional UPDATE (TOCTOU closed) + no more dragging approved quotes
  backwards to awaiting_payment.
- BidCalculationService: percentage fee without budget returns 0 (was Rp <percentage> literal).
- shortlistBid state guard; fire/resign blocked on completed/cancelled projects; PM-fire cleanup
  matches milestone pm_id space correctly; resign hire-check fixed for PM user-id space;
  bid-status lookup broadened past 'accepted'.
- clientSignContract no longer drags in_progress projects back to awaiting_payment.
- syncProjectLegalScope writes PROFILE id into milestones.notaris_id (relation resolved wrong notary);
  finalizeLegalScope verifies THE assigned PM.
- Conversation create race handled (unique-violation -> fetch winner).
- ReviewController uses pm() relation (PM review notifications actually send again).
- BASTService rewritten against real schema (nonexistent relations/columns caused guaranteed 500s).
- ProjectContractService SPK location fallback (location_address column doesn't exist).
- Strict-mode landmines cleared: eager loads in index()/negotiate/confirm/getBidderUserId/getBidderUser/
  BidProjectManagerController/HireHistory/unlockLinkedTermin; phantom interior.interior.* load removed.
- MaterialQuoteController supplier-null fatals guarded (4 sites).

### P5 Performance
- Migration ..._add_missing_performance_indexes: conversations(user_two_id),
  notifications(user_id,read_at), delivery_jobs composites x2, material_orders composites x2,
  material_quotes(supplier_id,status), house(is_suspended,created_at), projects selector columns x7
  + (status,created_at).
- Migration ..._add_unique_constraints_for_money_integrity: UNIQUE ledger triple + one-bid-per-pro-
  per-project on all 7 bid tables. Pre-checked live data: ZERO duplicate groups existed.
- ProjectResource resolveStorageUrl static memo removed (Octane memory leak + host baking).
- octane.php CollectGarbage enabled.
- Chat unread counters: dropped Redis forever-mirror (never decremented = stuck badges + leak);
  inbox uses authoritative DB withCount (response shape unchanged).
- Milestone auto-heal LIKE-UPDATE throttled to once/hour/project via cache flag.
- HireHistory phone N+1 (2 queries/hire) eager-loaded away.
- House views increment throttled per viewer/6h (row-lock on hottest public page gone).
- StorageFallbackController: presign-first (2 S3 HEADs -> 0 per image), traversal+null-byte guards.

### P4 Frontend criticals
- tailwind content += *.ts (STATUS_CONFIG/preset classes were purged from prod CSS).
- Rules-of-hooks crashes fixed in Dashboard.tsx (admin redirect moved after all hooks) and
  LandingPage.tsx (FAQ useState hoisted).
- Global 401 interceptor: session expiry redirects to /login once instead of stranding the user.
- useProjectTabsData: stale-response guard (project switch no longer merges old project's tabs data)
  + DEV-gated logs.
- Chat polling deduplicated into ONE shared module timer (overlay + tab each ran private 5s pollers);
  DeliveryJobsTab/JobRadarTab pause when tab hidden.
- Dead navigations repaired: /messages?user_id -> open-chat-with-user event (wired in Dashboard);
  /projects/{id}?tab=payments -> switchDashboardTab events (budget manager, technical resourcing, WA links).
- Register.tsx enforces min 8 chars (backend parity).
- CartContext value/handlers memoized (whole-shell re-render per add-to-cart gone).
- Vite standalone build inherits manualChunks (maplibre monolith on Vercel build).
- Currency formatters unified to zero-fraction IDR (no more "Rp 1.000.000,00" / en-US grouping bugs).
- tsconfig.json + ESLint flat config installed; scripts: 
pm run lint, 
pm run typecheck
  (~196 pre-existing type errors logged as incremental backlog; typecheck intentionally NOT gating builds yet).
- Duplicate/conflicting ProjectDocument + duplicate structural_profile/mep_profile interface members fixed.

### P6 Restored / new
- POST+GET /consultations implemented against existing NotarisConsultation table
  (ConsultationModal button has been 404ing since the controller deletion).
- reject-engineering-bid/{bidId} endpoint implemented (EngineeringBidsBoard's Reject button was a phantom 404).
- config/bids.php role map created; ProjectController's getBidModel/getBidderUserId/getBidderUser/
  proposeFeeAndTermins map/verifyBidPayment reference map now consume it (five hand-synced maps -> one).
- tests/MoneyIntegrityTest.php: 6 regression tests (markPaid double-spend, signContract replay,
  cross-project IDOR, verify-proof authz, %-fee collapse, consultation booking). Runs against real
  MySQL inside explicit BEGIN/ROLLBACK -- verified to leave zero residue. Requires pdo_sqlite? No:
  requires MySQL running; sqlite ext enabled in PHP ini for the Feature suite's future use.

### Deliberately NOT done (owner decisions pending)
- No deletions of D-routes/models/_legacy (per "only add/refine" instruction) -- backlog documented above.
- Hired-professional email exposure in ProjectResource kept (participants legitimately need contact;
  competitor leakage IS gated). Phones left visible to authenticated users.
- Notary accept->in_progress shortcut and directories whole-table payloads left as-is (behavioral changes).

---

# ROUND 2 � 2026-08-25 deep audit (security chain, regressions, rewires, true-dead removal)

Second pass after the round-1 hardening shipped. Six probes (4 subagent audits + 2 manual
deep-dives), every critical claim re-verified by hand before touching anything.

## Critical security chain closed
- PublicProfessionalController: directory payloads were RAW models � publicly shipping
  identity_number/npwp_number/siup_number, NPWP/SIUP/certificate doc paths and nested bank
  fields. Now strips all KYC-grade fields; portfolios stay public-by-design.
  User::$hidden += bank_name/bank_account_number/bank_account_name/unique_code (explicit
  attribute reads in UserResource unaffected).
- StorageFallbackController: certificates/* presign branch REMOVED (any anonymous visitor
  could mint 1h private-bucket URLs for scraped cert paths). portfolios/ kept � it powers
  ProfessionalProfileView links. Admin/owner cert viewing already flows through the
  authorized SecureVerificationDocumentController.
- ProjectController::show(): membership gate added (owner/admin/PM/hired/sub-pro/bidder).
  Previously ANY authenticated user could enumerate sequential ids and read budgets,
  RAB (construction_details now pii()-gated) and team contacts.
- inviteVendor duplicate-invite 500 (REGRESSION from our own unique constraints) resolved
  by deleting the dead route+method entirely (0 consumers web+mobile).

## Regression fallout from round-1 UNIQUE constraints
- All 7 bid stores + BidProjectManagerController::store: UCV -> friendly "already submitted" 422.
- deductBudget: UCV catch + reference_model normalized to FQCN at write time;
  exists() still matches both spellings for legacy rows.
- Migration 2026_08_25_000001 backfills legacy short-name ledger rows to FQCN
  (pair-safe: skips rows that would collide with an existing FQCN twin).

## Hardening
- Uploads: engineering files.* and addendum attachment restricted to images/pdf (no more
  arbitrary html/svg/exe on public disk); bare `image` rules got explicit mimes x8 endpoints
  (SVG rejected); ImageService rejects SVG MIME + >8000px/>24MP decompression bombs.
- Chat: content max:4000; send throttle 30/min. Consultation bookings: WIB-aware parsing +
  5 pending/day cap. Raw exception text removed from ~6 handlers (S3 errors logged only).
- bootstrap/app.php: trustProxies(*) for Railway edge (rate-limit buckets per real client IP).
- config/cors.php published: FRONTEND_URL + vercel preview patterns; credentials off.
- Document vault: config('filesystems.vault_disk') default railway (private); dev may set
  VAULT_DISK=public. ProjectDocument::file_url accessor already resolves both layouts.
- Consultation schedule_date parsed as Asia/Jakarta then stored UTC (fixes +7h skew).

## Performance
- Chat inbox: limit(100) + avatar resolution via one indexed query per role present
  (replaces 12 eager-loaded profile relations).
- ConvertImageToWebpJob dispatchSync -> dispatch() x3 (prod queue worker exists; sync driver
  keeps local behavior identical).
- $project->touch() on the 5 mutation paths that skipped projects.updated_at so the 60s
  calculateBudgetSummary cache invalidates immediately (markPaid addendum, verifyProof
  termin/addendum/material + bid types, change-order owner approval, addendum approve).
- House search cache key whitelisted to filter params; per_page clamped 1..50.

## Frontend
- Root ErrorBoundary wraps the whole app (white-screen of death eliminated).
- Houses pagination FIXED (gate was 8>8=never; now totalPages>1) � results past page 1
  were unreachable since launch of server pagination.
- Notifications: chat_message deep-links into chat tab w/ sender pre-opened; new type
  branches (payment_verified, milestone_approved/revision, consultation_*); opening the
  dropdown no longer bulk-marks everything read.
- useDashboardData stale-response generation guard; AuthContext storage-event multi-tab logout.
- Share-token generate/copy/revoke buttons (BriefDetailPanel) � PublicBrief feature finally reachable.
- FinalHandover regulatory gates panel: Approve Construction Brief -> Verify PBG -> Verify SLF,
  unblocking new-build finalization (endpoints existed with zero UI).
- Extension approvals wired: PM endorse/reject + owner approve/reject strip in PMGroupedApprovals.
- Material orders: buyer payment-proof upload + cancel-before-processing; supplier verify-payment;
  supplier can no longer blind-self-declare 'paid' without proof. Honest escrow-style flow.
- DailySiteLog remounted into ConstructionResourcing (was fully built, wired to a live endpoint,
  never mounted anywhere). MutualTerminationPanel added (initiate/respond/escalate + new GET index);
  backend + freeze middleware always existed with zero UI.

## True-dead removals (owner-gated, double-verified)
- Routes/methods: registration drafts trio (+RegistrationDraftController), questions delete,
  termins proof pair, bids proof pair, verify-design/construction/interior, finalize-legal-scope,
  furniture-addendum, /finalize, /rate, /pending-actions, manual-procurement,
  procurement owner-approve/reject pair, notaris/services, firm-members join-requests/resend,
  admin suppliers surface (duplicate of VerificationController flow), EngineeringProcurement
  ::inviteVendor, ProjectController::verifyBidPayment/uploadBidPaymentProof/getNotarisServices,
  ProjectHandoverController::finalizeProject + ProjectLifecycleService::finalizeProject chain.
- Files/models: AdminSupplierController, config/googlemaps.php (382 LOC zero reads),
  RiwayatProject + PengajuanSpesialisasi models (+Arsitek/Kontraktor relations),
  ConstructionProgressStats.tsx (hardcoded fake stats), ProjectRoadmapGantt.tsx (superseded,
  misleading states), scratch/check_braces.py.
- Packages: composer scribe/breeze/sail; npm clsx/tailwind-merge. Stock Breeze test files
  removed (hit nonexistent web routes). composer update guzzle/psr7/commonmark cleared all
  14 security advisories.
- spatie role/permission middleware aliases kept (package in use elsewhere).

## Tests
- MoneyIntegrityTest extended to 12: DB-level unique enforcement, cross-spelling ledger dedup,
  insufficient-budget e2e via verify-proof, show() membership gate, warranty window,
  budget-cache invalidation.

## Deferred (still open)
- Favorites/wishlist server-side persistence; KPR calculator; review parity (pros review owners);
  PDF/CSV report exports; account deletion/export; notification preference settings;
  refund/dispute arbitration beyond escalation flag; milestone-weighted progress %;
  snag-list SLA aging; mobile fixed-width polish (CompareTool/PMGroupedApprovals/ChatOverlay).
