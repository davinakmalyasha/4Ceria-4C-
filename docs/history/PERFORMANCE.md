# Performance

This is the measured record for the JSON-wire, compression, timeout, query
and assistant-turn pass. The microbenchmarks are Go benchmarks; the macro
figures are a seeded gateway behind the normal HTTP server. Numbers below are
medians from `-count=5` on Go 1.27.3, Windows amd64, `GOMAXPROCS=8`.

## JSON wire: v1 custom encoder → `encoding/json/v2`

The API still writes JSON through `internal/jsonwire`, so key order, raw
fragments and the supported type set are unchanged. The engine underneath is
now v2 through a compatibility envelope (`AllowInvalidUTF8`,
`AllowDuplicateNames`, `EscapeForJS`, `PreserveRawStrings`, explicit
`EscapeForHTML(false)`). Floats keep the API's fixed-point spelling.

`internal/jsonwire/compat_test.go` keeps the old encoder as an oracle and
compares bytes across a corpus that includes control characters, invalid
UTF-8, U+2028/U+2029, HTML, floats, nested objects, sorted maps and raw
fragments. `go test ./internal/jsonwire` is the gate.

| Benchmark | Before | After | Change |
|---|---:|---:|---:|
| `MarshalMessage` | 2.6–2.9 µs, 520 B, 14 allocs | 0.99–1.19 µs, 80 B, 3 allocs | ~2.5× faster, 79% fewer bytes |
| `MarshalList50` | 0.87–1.02 ms, 237 KB, 4,043 allocs | 0.11–0.13 ms, 16 KB, 3 allocs | ~8× faster |
| `MarshalList500` | 11.7–12.9 ms, 2.42 MB, 40,457 allocs | 1.08–1.43 ms, 156 KB, 3 allocs | ~9× faster |
| `MarshalNested` | 19.7–21.6 µs, 4.6 KB, 110 allocs | 3.6–5.8 µs, 272 B, 3 allocs | ~5× faster |
| `MarshalRaw` | 0.71–0.85 µs, 184 B, 3 allocs | 0.73–1.0 µs, 104 B, 2 allocs | unchanged / slightly fewer allocs |
| `CompactJSON` | 0.42–0.52 µs, 64 B, 1 alloc | unchanged | not a re-encoder; kept for byte exactness |

Reproduce:

```bash
go test ./internal/jsonwire -bench . -benchmem -count=5 -run '^$'
```

### Decoding: v2 where the streaming path wins

The first measurement decoded with `json.Unmarshal` into `any`: v1 ranged
4–11 µs on a small body and v2 ranged 6–30 µs, with no reliable win. But
request handling decodes from an `io.Reader` with `json.Decoder`, not from a
`[]byte`. On the streaming path the result is decisive on this machine
(`-count=3`, Go 1.27.3, Windows amd64):

| Benchmark | v1 | v2 | Change |
|---|---:|---:|---:|
| `DecodeReaderSmall` (~1 KB map) | ~15.1–15.4 µs, 4,164 B, 36 allocs | ~8.5–9.4 µs, 1,800 B, 28 allocs | ~1.7× faster, 57% fewer bytes |
| `DecodeReaderLarge` (2 MB map) | ~10.5–10.7 ms, 10.49 MB, 51 allocs | ~6.5–8.9 ms, 10.49 MB, 47 allocs | ~1.5× faster |
| `DecodeRequest` (AI body, `Unmarshal`) | ~35.8–38.3 µs | ~33.7–48.7 µs | no reliable win |

`jsonwire.Unmarshal` / `jsonwire.UnmarshalRead` reproduce v1's semantics with
`AllowDuplicateNames(true)`, `AllowInvalidUTF8(true)` and
`MatchCaseInsensitiveNames(true)`. `decode_test.go` requires the same
accepted values, the same case-insensitive matching, the same U+FFFD
replacement for invalid UTF-8, and the same rejection of trailing garbage.
The every-request `requestFields` map path now uses `UnmarshalRead`; the
typed AI decoders stay on v1 (`DecodeRequest` shows no win and they already
parse).

Persisted and signed JSON (contract snapshots, audit documents,
`projectbidsign`, `projectbidsnapshot`, `projectfeewrite` ledger/audit
writes) stays on v1. Changing HTML escaping, invalid-UTF-8 handling, key
ordering or number spelling could invalidate an existing signature; they are
not part of this pass.

