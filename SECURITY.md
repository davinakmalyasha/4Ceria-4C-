# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately rather than opening a public issue. Include a
reproduction path, the affected endpoint or component, and the impact you believe it has.

Disclosures are triaged in order of blast radius against real user data or real money. Money
paths (escrow, termin, dispute arbitration, withdrawals) are treated as critical.

## Scope

In scope: the API under `routes/api.php`, the SPA under `resources/js`, the storage
configuration, and anything that can read or move money or personal data.

Out of scope: findings that require an already-compromised host, a malicious database
administrator, or physical access to a developer's machine.

## Security posture, honestly

This section exists because a security posture nobody has stated is a security posture nobody can
evaluate. These are the controls that are real, and the limitations that are known.

### What is actually in place

| Control | Where |
|---|---|
| Argument validation | Laravel form requests plus inline `validate()` on the endpoints that need it |
| Role-based authorization | `admin` middleware, Spatie permissions, per-project participant checks |
| Strict model mode in development | `Model::shouldBeStrict(! isProduction())` in `AppServiceProvider` — lazy-loads and missing attributes are 500s locally instead of silent nulls |
| Private object storage | Contracts, KYC documents, payment receipts, and dispute evidence live on a separate private disk, not the world-readable one |
| Presigned URLs for private files | Served on demand, never by guessable path |
| Shared-cache isolation | Per-user responses bypass the shared cache |
| Payload formula neutralisation | CSV export strips spreadsheet formula injection |
| Secret scanning | `gitleaks` over full history, plus a bespoke VAPID-private-key guard |
| CSP and hardened headers | `vercel.json` for the SPA origin, `SecurityHeaders` middleware for the API |
| Request-scoped auth token | The Sanctum bearer token is attached per request and stripped from any cross-origin URL |
| Token revocation | Active tokens are revoked when an account is suspended |
| Rate limiting | Per-route throttles on auth, plus a global API limiter |
| Payment forgery chain closed | Minting a payment stage and self-verifying it is blocked by three independent guards, with a test |
| Dispute payment freeze | An open dispute makes every payment route on that project return 422 |
| Escrow affordability and double-spend guards | Row lock, single affordability check, and a unique index permitting exactly one payment and one refund per reference |

### Known limitations

These are **not** fixed. They are documented so nobody has to discover them.

1. **No payment gateway; money is not held by the platform.** Escrow here means a *ledger* over
   manual bank transfers with human proof verification. Transfers go directly between client
   and professional. The platform cannot reverse a completed transfer, and the dispute and
   arbitration features allocate money between parties that have not actually been segregated.
   Any statement implying funds are held by the platform is inaccurate.

2. **No idempotency keys on money endpoints.** Replay protection currently relies on payment
   state checks plus a unique index. A future gateway integration must introduce real idempotency
   keys.

3. **The SPA keeps its bearer token in `localStorage`.** Any successful XSS is a full account
   takeover. A CSP is set on the SPA origin, which is mitigation rather than a fix. Migrating to
   `HttpOnly` cookies is the correct remedy and is not done.

4. **`ProjectResource` contains PII gating.** Field-level privacy depends on responses going
   through the resource. An endpoint that returns a project model directly would bypass it. This
   is being moved into a policy.

5. **Authorization is not yet centralised.** Many endpoints perform their own
   `$user->id !== $project->user_id` check inline rather than through a policy. The checks are
   correct where present, but consistency depends on discipline rather than structure.

6. **No rate limiting at the edge.** Throttling is per-application. A distributed client is not
   constrained by it.

7. **Multi-replica migration race.** The container entrypoint runs `migrate --force` on every
   replica start, unguarded. Concurrent replicas can race on DDL. Scheduled tasks are protected
   by `onOneServer()`; the migration call is not.

8. **No observability floor.** There is no request-ID propagation, no structured logging, and no
   error tracker. Incidents are currently detected by users, not by instrumentation.

## Security-relevant configuration

Never commit real values. The CI secret scan will fail the build on a committed key.

| Variable | Why it matters |
|---|---|
| `APP_KEY` | Encrypts sessions, cookies and anything using `Crypt`. |
| `RAILWAY_STORAGE_*` | The private bucket. If these are wrong, KYC documents and receipts can land in a public bucket. |
| `PUBLIC_STORAGE_DRIVER` | `local` in dev, `s3` in prod. |
| `TRUSTED_PROXIES` | `"*"` in production lets any client spoof `X-Forwarded-For` and rotate its own rate-limit bucket. |
| `VAPID_PRIVATE_KEY` | Anyone holding it can push arbitrary notifications to every subscribed user. |
| `DB_URL` / `DB_PASSWORD` | Full database access. |
