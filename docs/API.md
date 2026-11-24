# API

The manifest at `routing/routes.yaml` is the contract: **325 routes**, with
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

`POST /api/login` returns an opaque token in the `id|plain` form. The browser
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
| `/api/ai/*` | assistant status, sessions, chat, SSE stream, long-term memory |
| `/api/mcp` | read-only MCP (Model Context Protocol) tools for external agents |
| `/storage/{path}` | uploaded bytes (signed or public) |

`GET /internal/routes` returns the route table for tooling. It is loopback-only
unless `INTERNAL_ROUTES_TOKEN` is set, in which case send
`X-Internal-Token`.

## Server-Sent Events

`POST /api/ai/chat/stream` answers `text/event-stream`. Each event is
`data: {...}` followed by a blank line:

```text
data: {"session_id":"…"}
data: {"tool":"search_houses","status":"started"}
data: {"tool":"search_houses","status":"completed"}
data: {"delta":"…"}
data: {"replace":"…"}
data: {"done":true,"refused":false,"tools":["search_houses"]}
```

`delta` appends; `replace` replaces the streaming bubble when the final
answer differs from the accumulated chunks. A client must buffer across
network reads: a frame can be split between two chunks. An upstream failure
ends with `{"error":"…"}` followed by a terminal `done` event. The response
logger delegates `Flush`, so events are not buffered. The stream is never
gzip-compressed and extends its own write deadline to three minutes.

## Compression and caching

API responses are gzip-compressed when the caller sends
`Accept-Encoding: gzip`, the body is at least 1 KiB, and the content type is
compressible. Compressible responses carry `Vary: Accept-Encoding`; SSE is
excluded. Public GETs (`houses`, directories, geocode) use a weak ETag
(`W/"…"`) and `Cache-Control: public, max-age=60` (300 for geocode);
authenticated responses remain `no-store`.

## Assistant memory

`GET /api/ai/memory` returns `{enabled,count,data:[{id,kind,role,content,created_at}]}`.
`PUT /api/ai/memory` toggles memory with `{enabled:true|false}`.
`DELETE /api/ai/memory` clears every row; `DELETE /api/ai/memory/{id}` removes
one. All four are scoped to the authenticated caller; a row from another
account is a 404, not a leak.

## MCP

`POST /api/mcp` is a stateless, authenticated MCP endpoint over the
Streamable HTTP transport. It exposes the same read-only catalog as the
assistant (property, directory, materials, platform help, and the caller's
projects/finance/schedule/bids). It has no write tools. External clients send
the normal `Authorization: Bearer <token>` header. A local stdio client can
use `go run ./cmd/ceria-mcp` instead; see `docs/AI.md`.

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
