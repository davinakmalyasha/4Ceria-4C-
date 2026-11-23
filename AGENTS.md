# AGENTS.md

Entry point for agents and contributors. The code is the source of truth;
`docs/` explains it.

## What this is

**4Ceria Portal** — a construction-coordination and real-estate marketplace.

- **API**: Go 1.27 in `cmd/gateway`; every route is declared in
  `routing/routes.yaml` and registered in `cmd/gateway/main.go`.
- **Frontend**: Next.js 16 App Router in `web/`; a standalone build.
- **Database**: PostgreSQL only. Auth, tokens and roles live there too.
- **Files**: local disk with HMAC-signed URLs, or S3-compatible storage.
- **Money**: exact integer minor units; the ledger lives in PostgreSQL.

There is no MySQL, no PHP and no mobile app. The PWA is the mobile surface.

## Commands

```bash
# Database: create with C collation, migrate, load the demo seed
node tools/db/reset-demo.mjs

# API
go run ./cmd/gateway --addr=:8099

# Local stdio MCP server (public tools; add -user 42 for account scope)
DATABASE_URL=... go run ./cmd/ceria-mcp

# Web
cd web && npm ci && npm run dev     # :3000; API_ORIGIN defaults to 127.0.0.1:8099

# Checks
node scripts/verify.mjs             # gofmt, vet, go test, policy, tsc, next build
node scripts/verify.mjs --db        # plus PostgreSQL from scratch + DB tests
cd web && npx tsc --noEmit
cd web && npm run build
```

## Critical traps

1. **Money is integer minor units.** Never use floats for money. Escrow
   arithmetic lives in `internal/domain/money` and `internal/domain/escrow`.
2. **Every payment path checks for an open dispute.** The escrow service's
   `FreezeGate` is the gate; skipping it leaves payments unfrozen.
3. **`projects.pm_id` stores a profile id** (`project_managers.id`), like the
   other `selected_*` columns. Never compare it with a user id.
4. **Timestamps are UTC.** The pool pins every session to UTC. A wall clock
   read in the server's local zone shifts every instant.
5. **The route manifest is the contract.** Add a route to
   `routing/routes.yaml` and its handler in the same change; the router answers
   a deliberate 501 for a manifest route with no handler.
6. **Identity is PostgreSQL-native.** `internal/httpapi/authpg.go` owns token
   auth. Tokens are opaque and stored as SHA-256 hashes; there is no external
   identity service or database driver in the runtime.
7. **File paths go through `safeStorageJoin`.** A client filename is a label,
   never a path. Uploads are stored under a random name with a sanitised
   extension.
8. **API responses are never cached.** `writeJSON` sets `no-store`; public
   GETs opt in through `writeJSONPublic`. The service worker must never cache
   `/api/*` or `/storage/*`.
9. **Rate limits are scoped.** Anonymous routes key on the address, signed-in
   routes on the user id; `X-Forwarded-For` is trusted only from
   `TRUSTED_PROXIES`.
10. **Next 16 differs from older Next.** Read the relevant guide in
    `web/node_modules/next/dist/docs/` before changing App Router behavior.
11. **Working-tree CRLF is a Windows checkout artefact.** The committed blobs
    are LF. Run `gofmt -w` and keep the diff minimal.
12. **No credentials in the seed.** `db/postgres/seed.sql` ends with
    `DELETE FROM personal_access_tokens`; never commit real tokens or keys.
13. **Agent tools are read-only.** `internal/ai/tools.go` and the MCP server
    must never grow a money, bid, contract or dispute write. Those actions go
    through the normal API and its `FreezeGate`.
14. **Memory is per user.** Every `ai_memories` query is scoped by `user_id`;
    deleting a chat cascades its derived memories. Never add a cross-user
    memory search.

## Working rules

- Never commit without explicit owner instruction.
- Prefer a migration over editing an existing one; migrations are forward-only.
- A money change needs a test in `internal/` and a look at `docs/MONEY.md`.
- Test/scratch scripts at the repository root are named `debug_*.mjs`,
  `verify_*.mjs`, `seed_*.mjs`; they are ignored by git.
- Update this file when a command or trap changes.

## Where things are

| Area | Location |
|---|---|
| API handlers | `internal/httpapi/` |
| Route manifest | `routing/routes.yaml` |
| Domain and money | `internal/domain/`, `docs/DOMAIN.md`, `docs/MONEY.md` |
| Assistant, memory, skills, MCP | `internal/ai/`, `cmd/ceria-mcp/`, `docs/AI.md` |
| Auth and uploads | `docs/ARCHITECTURE.md`, `docs/API.md` |
| PostgreSQL schema | `db/postgres/migrations/`, `db/postgres/seed.sql` |
| Demo reset | `tools/db/reset-demo.mjs` |
| PWA | `web/public/sw.js`, `web/public/manifest.webmanifest` |
