# Conventions

## Authentication

- Sanctum bearer tokens, stored in MySQL (`personal_access_tokens`) and read
  by the Go authenticator. Login, register, logout, password reset and the
  admin role endpoints are the only handlers that touch MySQL.
- `APP_KEY` derives the HMAC used for signed links; it is the same 32-byte
  base64 value the legacy application used.
- Password reset tokens are hashed in the `password_reset_tokens` table and
  delivered through Resend. A reset token is verified against the *instant*,
  with the MySQL session pinned to UTC.

## Authorization

- Route-model binding is not automatic. Every handler re-asserts participation:
  - owner: `projects.user_id == caller.id`
  - PM: resolve the caller's `project_managers` profile and compare it with
    `projects.pm_id` (a PROFILE id)
  - hired professional: compare the role's profile id with `selected_<role>_id`
- Nested resources are re-scoped through the parent. Never `find` a child by
  its own id without asserting `child.project_id == project.id`.
- Admin routes require the admin role; the gate runs after authentication and
  before the handler.
- The freeze gate blocks mutations while a project has a pending termination
  or an open dispute that freezes payments.

## API responses

- A response body is byte-compatible with the legacy PHP encoder: key order,
  number formatting, escaping and float notation are part of the contract.
  `internal/jsonphp` is the encoder; do not hand-build JSON.
- Errors are `{"message": "..."}` with the correct status. Unmatched `/api/*`
  paths answer JSON 404, never HTML.
- Money is an integer in minor units. Never a float, never a formatted string
  in application code — format at the edge.

## Money and state transitions

- Validate amounts server-side; derive paid amounts from ledger rows, never
  from a payload.
- Percentage termin splits must sum to exactly 100 (the legacy tolerance was
  ±0.01; the port keeps it where the contract requires it).
- Multi-row financial writes run in a transaction with `SELECT ... FOR UPDATE`
  on the project row — it is the escrow ceiling.
- **One budget formula.** `available = ceiling − SUM(payment|refund ledger
  rows)`. It lives in `internal/domain/money` and is never re-derived in a
  handler or component.
- `paid` and `refunded` are terminal. Re-charging a refunded payment is the
  double-spend vector the ledger dedupe cannot catch.
- The proof gate requires a proof file *and* `status = 'verifying'`; a payee
  cannot accept a payment the payer never attempted.
- Every payment-moving endpoint checks for an open dispute first.

## Uploads

- Server-generated names only; the client filename is never a path.
- Explicit MIME allow-list per endpoint — never a bare `image` check.
- Public media goes to the public store; contracts, KYC, receipts and dispute
  evidence go to the private store and are served through presigned URLs.

## Frontend

- `web/` is the only frontend. Server components read `API_ORIGIN` at request
  time; do not inline the API URL at build time.
- Role gating in the UI is UX only; every privileged action has a server check.
- Heavy screens are lazy-loaded; do not add static imports of rarely-used
  routes.

## Data

- MySQL enum values are append-only. A new value is appended; an existing
  order is never rewritten (a rewrite is a table rebuild and can abort on a
  row that holds a dropped value).
- PostgreSQL enum types must match the MySQL value lists in order, and
  `spec/enums.yaml` is the recorded source of truth.
- Timestamps are UTC everywhere. PostgreSQL sessions are pinned; the ETL
  reads MySQL walls as UTC.
