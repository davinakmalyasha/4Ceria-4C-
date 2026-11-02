# API map

The single source of truth is [`routing/routes.yaml`](../routing/routes.yaml):
every method, path, route id and middleware tier the gateway serves. The
gateway loads that file at startup, and `TestEveryRouteIsRegistered` fails if a
manifest route has no handler.

This page is a navigational summary by domain.

## Public (no auth)

| Group | Endpoints |
|---|---|
| Auth | `POST /register`, `POST /login`, `POST /forgot-password`, `POST /reset-password` |
| Houses | `GET /houses`, `GET /houses/{house}`, Q&A |
| Professional directories | `GET /arsitek`, `/kontraktor`, `/interior`, `/notaris`, `/project-manager`, `/structural-engineers`, `/mep-engineers` |
| Materials marketplace | `GET /marketplace/materials`, `GET /marketplace/suppliers(/{id})` |
| Geocode proxy | `GET /geocode/reverse`, `GET /geocode/search` |
| Share-token brief | `GET /brief/{token}` (budget stripped) |

## Authenticated

**Profile/me** — `GET/PUT /me`, avatar, portfolios, verification uploads,
notification preferences.

**Projects** — index/show/store/update/destroy; bids matrix (submit,
shortlist, accept, decline); fee negotiation; contract signing; planning and
brief gates; phase lifecycle; mutual termination and freeze; disputes;
project-manager bidding; milestones; comments; document vault; daily logs;
payment termins and proof upload/verification; engineering logs; proof of
transfer; handover and BAST; snag items; change orders; timeline extensions;
warranty claims; resourcing; share tokens; reviews; activity feed; reports;
scheduling; BOM requirements; budget and finance; addenda; sub-professionals.

**Marketplace** — materials, suppliers, orders, quotes, delivery, merchant
inventory.

**Chat** — conversations, messages, unread counters.

**Admin** — users, stats, verification queue, project force-termination,
dispute arbitration.

**Logistics** — couriers, shipments, delivery documents.

## Errors

Every response is JSON. Unmatched `/api/*` paths answer a JSON 404 — never the
frontend's HTML — so a renamed endpoint is visible instead of being mistaken
for a successful page load.
