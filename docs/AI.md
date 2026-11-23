# Ceria AI

Ceria is the in-product assistant. It is built on **Google ADK v2**
(`google.golang.org/adk/v2`) with a DeepSeek OpenAI-compatible model. This
document is the current design; no part of it depends on a second runtime.

## Shape

```text
POST /api/ai/chat/stream
        │
        ▼
  aiPrepareTurn            validate input, resolve session, quota,
        │                  store the user turn, load recent history
        ▼
  ai.Stream                fresh ADK session for this turn
        │                  ├─ replay last 20 stored turns
        │                  ├─ root agent: ceria_assistant
        │                  ├─ 12 read-only tools
        │                  ├─ skill toolset (embedded SKILL.md files)
        │                  ├─ memory preload + search_memory + remember
        │                  └─ property_scout / project_auditor (agent tools)
        ▼
  SSE: session_id, tool status, delta/replace, done
        │
        ▼
  store assistant turn + sync memory (detached from the request)
```

The **database is the source of truth**. The ADK session is ephemeral: it is
created for one turn, loaded with the last 20 stored turns as replay events,
and discarded. That has three consequences:

- a restart loses no conversation;
- two gateway instances see the same history;
- the transcript is not folded into the user message *and* replayed by the
  session (the old double-context bug).

The session service is in-memory on purpose. It is a prompt-building device,
not a store.

## Tools

All tools are read-only. They cannot move money, place a bid, sign a contract
or file a dispute; those actions stay in the normal API where the escrow
`FreezeGate` and authorization rules live.

| Tool | What it returns |
|---|---|
| `search_houses`, `get_house` | live property listings and one listing's detail |
| `search_professionals` | verified directory rows by role |
| `search_materials` | live materials catalogue |
| `my_projects`, `get_project` | the caller's projects, ownership-scoped |
| `project_finance` | ceiling, paid, committed, available, termins |
| `project_schedule` | milestones, phases, progress, due dates |
| `project_bids` | proposals on a project the caller owns (or admin) |
| `my_bids` | the caller's own proposals |
| `platform_help` | escrow, termins, bids, disputes, warranty, retention, verification, fees, how-to |
| `estimate_budget` | a clearly-labelled IDR range, integer arithmetic |
| `search_memory`, `remember` | the caller's long-term memory, when enabled |

Every handler resolves the caller at request time; there is no cached user or
pooled tool context. Ownership is checked inside the query or by a single
project-parties lookup — never by trusting a model-supplied id.

## Memory

Migration `0029_ai_memory.sql` adds two tables:

- `ai_memories` — one row per stored message, plus explicit notes. A generated
  `content_tsv` column and a GIN index provide search. Every query is scoped
  by `user_id`.
- `ai_memory_settings` — per-user on/off switch. A missing row means on.

After a turn, `SyncSession` copies messages that do not yet have a memory row;
the partial unique index makes this idempotent. Before each model call, the
ADK preload tool searches the user's memory and injects the relevant entries
as **data, not instructions**.

Users can inspect, delete one row or clear everything from the assistant
panel. Deleting a chat cascades to the memories derived from it; explicit
notes survive until the user clears memory. Turning memory off stops both
ingestion and search, but does not delete what is already stored.

The search is PostgreSQL full-text search with the `simple` configuration. It
is deliberately not language-stemmed: the product is bilingual, and an
Indonesian or English stemmer silently drops matches in the other language.

## Skills

`internal/ai/skills/*/SKILL.md` are embedded in the binary and exposed through
ADK's skill toolset. They are instructions, not executable code:

| Skill | Use |
|---|---|
| `project-brief` | turn a vague idea into a complete brief |
| `budget-plan` | hard/soft cost, contingency and termin cash flow |
| `contract-checklist` | SPK review against the project record |
| `dispute-evidence` | timeline, claim and evidence pack |
| `verification-documents` | role-specific verification checklist |
| `property-shortlist` | ranked shortlist and viewing questions |

The model sees the skill list and loads one body only when it matches. There
is no filesystem skill directory at runtime and no uploaded file can become an
instruction.

## Specialists

Two ADK `ModeSingleTurn` agents are exposed to the root as agent tools:

- `property_scout` — search, detail and compare listings;
- `project_auditor` — status, escrow, schedule and proposals.

The root keeps the direct tools, so a failed delegation does not remove a
capability. Set `AI_SPECIALISTS=false` to remove the two agent tools.

## MCP

The same read-only catalog is available over **Model Context Protocol**:

- `POST /api/mcp` — stateless Streamable HTTP, authenticated with the normal
  bearer token, request body capped at 1 MiB, 120 requests/minute.
- `go run ./cmd/ceria-mcp` — stdio transport for local clients. Public tools
  need only `DATABASE_URL`; set `CERIA_MCP_USER_ID` (or `--user`) to enable
  account-scoped tools.

The in-product agent does **not** call its own MCP endpoint. It already has
the tools in-process with the caller's identity attached by the HTTP
middleware; routing through MCP would add a network hop and a second auth path
without a capability. MCP is an external integration boundary.

No MCP tool writes. A client that wants to post a project, bid or pay uses the
normal API and its UI.

## Safety and limits

- Prompt-injection screening before the model, output redaction after it.
- Input cap 4,000 characters (UTF-8-safe), output cap by model config.
- 12 model calls per turn (`AI_MAX_STEPS`, maximum 20).
- 30 messages/minute and 100/day per user, computed from stored turns.
- Tool SQL has an 8-second deadline and inherits request cancellation.
- Tool failures are logged server-side and returned as a generic message; a
  database outage is not presented as "no rows".
- `remember` refuses secrets by instruction; memory is user-visible and
  user-deletable.
- No write tools, so ADK human-in-the-loop confirmation is not needed for the
  assistant's own actions. The UI's write flows are the confirmation surface.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DEEPSEEK_API_KEY` | empty | empty disables the model; history/memory still work |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI-compatible endpoint |
| `DEEPSEEK_MODEL` | `deepseek-flash` | model id |
| `AI_MEMORY` | `true` | operator kill switch for memory |
| `AI_SPECIALISTS` | `true` | expose the two specialist agents |
| `AI_MAX_STEPS` | `10` | model calls per turn (cap 20) |
| `CERIA_MCP_USER_ID` | empty | stdio MCP identity for account-scoped tools |
| `CERIA_MCP_ADMIN` | `false` | stdio MCP admin scope |

## Tests

- `internal/ai/ai_test.go` — guards, UTF-8 caps, numeric formatting, deltas,
  tool catalog.
- `internal/ai/memory_db_test.go` — ingestion, search, user isolation,
  disable/clear (needs `DATABASE_URL`).
- `internal/ai/tools_db_test.go` — PostgreSQL numeric formatting and project
  ownership.
- `internal/ai/skills_test.go` — every embedded SKILL.md parses and matches
  its directory.
- `internal/ai/mcp_test.go` — MCP list/call over the in-memory transport, and
  a check that private tools are absent without an identity.

Run the database suites through the normal gate:

```bash
node scripts/verify.mjs --db
```
