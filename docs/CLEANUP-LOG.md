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
