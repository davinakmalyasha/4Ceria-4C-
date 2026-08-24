# Dead-code & cleanup audit archive — this pass

Full evidence-backed inventory that drove the Phase 2–4 purge. Kept here so future agents know what was removed and why, and which claims were corrected during execution.

## Deleted (verified zero live references before removal)
- `routes/auth.php` — never registered in `bootstrap/app.php`; every endpoint it declared did not exist at runtime. SPA auth is 100% `Api\AuthController` (axios base `/api`).
- 11 Breeze controllers under `app/Http/Controllers/Auth/`, + `Requests/Auth/LoginRequest.php`, `Requests/ProfileUpdateRequest.php`, `View/Components/{AppLayout,GuestLayout}.php`.
- Root legacy controllers: `ProjectController` (rendered nonexistent view `users-page/projectDetail.blade.php`), `ProfileController`, `ProjectLegalController` — routed equivalents all live in `Api\`.
- Orphans: `Services/ProjectLegalService.php`, `Services/ProjectEngineeringService.php`, `Notifications/BudgetAuthorized.php`, `Policies/HousePolicy.php` (convention-mapped but never invoked), `Api/ConsultationController.php` (routes commented out; SPA's ConsultationModal already 404s today), `Api/GoogleAuthController.php` (unrouted; also lacked OAuth aud validation).
- **102 of 103 Blade views** (~10,400 lines): Breeze auth pages, old dashboard/house/admin eras, users-page subtree (the views the archived `_legacy/controllers` once rendered), 9 empty stub files. Only `resources/views/app.blade.php` is reachable (SpaController).
- 11 legacy `public/css/*.css` referenced only by deleted blades.
- 32 frontend components/constants with zero inbound imports (older ProjectDetail layout family, old checkout drawer, chat widget root copy, etc.). Each re-grepped immediately before deletion.
- Assets: `public/whatsapp-qr.png` (zero refs incl. mobile/), `database/schema/mysql-schema.sql` (regenerable).
- Method trims: `Api/ProjectFeatureController` 1,204→~100 lines (kept routed procurement pair only); Addendum legal-disbursement trio; Requirement pmVerify/pmReject twins (no auth checks); `Api/ProjectController::getContractSignature`.

## Audit corrections made during execution
- Sweep flagged `ProjectLegalController::syncProjectLegalScope` as unwired → **wrong**; called from `ProjectController::acceptBid` (:1512) and `signContract` (:3171). KEPT. Lesson: static methods need cross-class greps, not just route maps.
- `ChatWidget` appeared referenced but the hit was `components/docs/widgets/ChatWidget` (different file). Root copy safely deleted.

## Kept despite looking suspicious (do not delete later)
- `scripts/apply-octane-patches.php` + gitignored `public/frankenphp-worker.php` — required by local Octane/FrankenPHP runtime (composer post-autoload-dump runs the patcher).
- `Policies/ProjectReportPolicy` — auto-discovered by convention AND invoked via `$this->authorize()` in Api ProjectReportController.
- `Models/PersonalAccessToken` — wired via `Sanctum::usePersonalAccessTokenModel()`.
- `Jobs/ConvertImageToWebpJob` — dispatchSync ×3 in Api ProfileController.
- `ResetPasswordNotification` — referenced by `User::sendPasswordResetNotification()` override (currently dormant since Breeze layer died; revisit when reworking password-reset mail to queued mailable).
- Framework model-less tables (cache/sessions/jobs/etc.), `kontraktor_spesialisasi` pivot, `project_delays` (model exists, migration lives inside schedules migration file).
- `vercel.json` + Dockerfile coexistence (SPA vs API deploys); `index.html` + `app.blade.php` dual entry shells.

## Wired-but-broken quirks (documented in CONVENTIONS.md)
- SPA calls 3 phantom endpoints: `POST /consultations`, `POST /projects/{id}/owner-confirm-phase`, `POST /projects/{id}/reject-engineering-bid/{bidId}` (real: `reject-engineering-hire`).

## Repo hygiene done
`.gitignore`: added `/.playwright-mcp/`, `!refinement-tests/**` negations (scratch patterns were silently blocking mandated test dir). `.dockerignore`: dropped stale GEMINI.md, added docs/. Local rm: `.playwright-mcp/`, `scratch/`, tmp scripts, empty sqlite. Docs moved into `docs/`. Storage disk renamed supabase→railway (see CLEANUP-LOG deploy note).
