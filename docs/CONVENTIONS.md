# Conventions

## Authentication
- Sanctum bearer tokens only. Login/register/logout/me live in `Api\AuthController`. SPA stores token + profile in localStorage (hardening backlog: `docs/audits/security.md` F1).
- Password resets: `AuthController@forgotPassword` builds broker tokens and mails via `Mail::raw` (Resend). The `ResetPasswordNotification` class is referenced by a `User` override but currently dormant.

## Authorization patterns
- Route-model bindings are NOT auto-scoped. Every controller method must verify participation explicitly:
  - Owner check: `$project->user_id === $user->id`
  - PM check: `$user->role_type === 'project_manager' && $project->pm_id === $user->id`
  - Hired-pro checks compare the role's profile id against `selected_<role>_id`
  - Trait `App\Traits\HandlesProjectAuthorization` exposes `isProjectOwner`, `isHiredProfessional` and `authorizeProjectAccess`, and is used by 17 classes — prefer it for new endpoints. Most controllers still hand-roll the same three checks; migrating them is the standing security task.
- **Nested resources must re-scope children**: `$project->termins()->findOrFail($id)` style, never global `findOrFail`. Past IDOR audits show this was the #1 recurring bug (`docs/audits/security.md`). Route-model binding is NOT auto-scoped, so any `{child}` route must re-assert `$child->project_id === $project->id` explicitly.
- Admin routes sit behind the `admin` middleware alias; verification documents use field-allowlist + 5-minute presigned URLs (`SecureVerificationDocumentController`).

## API responses
- Resources in `app/Http/Resources/*` guard every relation with `whenLoaded()` — do not add implicit loads.
- Public/prospective surfaces must serialize through sanitization (`PublicProfessionalController` strips email/2FA; bank fields still leak in some spots — audit M18/H7).
- JSON errors guaranteed for `api/*`; return `response()->json(['message' => …])` with proper codes, not exceptions with HTML.

## Money & state transitions
- Validate amounts server-side with explicit bounds (`numeric|min:0|max:…`); derive paid amounts from DB rows, never payloads.
- Percentage termin splits must sum to exactly 100 (existing code enforces ±0.01 tolerance — replicate it).
- Multi-row financial writes belong inside `DB::transaction` with `lockForUpdate` on contested rows (the project row is the one that matters — it is the escrow ceiling). There are now ~35 `lockForUpdate` call sites across 10 files; new payment code MUST add guards (audit findings H1–H6).
- **One budget formula.** `projects.budget` is the escrow CEILING; `available = ceiling − SUM(payment|refund ledger rows)`. That arithmetic lives ONLY in `ProjectFinancialService` (`available()`, `summary()`, `deductBudget()`). Never re-derive it in a controller, model or component — four divergent copies of this number shipped over 2026-08/09, and owners were shown a figure the server would not honour.
- **Payment states that cannot be walked back**: `paid` and `refunded` are terminal on bids/termin/addendums. Re-charging a refunded payment is the double-spend vector `deductBudget`'s dedupe cannot catch (the original ledger row still exists), so both `verifyProof` and `markPaid` refuse it explicitly.
- **Proof gate**: `verifyProof` requires `payment_proof_path` AND `status/payment_status = 'verifying'`. A payee must never be able to accept a payment the payer never attempted.
- **Dispute freeze**: any new payment-moving endpoint must call `app(DisputeService::class)->assertNoOpenDispute($project)` (throws 422) before writing money state. Existing hooks: `PaymentVerificationService::uploadProof/verifyProof` (skipped only via `$adminOverride` for `release_payment`) and `ProjectBudgetController::markPaid` (inside try so the 422 message reaches the client).

## Caching & invalidation
- Tag-aware caches fall back gracefully when driver lacks tags (see `ClearsProfessionalCache` trait pattern). Invalidate on write: professional listings (600 s), admin stats, house/material listings, rating aggregates (per-professional keys with model-hook invalidation).
- Chat unread counters: Redis get/increment/forget mirroring DB truth.

## Uploads
- Images convert to WebP through `ImageService` (GD); avatar flow dispatches `ConvertImageToWebpJob::dispatchSync`.
- Validation floor for any new upload: explicit `mimes:` list (never bare `image` — SVG slips through) + `max:` KB. Store names are server-generated; never trust `getClientOriginalName` for paths.
- Choose disk deliberately: user-visible media → `public`; contracts/KYC/anything private → `railway`.

## Frontend
- Axios instance configured in `resources/js/bootstrap.js` (base URL from `VITE_API_URL`, auth header injection, GET retry/5-min cache for contractor-subspecialties).
- Role gating client-side is UX only — every privileged action must have its server-side check (verified true as of last audit; keep it that way).
- Escape any string interpolated into non-React DOM sinks (`esc()` helper in FinalHandover.tsx / print windows).
- Heavy tab modules lazy-load under `DashboardTabs.tsx`; keep chunks lean, don't add static imports of rarely-used screens.

## Known gaps / phantom endpoints (verified 2026-09-22)
- All previously-phantom SPA callers are resolved: `POST /consultations` + `GET /consultations` + `/respond` exist (`ConsultationController`), `POST /projects/{id}/reject-engineering-bid/{bidId}` exists (`ProjectEngineeringController::rejectEngineeringBid`), and the `owner-confirm-phase` caller was removed.
- Endpoints deliberately routed but still without SPA consumers are tracked in `docs/API_MAP.md` → "Reserved / future-facing".
- Deferred product work + refinement backlog: `docs/BACKLOG.md`.
- Full security/performance debt lists: `docs/audits/`.
