# Security

## Reporting

Please report a vulnerability privately through the repository's **Security →
Report a vulnerability** (GitHub Security Advisories). Do not open a public
issue with a working exploit. We aim to acknowledge within three business days.

## Supported versions

The `main` branch is the supported version. This is a portfolio reference
implementation; there is no hosted production instance.

## What is protected

- **Sessions.** Bearer tokens are stored as SHA-256 hashes, never in browser
  JavaScript. The Next server keeps the token in an httpOnly, SameSite=Lax
  cookie; `secure` is enabled in production. A rejected token is cleared
  through `/auth/expire` before the login page is shown.
- **Passwords.** bcrypt cost 12; login and forgot-password paths spend the same
  CPU for an unknown address as for a wrong password. Reset tokens are hashed,
  expire after 60 minutes, are deleted on use and never logged.
- **Authorization.** Every route has an explicit auth class in
  `routing/routes.yaml`; project reads and money mutations check ownership,
  role and dispute state.
- **Money.** Integer minor units, a single ledger writer, a partial unique
  index for deduplication, and a dispute freeze before any money write.
- **Uploads.** Random names, sanitised extensions, `safeStorageJoin`
  containment, per-request body limits. Private files require a signed URL or
  a signed-in caller; the Next app proxies them same-origin.
- **Rate limits.** Scoped by address for anonymous routes and user id for
  signed-in routes; `X-Forwarded-For` is trusted only from `TRUSTED_PROXIES`.
- **Headers.** `nosniff`, `DENY` framing, no-referrer, a permissions policy,
  HSTS when the request is HTTPS, and `no-store` on JSON.
- **Secret scan.** CI runs gitleaks over the shipped tree and asserts no VAPID
  private key is tracked. This is a tree scan, not a full-history scan.

## Known boundaries

- The demo data is intentionally public and the demo password is documented.
- The pre-rewrite history may contain old credentials. Treat any key that ever
  appeared in an old commit as compromised and rotate it; the current tree does
  not use it.
- Local development serves HTTP. Production must terminate TLS at the edge and
  set `TRUSTED_PROXIES` to that edge's CIDRs.
- The seeded storage directory is not committed. A deployed instance must set
  `PUBLIC_STORAGE_ROOT` and `EVIDENCE_DIR` to writable paths (or configure S3).
