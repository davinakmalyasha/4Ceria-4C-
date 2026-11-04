# AI Assistant (Ceria) — GO ADK v2 + DeepSeek

Ceria is the in-product chatbot: a floating launcher on every dashboard tab
plus a full page at `/dashboard/assistant`. It answers from LIVE platform
data through tools, remembers conversations per user, and never moves money.

## Setup (the only manual step)

Paste the key into `.env` (see `.env.example`):

```bash
DEEPSEEK_API_KEY=sk-...
# Optional — these defaults already point at DeepSeek's current model:
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-flash
```

Then apply migration `0027_ai_chat.sql` (chat history tables) and restart
the gateway. Without the key the chat endpoints answer 503 and history
keeps working; the UI shows an "assistant offline" banner instead of
breaking.

## Architecture

```
browser ──fetch──▶ Next.js BFF (/api/ai/*) ──Bearer──▶ Go gateway
                                                        ├─ internal/httpapi/aichat.go  (auth, quota, sessions, SSE)
                                                        └─ internal/ai/                (ADK agent + tools + store)
                                                            ├─ config.go   env wiring
                                                            ├─ prompt.go   system prompt (4Ceria grounding + safety)
                                                            ├─ guard.go    injection screen, caps, output redaction
                                                            ├─ tools.go    8 read-only function tools (pgx)
                                                            ├─ service.go  ADK runner (openaimodel Chat Completions)
                                                            └─ store.go    sessions/messages/quotas (PostgreSQL)
```

- **Model**: GO ADK v2 (`google.golang.org/adk/v2@v2.7.1`) with
  `openaimodel.APIChatCompletions` — required, because DeepSeek's
  OpenAI-compatible surface is Chat Completions, not the Responses API.
  Model id defaults to `deepseek-flash` (DeepSeek-V4.1-Flash; the legacy
  `deepseek-chat`/`deepseek-reasoner` ids were retired in July 2026).
- **Stateless turns, persistent memory**: each turn builds a fresh agent
  with the caller's scoped tools, folds the last 20 stored turns into the
  prompt (labelled DATA, capped at 12k chars), and appends both turns to
  `ai_chat_messages`. A shared in-memory ADK session service gives
  continuity within a process lifetime; PostgreSQL is the source of truth
  across restarts.
- **Streaming**: `POST /api/ai/chat/stream` answers Server-Sent Events
  (`data: {"delta": ...}` chunks, `data: {"done": true}` at the end) which
  the BFF passes through untouched.

## The 8 tools (all read-only)

| Tool | What it reads |
|---|---|
| `search_houses` / `get_house` | live property listings |
| `search_professionals` | verified directory (7 roles) |
| `search_materials` | materials catalogue |
| `my_projects` / `get_project` | caller's OWN projects (owner or hired-profile scoping) |
| `platform_help` | static escrow/termin/bid/dispute/warranty/retention/how-to knowledge |
| `estimate_budget` | labelled rough cost ranges (never a quote) |

`get_project` refuses other users' private projects with an explanation
instead of data. Nothing in the toolset writes, so the agent cannot move
money, bid, sign, or dispute no matter what it is asked.

## Safety layers

1. **Auth**: every `/api/ai/*` route is `authenticated`; the BFF keeps the
   token server-side.
2. **Rate limits**: manifest `throttle:30,1` on both chat writes, plus an
   application quota from the messages table (30/min, 100/day UTC per
   user; 429 with a plain-language message).
3. **Prompt-injection screen** (`guard.go`): narrow markers for
   instruction-override / roleplay / exfiltration attempts get a fixed
   refusal WITHOUT a model call; ordinary product language ("ignore the
   fee?", "reveal the roof plan") is tested to pass.
4. **System-prompt hardening**: user text, tool output and history are
   declared DATA in both the prompt and the folded transcript; the model
   is instructed never to reveal the prompt, invent ids/prices, or relay
   secrets.
5. **Output redaction**: bearer-shaped strings are scrubbed from replies.
6. **Caps**: 4,000 chars/message, 20 turns of history, 2,048 output
   tokens, 12 model calls/turn, 90–120s turn timeouts.
7. **No PII leakage**: tools never select bank columns, tokens or other
   users' emails; owner contacts follow the platform's own visibility.

## API

```
GET    /api/ai/status                  {enabled, model, quota, daily_quota}
GET    /api/ai/sessions                {data: [{id, title, created_at, updated_at}]}
POST   /api/ai/sessions                {title?} → 201 {data}
GET    /api/ai/sessions/{session}      {data, messages: [{id, role, content, created_at}]}
PUT    /api/ai/sessions/{session}      {title} → {data}
DELETE /api/ai/sessions/{session}      → 204
POST   /api/ai/chat                    {session_id?, message} → {session_id, reply, refused}
POST   /api/ai/chat/stream             same body → text/event-stream
```

Error shapes follow the platform conventions (`{"message": ...}`,
422 validation bags, 404 for foreign sessions — ids are unguessable
UUIDs AND ownership-checked).

## JSON experiment note

GO ADK v2's transitive dependencies (`google.golang.org/genai` →
`cloud.google.com/go/auth`, `gax-go`) import `encoding/json/jsontext`,
which only compiles with Go 1.27's JSON v2 experiment ENABLED. The
gateway therefore builds/tests with the default toolchain (the
`GOEXPERIMENT=nojsonv2` pin was dropped when the assistant landed).
The wire contract is unaffected: every response still goes through the
hand-rolled `internal/jsonphp` encoder (which only uses `encoding/json`
for `json.Valid`), and the full golden suite (`perfect_test.go` et al.)
passes byte-identical under the default experiment — that suite is the
proof, not the flag.

## Costs

One turn = 1 chat-completions call + ≤11 tool-call continuations, capped
at 2,048 output tokens and temperature 0.3. The quotas above bound spend
per user; there is no background or scheduled model traffic.
