# ADR-0018: `users` and `personal_access_tokens` stay in MySQL during the transition

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

ADR-0017 gives every table exactly one owner. The question this ADR answers is
*which* tables change owner first.

The obvious candidate for an early move is the identity data: `users`,
`personal_access_tokens`, the Spatie `roles` / `model_has_roles` /
`role_has_permissions` tables, `notifications`, `push_subscriptions`. The Go service
needs to authenticate every request, so the argument for moving them early is that the
Go service then has no MySQL dependency at all.

The counter-argument is specific and strong:

- `users` is the **highest-fanout table in the system**. Every one of the 296 endpoints
  reads it. Moving it moves the *authentication boundary* for all 226 authenticated
  endpoints at once.
- `personal_access_tokens` is the **bearer-token lookup table**. It is read on every
  authenticated request, and it is where the case-sensitivity risk (ADR-0008) would
  land hardest — a case-variant token that stops matching means every request 401s.
- The Spatie permission tables are read by the 7 hand-written `hasRole('admin')` checks
  that stand in for the unused `role:` / `permission:` middleware (the middleware is
  aliased in `bootstrap/app.php:51-53` and used by **zero** routes).

Moving the authentication boundary is the single highest-risk data operation available
in this migration. It is also the one with the least upside: the Go service's MySQL
dependency is a *read* dependency over five tables, which is bounded and cheap.

## Decision

**`users`, `personal_access_tokens` and the Spatie tables stay MySQL-owned for the
entire transition.** They move to PostgreSQL in the **final** cutover (W22), when the
legacy application is retired and the write path changes exactly once, in a rehearsed
window.

**The Go service authenticates against MySQL, read-only**, implementing Sanctum's
semantics exactly:

| Sanctum behaviour | Go implementation |
|---|---|
| Opaque 256-bit token, SHA-256 hashed at rest | Identical. The `personal_access_tokens` table is reused as-is. |
| `last_used_at` written on each use | Written, but **throttled to one write per 5 minutes per token** — the same throttle the Laravel token model override applies. This is the single write the read-only role is granted, and it is rate-limited. |
| Idle expiry (2 days) | Identical. |
| Revocation | `DELETE` on the row. The legacy app's `AdminUserController` suspension path already revokes all of a user's tokens; the Go service honours the same rule. |
| Token abilities | The current implementation issues `*`. The Go service reads the `abilities` column and enforces it, which is a **stricter** behaviour — and is only possible because the tokens are opaque server-side records. |

**The final cutover** moves the five tables in one rehearsed window, with the ETL
running MySQL → PostgreSQL for them, a row-count and checksum verification, and a
rollback that restores the ownership row.

## Consequences

### Positive

- **The highest-risk data operation is deferred to the point where it is a single,
  rehearsed, verified step** rather than something that happens while 19 other slices
  are in flight.
- **The case-sensitivity risk is confined to a known, small read set** and is tested
  explicitly (ADR-0008) rather than being discovered across the whole API.
- **The Go service's MySQL dependency is read-only and bounded** — five tables, one
  throttled write. It is removed at M11.
- **The Spatie tables move with the users**, so the role checks and the token lookups
  flip owner in the same window.

### Negative

- **The Go service has a hard MySQL dependency for ~20 weeks.** If MySQL is down, the
  Go API cannot authenticate a request. This is a real availability coupling and it is
  accepted deliberately.
- **Two identity stores exist during the window.** The legacy app's sessions and the
  Go service's token reads must agree. They do, because they read the same table.
- **The final cutover is the highest-risk single step in the plan** and it lands at
  the end, when attention and budget are lowest. The mitigation is that it is also the
  best-prepared: by then the ETL, the checksum tooling, the rehearsal procedure and
  the rollback are all proven by 19 earlier slices.

### Neutral

- **The Go service needs a MySQL driver in addition to pgx.** One more dependency, one
  more connection pool, one more thing to monitor.
- **The final cutover's window is planned as a maintenance window**, with reads
  served from the mirror while the write path flips.

## References

- `docs/REWRITE-PLAN.md` §4.2, §10
- `docs/adr/0017-table-ownership-not-dual-write.md`
- `docs/adr/0008-collation-per-column-family.md`
- `config/sanctum.php:30`
- `app/Providers/AppServiceProvider.php:119` — the Sanctum token model override
- `bootstrap/app.php:51-53` — the aliased but unused Spatie middleware