## Compression

`internal/httpapi/compress.go` is one middleware, not 277 handler edits. It
buffers until 1 KiB, compresses `application/json`/text/XML/SVG, leaves
`text/event-stream` alone, sets `Vary: Accept-Encoding`, and implements
`Flush`/`Unwrap`. Public ETags are weak because the same identity bytes have
two content codings.

A representative 50-row list body (14,771 bytes) compresses to 635 bytes at
gzip level 5 in the benchmark fixture: **95.7% fewer bytes**. On the live,
seeded `GET /api/houses?per_page=12` response, 8,210 bytes became 2,344 bytes:
**71.5% fewer bytes**. The test `TestCompressionLargeBodyRoundTrips` enforces
round-trip equality and a minimum 4× reduction. The exact ratio depends on
the endpoint and payload.

## Macro check

`tools/bench/loadtest.mjs` runs a keep-alive HTTP loop against the seeded
gateway. On the houses list with 16 concurrent workers, 8 demo users and a
20 requests/second target for 10 seconds:

| Build | Completed | Timeouts | Throughput | p50 | p95 |
|---|---:|---:|---:|---:|---:|
| Before (`38d759c`) | 48 | 16 | 4.4 req/s | 28 ms | 288 ms |
| After | 182 | 0 | 17.9 req/s | 33 ms | 74 ms |
| Now (houses batch + 1-query limiter, anonymous, 4 rps) | 40 | 0 | 3.8 req/s | 27 ms | 33 ms |

Fresh run 2026-11-24 against `4ceria_pgcheck` (seed + 0031), same
16-worker/20 rps recipe: 195 requests, 0 connection errors, p50 18.5 ms on
the 200s — but 167 of the anonymous hits answered 429. That is the
300/minute API ceiling working as designed (one shared anonymous bucket vs
8 per-user buckets in the old recipe), so it is not comparable to the
rows above; the 4 rps row is the like-for-like latency read. The old page
loop held the result-set connection while `houseResource` opened
more connections for each row; at 16 concurrent requests it exhausted the
20-connection pool and stalled. The new loop collects the page first, releases
the batch connection, then enriches. The after p50 is a little higher because
it includes gzip compression of the 8 KB response; it completes every request
and its tail is much shorter.

Admin stats and the owner's project list were also measured at 4 requests/
second; both were within a few milliseconds of the old build. Their wins are
query count and bytes, not CPU on a local database. A larger dataset is the
honest way to measure those, and is the next step before adding indexes.

## Query round trips

| Path | Before | After |
|---|---|---:|
| `GET /api/admin/stats` | 6 queries | 1 query |
| Project budget summary | 3 sums | 1 query |
| Houses list count + page | 2 round trips | 1 batched round trip |
| Projects list count + page | 2 round trips | 1 batched round trip |
| AI turn setup | 5 queries (session, quota, memory + append/history) | 3 (turn state, append, history) |
| `LoadTurnState` (session + quota + memory) | 3 queries | 1 query |
| `GET /api/ai/status` | 4 queries | 1 query |
| `GET /api/ai/memory` | 3 queries | 1 batched round trip |
| Admin projects list | 64 queries | 9 queries |
| Admin users list | 59 queries | 2 queries |
| Admin houses list | ~17 queries | 3 queries (count+page batch + owners batch) |
| Admin professionals queue | 15 + 3N queries | ≤ 25 (17 observed on the demo seed) |
| Owner project list | 28 queries for 8 projects | 16 queries; row-invariant at 17 for 40+ rows |
| Public directory (24 rows) | 3–4 per row (~98) | 3–4 total |
| Public houses list (12 rows) | 3 + N per row (~60: pics, owner, rooms, room pics) | 6 total (count+page batch + pics, owners, rooms, room pics); guests skip phones |
| Conversations inbox | 5 per chat (~500 for 100) | 5 total; page query is a `UNION ALL` of the two single-leg index scans (no `OR` seq scan) |
| Limiter headers | `Allow` transaction + second `Remaining` count per gated hit | `Allow` returns the remaining budget from the same read; one transaction per hit |
| AI scoped tools | 7-table `UNION ALL` per tool call (multiplied by `MaxLLMCalls`) | one `UNION ALL` per user per turn via `ProfileCache` (`NewProfileCache` per runner) |
| Admin export (5,000 rows) | 4 correlated subqueries per row, whole CSV buffered | one `GROUP BY` + `LATERAL` open-dispute query, rows streamed with `Flush` |
| Marketplace suppliers | 4 per supplier | 4 total |
| Marketplace materials | 3 per material | 4 total |
| Material orders index | 7–8 per order, unbounded | 10 total for 25+ rows |
| Retention sweep prechecks | 3 per expired project | 3 grouped queries + transactions |
| Background sweeps (retention, auto-complete, snags, prune, mail, push) | unmeasured | `duration_ms` + counts in every sweep log |
| AI memory preload in a tool loop | 1 search per model call | 1 search per turn |

