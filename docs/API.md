# API

The manifest at `routing/routes.yaml` is the contract: **320 routes**, with
their methods, auth class, throttle, and the handler the gateway registers.
`NewRouter` fails the build when a manifest route has no handler.

## Conventions

- JSON in, JSON out; `Content-Type: application/json`.
- A successful write usually answers `{"message": "...", ...resource}`.
  A list answers `{"data": [...], "links": {...}, "meta": {...}}`.
- Validation is `422`:
  `{"message":"The given data was invalid.","errors":{"field":["..."]}}`.
- Auth failures are `401 {"message":"Unauthenticated."}`; authorization
  failures are `403`; a missing row is `404`.
- Pagination is `?page=N&per_page=N`; several public lists cap `per_page`.
- Timestamps are UTC ISO-8601 strings. Money is decimal text, not a float.
- Every response carries `X-Request-ID` (client-supplied or minted).
- JSON responses are `Cache-Control: no-store` unless a public GET opts into
  a 60-second cache and ETag.
- The coarse API limit is 300 requests/minute per caller; routes may declare a
  stricter limit (`login` is 10/minute).

## Authentication

`POST /api/login` returns a Sanctum-style token (`id|plain`). The browser
never sees it: the Next server stores it in an httpOnly cookie and attaches it
server-side. Direct clients send `Authorization: Bearer <token>`.

Tokens are stored as SHA-256 hashes, expire after 48 hours by default, and are
revoked by `POST /api/logout`. Password reset tokens expire after 60 minutes.

## Route groups

| Prefix | What |
|---|---|
| `/api/auth` (`login`, `register`, `logout`, `forgot-password`, `reset-password`) | identity |
| `/api/me`, `/api/me/*` | profile, avatar, payout details, analytics, export |
| `/api/projects`, `/api/projects/{project}/*` | workspace, bids, budget, milestones, payments, documents, disputes |
| `/api/houses`, `/api/rooms`, `/api/questions` | property marketplace |
| `/api/arsitek`, `/api/kontraktor`, `/api/interior`, `/api/notaris`, `/api/project-manager`, `/api/structural-engineers`, `/api/mep-engineers` | professional directory |
| `/api/marketplace/*`, `/api/merchant/*`, `/api/material-*` | suppliers, catalogue, quotes, orders |
| `/api/logistics/*`, `/api/delivery-jobs` | courier Job Radar |
| `/api/conversations`, `/api/notifications` | inbox and preferences |
| `/api/firms`, `/api/firm-members` | firm workspace |
| `/api/admin/*` | moderation, verification, disputes, exports |
| `/api/ai/*` | assistant status, sessions, chat, SSE stream |
| `/storage/{path}` | uploaded bytes (signed or public) |

`GET /internal/routes` returns the route table for tooling. It is loopback-only
unless `INTERNAL_ROUTES_TOKEN` is set, in which case send
`X-Internal-Token`.

## Server-Sent Events

`POST /api/ai/chat/stream` answers `text/event-stream`. Each event is
`data: {...}` followed by a blank line:

```text
data: {"session_id":"…"}
data: {"delta":"…"}
data: {"done":true,"refused":false}
```

An upstream failure always ends with `{"error":"…"}` followed by a terminal
`done` event. The response logger delegates `Flush`, so events are not
buffered.

## Uploads

Multipart bodies are capped at 80 MB by the gateway; JSON at 2 MB. A file's
extension is sanitised to 1–8 alphanumeric characters and the stored name is
random. `POST /api/upload` accepts `folder=project_assets|design_briefs` and
returns `{url, path}`.

Every rendered upload URL is a `/storage/...` path. Public prefixes are
world-readable; private prefixes require a signed `expires`/`sig` query or a
signed-in caller. The Next app proxies `/storage/*` and attaches the session.

## Errors you can rely on

| Status | Body |
|---|---|
| 401 | `{"message":"Unauthenticated."}` |
| 403 | `{"message":"This action is unauthorized."}` or a specific message |
| 404 | `{"message":"API endpoint not found.","path":"/api/…"}` for an unknown API path |
| 422 | validation bag or a business message |
| 429 | `{"message":"Too Many Attempts."}` + `Retry-After` |
| 500 | `{"message":"Server Error"}` (no exception detail) |
