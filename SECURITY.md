# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately rather than opening a public issue.
Include a reproduction path, the affected endpoint or component, and the impact
you believe it has.

Disclosures are triaged in order of blast radius against real user data or real
money. Money paths (escrow, termins, dispute arbitration, withdrawals) are
treated as critical.

## Scope

In scope: the Go API (`cmd/gateway`, `internal/httpapi`), the Next.js app
(`web/`), the storage configuration, and anything that can read or move money
or personal data.

Out of scope: findings that require an already-compromised host, a malicious
database administrator, or physical access to a developer's machine.

## Security posture, honestly

These are the controls that are real, and the limitations that are known.

### What is in place

| Control | Where |
|---|---|
| Session token never reaches browser JavaScript | `web/lib/session.ts` stores the Sanctum token in an httpOnly cookie; server components attach it |
| Server-side authorization | every handler re-asserts project participation; admin routes run the admin gate before the handler |
| Private object storage | contracts, KYC, receipts and dispute evidence live in the private store, served through presigned URLs |
| Payment forgery chain closed | minting a payment stage and self-verifying it is blocked by independent guards, with tests |
| Dispute freeze | an open dispute blocks payment-moving endpoints with 422 |
| Rate limiting | per-route throttles on auth, plus a global limiter |
| Token revocation | tokens are revoked when an account is suspended |
| JSON-only errors | unmatched `/api/*` paths answer JSON 404, so a renamed endpoint cannot be mistaken for a page |
| Secret scanning | gitleaks over full history, plus a VAPID-private-key guard |
| Supply-chain pinning | every CI action is pinned to a commit SHA and every image to a digest |
| UTC everywhere | sessions and the ETL are pinned, so token expiry cannot be shifted by a server's local zone |

### Known gaps

- **MySQL owns identity.** `users`, tokens and roles are read and written
  directly in MySQL (ADR-0018). That is one more datastore to secure and audit
  until the identity port lands.
- **The escape hatch for password reset** is email (Resend). A compromised
  mailbox is account takeover; there is no second factor.
- **Uploaded files are validated by MIME allow-list, not by content
  inspection.** A file that passes the allow-list is stored and served as its
  declared type.
- **The public storage bucket is world-readable by design.** Anything private
  must be placed on the private store; getting that wrong is a data-exposure
  bug, not a hardening item.
- **The git history predates this pipeline.** Pre-rewrite commits contain
  credentials (a Railway API token and old map keys) that were committed before
  secret scanning existed. The CI gate scans the shipped tree; the historical
  values must be revoked, not merely ignored.