`TestStatsHandlerIsOneQuery` and `TestProjectBudgetSummaryIsOneQuery` use a
`pgx.QueryTracer` plus a `BatchTracer` and fail if the count regresses. The
batch tracer matters: `queryCountAndRows` sends count+page in one `SendBatch`,
which the query tracer never sees. Without it the admin lists undercounted by
two (admin houses read 1 instead of 3). The same tracer pins every
list above, plus a row-invariance test (`TestProjectsHandlerQueryCountIsRowInvariant`)
that requires the owner list to stay flat when the project count grows fivefold.
`TestAdminBatchLoadersMatchSingles` proves the batched user, role,
project-model, profile, bid and ledger loaders serialize exactly the same
bytes as the single-row loaders they replaced; the conversations, directory,
marketplace, material-order and professionals paths each have their own
byte-equivalence test against the per-row builder.

On the 50k-user/50k-project dataset the admin projects response dropped from
448 ms to 158 ms and admin users from 53 ms to 12 ms (one warm request each,
same process host, same database). The JSON bodies were byte-identical except
for the request-derived port in pagination URLs.

### How the remaining fan-outs were closed

- **Owner project list (28 → 16).** `projectPayoutDestinations` ran 1–2 queries
  per hired role per project. A `listBundle.payouts` map is built from one
  UNION over the seven profile tables plus one user query, behind
  `spec.payouts` and the privileged-viewer check. `clientHistories` collapsed
  three count queries plus a ledger query plus one user query per owner into
  one grouped query plus one user query.
- **Conversations inbox (~500 → 5).** The per-chat user, avatar, unread and
  last-message queries are now one user query, one UNION over the avatar
  tables present, one grouped unread query and one `DISTINCT ON` last-message
  query.
- **Directory (~98 → 3–4).** Project counts, users + phones, and notaris
  services are one grouped query each; the count+page is one batched round
  trip.
- **Marketplace.** The double `reviewAggregates` call (avg + count) became one
  grouped review query per page; suppliers, materials and images are one query
  each.
- **Material orders (unbounded → 10).** Supplier, user, project, items,
  materials, review, delivery job and logistics users are each one query; a
  `LATERAL` per order id keeps the delivery-job fallback rule identical.
- **Admin houses.** Owners are now `fullProfileUsersBatch` behind
  `queryCountAndRows`.
- **Admin professionals (15 + 3N → ≤ 45).** Fifteen ID queries run once, one
  `profileModelsBatch` per table present, one user batch, assembled in the
  controller's collection order.
- **Retention sweep.** The blocking-claim, open-dispute and stage prechecks are
  three grouped queries. The per-stage transactions keep `FOR UPDATE` and the
  dedupe re-read — the money boundary is untouched, only the scans are shared.

## Index audit

`0030_perf_indexes.sql` is the result of an `EXPLAIN (ANALYZE, BUFFERS)` pass on
a synthetic dataset (100,000 houses, 50,000 projects, 50,000 users) in a
separate database. The demo seed was too small to make the planner choose
between an index and a sequential scan honestly.

`0031_list_indexes.sql` closes the lists 0030 left behind. The small-scale
`explain.mjs --strict` run already seq-scanned `admin houses` on 1,006 rows;
at 50k+ plan rows `--strict` fails, so every `ORDER BY` below matches its
handler exactly: `house (created_at DESC, id)`, `projects (user_id,
created_at DESC, id DESC)`, `material_orders (user_id|supplier_id,
created_at DESC, id ASC)`, `chat_messages (conversation_id, id DESC)` for the
`DISTINCT ON` last-message query, and `(verification_status, id)` on the seven
professional tables plus `suppliers` for the directory/marketplace pages.
Sweeps stay unindexed by design (infrequent full scans over small sets).

