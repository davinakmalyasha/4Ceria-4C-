# Conventions

## Authentication
- Sanctum bearer tokens only. Login/register/logout/me live in `Api\AuthController`. SPA stores token + profile in localStorage (hardening backlog: `docs/audits/security.md` F1).
- Password resets: `AuthController@forgotPassword` builds broker tokens and mails via `Mail::raw` (Resend). The `ResetPasswordNotification` class is referenced by a `User` override but currently dormant.

## Authorization patterns
- Route-model bindings are NOT auto-scoped. Every controller method must verify participation explicitly:
  - Owner check: `$project->user_id === $user->id`
  - PM check: `$user->role_type === 'project_manager' && $project->pm_id === $user->id`
  - Hired-pro checks compare the role's profile id against `selected_<role>_id`
  - Trait `App\Traits\HandlesProjectAuthorization` exists — prefer it for new endpoints.
- **Nested resources must re-scope children**: `$project->termins()->findOrFail($id)` style, never global `findOrFail`. Past IDOR audits show this was the #1 recurring bug (`docs/audits/security.md`).
- Admin routes sit behind the `admin` middleware alias; verification documents use field-allowlist + 5-minute presigned URLs (`SecureVerificationDocumentController`).

## API responses
- Resources in `app/Http/Resources/*` guard every relation with `whenLoaded()` — do not add implicit loads.
- Public/prospective surfaces must serialize through sanitization (`PublicProfessionalController` strips email/2FA; bank fields still leak in some spots — audit M18/H7).
- JSON errors guaranteed for `api/*`; return `response()->json(['message' => …])` with proper codes, not exceptions with HTML.

## Money & state transitions
- Validate amounts server-side with explicit bounds (`numeric|min:0|max:…`); derive paid amounts from DB rows, never payloads.
- Percentage termin splits must sum to exactly 100 (existing code enforces ±0.01 tolerance — replicate it).
- Multi-row financial writes belong inside `DB::transaction` with `lockForUpdate` on contested rows. Today only one codebase-wide `lockForUpdate` exists — new payment code MUST add guards (audit findings H1–H6).

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

## Known gaps / phantom endpoints (documented, not yet fixed)
- SPA calls 3 endpoints that don't exist server-side: `POST /consultations` (Notaris ConsultationModal), `POST /projects/{id}/owner-confirm-phase`, `POST /projects/{id}/reject-engineering-bid/{bidId}` (real route is `reject-engineering-hire`). Fix or remove these callers when touching those features.
- Full security/performance debt lists: `docs/audits/`.
