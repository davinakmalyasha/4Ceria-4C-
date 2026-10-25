# ADR-0016: Sanctum tokens move to an httpOnly cookie

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The current SPA stores the Sanctum personal access token in `localStorage`
(`resources/js/api.js` injects it as `Authorization: Bearer` per request; `api.js:130-147`
strips it for third-party origins so a presigned storage URL never receives it).

`docs/CONVENTIONS.md:4` records this as a known hardening backlog item. The residual
risk is precise: **any XSS in the SPA is a full account takeover** for a platform that
holds bank transfer instructions, KYC documents and contract signatures.

The rewrite's frontend is Next.js, which introduces a **BFF proxy** — the browser
talks to Next, Next talks to the API. That makes the httpOnly migration natural
rather than a retrofit.

## Decision

**Keep the Sanctum personal access token as the only credential. Move it from
`localStorage` to an httpOnly cookie, and support both bearer and cookie on the API.**

1. **The API accepts both.** Sanctum's `auth:sanctum` guard already accepts an
   `Authorization: Bearer <pat>` header **or** a valid session cookie (stateful mode).
   The existing React SPA keeps working unchanged throughout the rewrite — the bearer
   path is untouched.

2. **The browser holds an httpOnly cookie.** `4ceria_session`, `httpOnly`, `Secure`,
   `SameSite=Lax`, `Path=/`, `Max-Age` = the token's remaining lifetime (2 days idle).

3. **CSRF is double-submit.** A 32-byte random value is issued in a **readable**
   `4ceria_csrf` cookie and returned in the login body. The client sends it as
   `X-CSRF-Token` on every state-changing BFF request; the BFF compares it
   constant-time against the cookie, and also validates `Origin` and `Sec-Fetch-Site`.
   `SameSite=Lax` alone is not a complete defence — a same-site sibling subdomain can
   still POST.

4. **No Auth.js / NextAuth.** The identity provider is Laravel Sanctum, not an
   OAuth/OIDC provider. Auth.js's value — a provider matrix, OAuth callbacks, JWT
   session encoding, adapter plumbing — is irrelevant here. Its cost is a **second
   session format** that must be reconciled with the Sanctum token on every request:
   two sessions, one user, guaranteed drift on expiry, revocation and role changes.

5. **A one-time session exchange**, so **no user is logged out by the migration.**
   On first load, the client reads `localStorage['auth_token']` (if present), posts it
   to `POST /api/session/exchange`, and the Next server validates it against the API's
   `GET /me`. Valid → the session cookie is set and the localStorage token is deleted.
   Invalid → 401, and the client clears it. The endpoint is rate-limited (5/min) and
   removed once no live session can predate it.

6. **Multi-tab sync via `BroadcastChannel`.** The `storage` event does not fire for
   cookies. Logout rotates the CSRF cookie and posts on a `BroadcastChannel`, so other
   tabs redirect immediately — preserving today's behaviour, where it *is* immediate.

## Consequences

### Positive

- **An XSS can no longer steal the token.** The cookie is not readable from JavaScript.
- **The "token leaks to a presigned storage URL" class is structurally impossible** —
  the browser has no token to leak, and the presigned URL is fetched directly by the
  browser with no credential at all.
- **CORS becomes irrelevant.** The browser only ever talks to its own origin. Today
  `config/cors.php` has `supports_credentials => false`, which means browser→API cookie
  auth is currently impossible — the BFF removes the question.
- **The session exchange means zero user disruption**, which is the difference between
  a rewrite people accept and one they resist.

### Negative

- **The session envelope is encrypted with a key** (`SESSION_SECRET`). A leaked key
  means leaked sessions. The key is in the environment, rotated on compromise, and the
  envelope carries only `{uid, role, pat, iat, exp}`.
- **CSRF is a second thing to get right.** Double-submit + `Origin` + `Sec-Fetch-Site`
  is belt-and-braces, and each layer is a small amount of code that can be wrong.
- **`localStorage` is not fully retired** during the transition — the legacy SPA still
  uses it, and the exchange endpoint needs to read it once.
- **The Next server now holds the token**, which means the Next server is part of the
  trust boundary for the API. That is a new surface: a Next.js server-side bug is now
  a token-exfiltration bug.

### Neutral

- **The SPA's 401 handling changes.** Today `api.js:181` does
  `window.location.href = '/login'` — a full page reload that loses SPA state. The
  Next equivalent is `router.replace('/login?next=…')` + `router.refresh()` +
  `queryClient.clear()`. The `next` parameter is validated as a relative path
  (`isSafeNextPath()`, unit-tested) to prevent an open redirect.
- **`/dashboard` is unprotected at the route level today** — the SPA renders the shell
  and the data hook silently no-ops, producing a blank screen rather than a redirect.
  The Next `proxy.ts` redirects properly.
- **Sanctum's token model is unchanged**: opaque 256-bit tokens, SHA-256 hashed at rest,
  revocable, 2-day inactivity expiry, `last_used_at` throttled to one write per five
  minutes. The Go implementation reproduces it exactly.

## References

- `docs/REWRITE-PLAN.md` §6, §9
- `docs/CONVENTIONS.md:4`
- `resources/js/api.js:28-62, :130-147, :181-195`
- `config/sanctum.php:30`
- `app/Providers/AppServiceProvider.php:119` — the Sanctum token model override