| Query | Before | After |
|---|---:|---:|
| Houses `ORDER BY price LIMIT 12` | 73.4 ms sequential scan + top-N sort | 0.23 ms index scan |
| Admin projects `ORDER BY created_at DESC, id ASC LIMIT 15` | 21.2 ms sequential scan + top-N sort | 0.10 ms index-only scan |
| Admin users `ORDER BY created_at DESC, id ASC LIMIT 20` | 21.1 ms sequential scan + top-N sort | 0.13 ms index-only scan |

- `conversations inbox` (`UNION ALL` two legs): 0.156 ms `Seq Scan` →
  0.229 ms two `Index Scan`s + `Append` on the 501-row fixture
  (`conversations_user_one_last_message_idx`,
  `conversations_user_two_last_message_idx`). Slower on 501 rows, flat by
  per-user set instead of linear in table size; kept for the shape, not the
  0.07 ms.
- `conversation unread counts`: 51.72 → 1.18 ms (`chat_messages_conv_id_idx`).

Full-scale run, 100,006 houses / 50,008 projects / 50,019 users
(`seed-perf.mjs` with the flags above, `explain.mjs --compare-indexes
--strict`, 2026-11-24, `perf.json` gitignored). One warm request each,
same host, same database. `--strict` passes; remaining sequential scans
are on relations under the 50,000-plan-row gate or on `expectIndex: false`
sweeps.

| Query | Before (ms) | After (ms) | Sequential scans after |
|---|---:|---:|:--|
| Houses newest feed | 5.17 | 0.39 | - |
| Houses price sort | 213.96 | 2.02 | - |
| Admin houses | 116.11 | 2.55 | - |
| Admin projects | 69.45 | 0.54 | - |
| Admin users | 86.28 | 0.82 | - |
| Admin professionals pending | 0.85 | 0.36 | - |
| Directory page | 0.21 | 0.14 | - |
| Marketplace suppliers | 58.69 | 0.46 | suppliers(451) |
| Material orders by buyer | 2.73 | 0.64 | - |
| Material orders by supplier | 3.11 | 1.76 | - |
| Conversations inbox | 0.81 | 0.49 | conversations(501) |
| Conversation last messages | 6.25 | 1.33 | chat_messages(2505), conversations(501) |
| Conversation unread counts | 51.72 | 1.18 | chat_messages(501), conversations(501) |
| Owner projects | 15.15 | 0.73 | - |
| Retention candidates | 65.77 | 55.89 | projects(2500) |
| Auto-complete candidates | 7.46 | 3.33 | material_orders(712) |
| Snag escalation candidates | 0.12 | 0.10 | project_snag_items(0) |
| Prune notifications | 75.23 | 45.72 | notifications(50043) |
| Prune expired tokens | 2.30 | 0.85 | personal_access_tokens(1000) |
| Prune rate limits | 40.09 | 19.50 | - |

The default houses feed already used `house_is_suspended_created_at_index`
(0.11 ms on the same dataset), and the owner-scoped project list used
`projects_user_id_status_index`; neither needed a new index. The new indexes
are `house (is_suspended, price)`, `projects (created_at DESC, id ASC)` and
`users (created_at DESC, id ASC)`.

## Reproducible perf harness

The 100k-row audit above was ad hoc. It is now a script:

```bash
node tools/bench/seed-perf.mjs --database=4ceria_perf \
  --houses=100000 --projects=50000 --users=50000
node tools/bench/explain.mjs --database=4ceria_perf
node tools/bench/explain.mjs --database=4ceria_perf --compare-indexes
node tools/bench/explain.mjs --database=4ceria_perf --strict --json=perf.json
```

`seed-perf.mjs` refuses any database whose name does not start with
`4ceria_perf` (the demo and verification databases are never touched),
recreates it, applies every migration and the seed, then inserts deterministic
synthetic rows: clients, per-role professionals, suppliers, couriers, houses,
projects with all seven hired roles, bids, termins, ledger rows, materials,
orders with items and reviews, conversations with five messages each,
notifications, mail, rate-limit hits and tokens, followed by `ANALYZE`.

