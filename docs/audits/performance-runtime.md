# Performance & runtime audit archive — 8-agent sweep (this pass)

## Production correctness (highest value — prod is silently degraded today)
1. **Zero bootstrap caches** in deploy (`docker/entrypoint.sh` only migrates). Fix: `config:cache route:cache view:cache event:cache` in image/entrypoint. All routes are controller-syntax → cacheable.
2. **OPcache disabled** in the php:8.4-fpm-alpine image (`Dockerfile:26–31`); upgrade.md documents the exact ini wanted (`jit=1255`, `validate_timestamps=0`) but nothing applies it.
3. **No gzip** in `docker/nginx.conf` and no Cache-Control for `/build/` (largest chunks ~1.2 MB). Add gzip + `location /build/ { expires 1y; immutable }`.
4. **`public/hot` ships in image** while `public/build` is dockerignored → prod HTML points at a nonexistent Vite dev server. Add `public/hot` to `.dockerignore`; bake assets or redirect `/`.
5. **No queue worker / scheduler** in supervisord → queued notifications never consumed and `app:auto-complete-orders` never fires in prod. Add supervisor programs.
6. **Password reset mail is synchronous** (`AuthController:193–203`, Resend HTTP call inline); `ResetPasswordNotification` has Queueable trait but does NOT implement ShouldQueue.
7. **No pruning scheduled**: notifications (row-per-chat-message!), personal_access_tokens, failed_jobs grow forever; Redis `forever()` unread counters leak on deletion.
8. Vite: no compression plugin (~4.7 MB precache, multi-MB uncompressed transfer); PWA precaches whole bundle graph — limit to app shell + runtimeCaching for chunks.

## Database
Indexes to add (one migration):
- `projects(status, created_at)` — discovery feed currently unindexable (`whereJsonContains` + status IN + latest(50)); long-term: pivot table for published roles instead of JSON membership.
- `projects` selector columns: `selected_arsitek_id/kontraktor/notaris/interior/pm_id/structural_id/mep_id` (equality filters, PM dashboards).
- `conversations(user_two_id)` (+ optional `(user_one_id,last_message_at)`, `(user_two_id,last_message_at)`) — inbox OR-scan.
- `chat_messages(conversation_id, created_at)` — thread sort.
- `notifications(user_id, read_at, created_at)`.
- `material_orders/user_id+created_at`, `supplier_id+created_at`; same pair on `material_quotes`.
- `delivery_jobs(status,created_at)`, `(logistics_id,status)`.
- Bid tables `(pro_id, created_at)` ×7 for my-bids sorts. Unique backstops (also fix business races): `(project_id,<pro>_id)` on bids, `(bid_id,bid_type,round_number)`, ratings dedup triples, `(project_id,reference_model,reference_id)` on budget transactions.
- `house(is_suspended,kab_kota)`.

Unbounded endpoints needing pagination/caps: `GET /projects?all=true` (`ProjectController:302–306`), material orders/quotes index, `my-bids` (7 clones, `toArray` per row), chat inbox (13 eager loads/row, cursor by last_message_at), courier feeds + myJobs, requirement histories, consultations list, public professional directories (whole tables incl. all ratings + project images behind a wholesale-invalidating 600 s cache).

N+1 / hot-path:
- Hire history: phone lookups = 2 queries per hire (add `.phoneNumber` to eager loads); unbounded projects fetch.
- `ProjectResource::budget_summary` → up to ~16 aggregate queries per project-show when bid relations aren't loaded (fallback sums per table); use withSum/single union or cache per project.
- Rating appends fall back to per-instance cached queries; prefer withAvg/withCount at listing sites.
- Milestone "silent auto-heal" runs a LIKE-UPDATE before every GET (`ProjectMilestoneController:44–55`) — replace with one-time backfill migration/command.
- `getActiveProjects` OR-chain over user_id/selected_*/pm_id → only user_id indexed; split into UNION of indexed probes after adding indexes.

## Octane state leaks (local now, future-proofing)
- `ProjectResource::$resolvedProfiles` static survives requests per worker → stale profile ids for same user until worker restarts. Make per-request or add to octane flush.
- `resolveStorageUrl()` memoizes by path only → bakes first request's host/scheme into later requests' URLs. Drop the static (it's pure concatenation).
- Otherwise clean: no singletons capturing request, rate limiter takes Request as param, middleware statics clean.

## Dependencies (from supply-chain review)
- Remove: npm `clsx`, `tailwind-merge` (zero imports); composer dev `knuckleswtf/scribe` (never configured; drags legacy parsedown), `laravel/breeze` (scaffolding already generated; package itself unused once Auth controllers deleted — done in cleanup).
- Reclassify: `axios`, `react`, `react-dom`, `react-router-dom` sit in devDependencies but are runtime imports.
- Pin `"config.platform.php": "8.4.x"`; add `engines.node >= 20`; make `apply-octane-patches.php` fail loudly on patch miss; note lockfile tarballs resolve via npmmirror.com mirror (integrity hashes present).
- Upgrade candidates (separate efforts): maplibre-gl 4→5 (check react-map-gl compat), vite 6→7, tailwind 3→4 (own migration project).

## Verified clean
Admin dashboard/list queries paginated + cached; notification list bounded; chat thread limited(50) + transactional send; project show/getBids deep eager loads correct; ProjectResource/UserResource whenLoaded discipline; attachClientHistory grouped aggregates; bulk-write exemplar exists (TechnicalDesignReviewController); transactions consistently wrap money/state writes (locks missing though); Sanctum last_used_at write throttled; env drivers sane (redis everywhere in prod); logging rotates 14 days; frontend manualChunks sensible; uploads converted to WebP server-side.