`explain.mjs` runs the exact `EXPLAIN (ANALYZE, BUFFERS)` list and sweep
queries (houses feed and price sort, admin lists, directory, marketplace,
orders, inbox, owner projects, retention/auto-complete/snag/prune candidates)
and prints node type, time, rows and sequential scans. `--compare-indexes`
drops the three `0030` indexes, measures, recreates them and shows the delta.
`--strict` fails only when a query that should be index-backed still
sequential-scans a relation over 50,000 plan rows — timings never gate a
check, plans and query counts do.

## Timeouts

- Multipart uploads get a per-response read deadline:
  `30s + ContentLength / 128 KiB seconds`, capped at 30 minutes. That covers
  an 80 MB upload on a slow 1 Mbps client without weakening the 10s header
  timeout or the 2 MB JSON cap.
- The AI SSE response extends its own write deadline to 3 minutes. The server
  default remains 30s, and the AI turn itself remains capped at 120s.
- Tests cover the deadline arithmetic, the middleware reaching the real
  writer through compression, and a real server whose 150ms `WriteTimeout`
  would otherwise cut a delayed SSE chunk.

## What changed in behaviour

- Public JSON ETags are weak (`W/"…"`). This is required for correctness once
  the same identity bytes can be sent with gzip; `If-None-Match` accepts both
  forms.
- A `Raw` value embedded inside a response has insignificant whitespace
  compacted by the v2 encoder. The JSON meaning and key order are unchanged.
  A top-level `Raw` is still returned byte-for-byte.
- Persisted and signed JSON (contract snapshots, audit documents) stays on
  `encoding/json` v1. Changing those bytes could invalidate an existing
  signature; they are not part of this pass.

## Frontend

`npm run analyze` (`web/scripts/bundle-report.mjs`) reports first-party JS
after `npm run build` with no new dependencies. Latest production build:
**1,212.2 kB across 39 chunks**, root main **432.8 kB**, largest chunk
223.7 kB, **gzip ~384.6 kB**. The budget is 2,048 kB total first-party JS; the check fails above
it. The eight `framer-motion` docs widgets load via `next/dynamic` with
`ssr: false`, and the 18 below-fold dashboard panels load via `next/dynamic`
with SSR preserved (first paint stays the awaited data), so the shells never
pay for panels the active tab does not render (29 → 39 chunks, largest
276.5 → 223.7 kB, second-largest 165.5 → 155.8 kB). `Plus Jakarta Sans`
is self-hosted through `next/font/google` (no render-blocking Google stylesheet,
no external font request); the CSP no longer allowlists `fonts.googleapis.com`
or `fonts.gstatic.com`. `experimental.optimizePackageImports: ['lucide-react']`
rewrites the 40-file barrel import into per-icon paths. The six static
`Logo4C` instances carry `width`/`height` matching their classes (no CLS
reserve gap); remote/dynamic images keep fixed-size wrappers. Lighthouse stays a
manual check against `next start` (mobile profile, median of 3 runs); the service worker never caches `/api/*` or `/storage/*`.

## Commands

```bash
go test ./internal/jsonwire -bench . -benchmem -count=5 -run '^$'
go test ./internal/ai ./internal/httpapi -count=1
DATABASE_URL=... go test ./internal/ai ./internal/httpapi -count=1
node scripts/verify.mjs --db
PGHOST=127.0.0.1 PGPORT=55432 node tools/bench/seed-perf.mjs --users=1000 --houses=2000 --projects=1000
PGHOST=127.0.0.1 PGPORT=55432 node tools/bench/explain.mjs --database=4ceria_perf_smoke
cd web && npm run analyze
```

## Costs left in place

- `Authenticate` writes `last_used_at` on every authenticated request
  (`internal/httpapi/authpg.go`). Sampling it would cut a write per read but
  weakens the audit trail; unchanged.
- `writeJSON` buffers the full body for `Content-Length` before compression.
  Streaming would halve peak bytes on 5,000-row lists but breaks the
  header-time gzip decision and ETag path; unchanged.
- `SearchMemory` keeps the `ILIKE '%q%'` fallback beside `content_tsv`.
  Removing it would speed the miss path but change recall; unchanged.
- Public `explore/houses/help` stay `no-store`; no caller passes
  `revalidateSeconds` yet (`lib/api.ts` supports it). ISR is a product
  decision, not yet taken.
- Sweeps stay unindexed (`expectIndex: false`); the full-scale table above
  is the baseline if sweeper `duration_ms` ever requires it.
