# The 4Ceria Stack — pinned versions

**Every version below was verified against the live registry on 2026-10-19.**
`go.dev/dl/?mode=json`, `proxy.golang.org`, `registry.npmjs.org`.

---

## 1. The rule: latest, everywhere

**Every dependency in the new stack is the current stable.** The owner asked for the
latest versions and there is no caveat on that.

There is exactly one subtlety, and it is not about *which* version — it is about
*when* a version lands.

> **A version that changes the rendered output must land in the legacy application
> first**, so that the visual baseline describes one consistent design and the
> Next.js port has something coherent to reproduce.

Two dependencies change the rendered output: **Tailwind CSS** and, indirectly,
**TypeScript** (through the ratchet baseline). Both are upgraded in the legacy
application in Week 1–2, as their own reviewed changes with their own visual-diff
delta reports — and *then* the visual baseline is captured against the upgraded
application.

The reasoning, in one paragraph: if the legacy app is Tailwind 3 and the port is
Tailwind 4, there is no single baseline to compare against — the gate would either
fail on every screen, or be quietly re-baselined until it meant nothing. Upgrading
first makes the comparison like-for-like, and it isolates a large change in a small
one: the upgrade is one PR with one delta report, and the port's job stays
*"reproduce"*, not *"reproduce **and** upgrade"*.

See ADR-0010 and ADR-0011.

### 1.1 What "latest" costs, stated plainly

| Dependency | Latest | What adopting it changes |
|---|---|---|
| **Tailwind CSS** | 4.3.3 | A **CSS-first** configuration (`@theme`, `@source`, `@plugin`), a real `@layer` cascade, a different preflight, `border-*` defaulting to `currentColor` instead of `gray-200`, `ring` → `ring-3` with a `currentColor` default, a new placeholder colour, renamed utilities, an OKLCH default palette, and a Vite-plugin build pipeline. **All of it is visible**, and all of it is in the delta report. |
| **TypeScript** | 7.0.2 | The native Go port, 8–12× faster. "Same errors, locations, and messages as TS 6.0" — so the ratchet carries over, provided `stableTypeOrdering: true` is set. The **baseline number** is re-measured; the ratchet is unchanged. |
| **Next.js** | 16.4.2 | Async request APIs (synchronous access removed), Turbopack by default, `middleware` → `proxy`, the React Compiler stable, `next lint` removed, Node 20.9+. |
| **Vitest** | 5.0.5 | The new `web/` project. The legacy SPA's 20 tests stay on 2.1.8 until the port retires them. |
| **ESLint** | 10.13.0 | The current line. The ESLint CLI replaces `next lint`. |
| **Go** | 1.27.2 | Generic methods, the standard-library `uuid` package, `httptest.NewTestServer`, the GA goroutine-leak profile. `GOEXPERIMENT=nojsonv2` during parity, so the JSON encoding stays byte-exact. |

The two "old" versions that remain in the tree are the **legacy SPA's** toolchain, and
they are removed when the port retires them.

---

## 2. Backend — Go 1.27.2

| Component | Version | Why this one |
|---|---|---|
| **Go** | **1.27.2** (released 2026-10-08) | The current stable. Includes security fixes to `net/http`, `crypto/tls`, `html/template`, `net/textproto` and `os`. |
| ~~chi~~ | — | **Not a dependency.** The router is `net/http`'s `ServeMux`, populated from `routing/routes.yaml` (`internal/httpapi/router.go`). Go 1.22+ patterns (`METHOD /path/{param}`) do everything the manifest needs, and one fewer router is one fewer place the route table can drift. |
| **pgx** | v5.11.0 | The Postgres driver. `pgxpool` for pooling, native `timestamptz`, `pgtype`. |
| **sqlc** | v1.31.1 | Generates Go from a **live PostgreSQL schema**. Compile-time-checked queries, no runtime reflection, no runtime SQL builder. |
| **goose** | v3.29.0 | Migrations. Plain `.sql` with `-- +goose Up/Down`, and a per-file `NO TRANSACTION` escape hatch (required for `ALTER TYPE … ADD VALUE`). |
| **go-redis** | v9.23.0 | Rate limits, cache, chat counters, geo cache. |
| **uuid** | v1.6.0 | **New in Go 1.27** — the standard library now has a `uuid` package. No third-party dependency needed. |
| **golang.org/x/sync** | v0.24.0 | `errgroup` for the fan-out paths. |
| **testify** | v1.12.1 | Assertions. (Most domain code uses plain table-driven `testing`.) |
| **golangci-lint** | v1.64.8 | Pinned, invoked via `go run`, never as a third-party GitHub Action. |
| **staticcheck** | 2025.1.1 | Pinned, same invocation style. |
| **govulncheck** | v1.1.4 | Pinned, same invocation style. |

### 2.1 Go 1.27 features this plan uses

- **Generic methods.** A method may declare its own type parameters. The `Money` API
  gains a generic helper without a package-level function.
- **Struct-literal keys may be any valid field selector**, so nested and embedded
  structs initialise directly.
- **Function type inference generalised** to all assignment contexts.
- **`runtime/pprof`'s goroutine-leak profile is generally available** — automatic detection
  of permanently blocked goroutines. Directly useful for the escrow's `FOR UPDATE` lock
  discipline.
- **`net/http/httptest.NewTestServer`** — an in-memory fake network for
  `testing/synctest`, which makes the concurrency tests deterministic instead of
  timing-dependent.
- **`database/sql.ConvertAssign` and `driver.RowsColumnScanner`** — better driver-level
  type control.
- **`go fix` modernizers**: `atomictypes`, `embedlit`, `slicesbackward`, `unsafefuncs`.
- **`go mod tidy`** now consolidates `require` blocks automatically.

### 2.2 One Go 1.27 setting that is pinned for parity

> **`GOEXPERIMENT=nojsonv2`** is set for the parity phase.
>
> Go 1.27 ships the `encoding/json/v2` implementation, and the release notes state the
> encoded output may differ. The Go API's responses are compared **byte-for-byte**
> against Laravel's golden files. A JSON encoder that emits a different key order or a
> different escape sequence breaks the tier-1 contract for reasons that have nothing to
> do with the port.
>
> The escape hatch is documented by the Go team: *"Users who encounter compatibility
> problems with the new implementation may disable it by setting `GOEXPERIMENT=nojsonv2`
> at build time."* It is removed when the tier-1 golden files are no longer compared
> byte-for-byte — i.e. after the parity phase, as its own ADR.

---

## 3. Frontend — Next.js 16.4.2

| Package | Version | Note |
|---|---|---|
| **next** | **16.4.3** | App Router. The next major after the current 15.x line. |
| **react / react-dom** | **19.3.1** | A minor bump from the current 19.2.4. |
| ~~@tanstack/react-query~~ | — | **Not used.** It is a CLIENT-SIDE cache, and this rewrite fetches on the server: a page's data is read in the server component that renders it, and the cache is the per-request React cache. Loading, error and empty states are `loading.tsx` / `error.tsx` / an empty branch, not a `useQuery` result. Adding it back would put a second cache between the database and the pixels. |
| **@playwright/test** | 1.64.1 | The visual-regression and E2E harness. The browser build is pinned by the lockfile. |
| **vitest** | 5.0.5 | The new `web/` project only. |
| **eslint** | 10.13.0 | The current line (`^10.9.0`). `next lint` is gone in Next 16 — the ESLint CLI is used directly. |
| **zod** | 4.6.7 | Runtime validation at the BFF boundary. |
| **jose** | 6.2.12 | JWE for the session cookie envelope. |
| **typescript** | **7.0.2** | The native Go port. Adopted in the legacy app first (ADR-0011). `stableTypeOrdering: true`; the ratchet baseline is re-measured. |
| **tailwindcss** | **4.3.3** | CSS-first. Adopted in the legacy app first (ADR-0010). `@theme` / `@source` / `@plugin`. |
| **@tailwindcss/vite** | 4.3.3 | The Vite plugin. Tailwind 4 handles CSS imports and prefixing itself (Lightning CSS), so `postcss-import` and `autoprefixer` are dropped. |
| **@tailwindcss/forms** | 0.5.11 | Loaded with `@plugin "@tailwindcss/forms";` |
| **@tailwindcss/upgrade** | latest | The codemod: `npx @tailwindcss/upgrade`. Requires Node 20+. Its output is reviewed by hand. |
| **framer-motion** | 12.38.0 | Carried over unchanged — the animation variants are part of the visual contract. |
| **lucide-react** | 0.577.0 | Carried over. |
| **maplibre-gl** / **react-map-gl** | 4.7.1 / 8.1.0 | Carried over. |
| **jspdf** / **html2canvas** | 4.2.1 / 1.4.1 | Carried over, still lazily imported. |
| **date-fns** | 4.1.0 | Carried over. |

### 3.1 Next.js 16 breaking changes that shape the port

| Change | Impact on this port |
|---|---|
| **Async Request APIs — synchronous access fully removed.** `params`, `searchParams`, `cookies()` and `headers()` must be awaited. | The 39 dashboard tabs read `?tab=` and `?project=` as **query parameters**. They become `await searchParams` in a server component. This is *why* the `?phase=` decision (§7 of the plan) matters: it avoids a client-side `useSearchParams` and therefore a Suspense boundary on every phase. |
| **`middleware` → `proxy`.** | The auth redirect becomes `proxy.ts`. It runs on the Edge, does no DB work, and only checks for the presence of the session cookie. |
| **Turbopack by default.** | ⚠ Turbopack's CSS handling differs from webpack's. The **CSS source order is load-bearing** (the navbar's `z-index` depends on `index.css` being emitted after Tailwind). The port therefore asserts the built stylesheet order in CI, not just the visual result. |
| **React Compiler is stable** and enabled by default. | **Disabled for the parity phase.** The compiler auto-memoises components, which changes render scheduling. P-5 requires the same *network request sequence and order*; auto-memoization is a behavioural variable we do not need during parity. Enabled post-parity, with its own delta report. |
| **`next lint` removed.** | The ESLint CLI is invoked directly. |
| **Node.js 20.9+ required** (18 dropped). | The current `.nvmrc` says 20 and the runtime is v26.8.1. The new `web/` pins the same Node as CI. |
| **`next/image` defaults changed** (`minimumCacheTTL`, `imageSizes`). | The port uses plain `<img>` tags in 132 places — they stay plain `<img>` tags, because Next's image pipeline would re-optimise and change pixels. |

### 3.2 The `web/` project lives in its own directory

Next.js requires the App Router at `<root>/app` or `<root>/src/app`. The repository root
already owns `app/` — Laravel's PSR-4 `App\` namespace, 40+ controllers and services.
Moving Laravel's `app/` to `src/` would rewrite `composer.json`'s PSR-4 mapping, a
blast radius `AGENTS.md` explicitly warns against.

> **The Next.js project root is `web/`.** `web/src/app/` is the App Router. It has its
> own `package.json`, its own lockfile, its own `tsconfig.json` and its own `node_modules`.
> The legacy SPA keeps the repository root's `package.json` until it is retired.

---

## 4. Database — PostgreSQL 17

| Component | Version | Note |
|---|---|---|
| **PostgreSQL** | **17** | The current stable major. Service container and production. |
| **Go driver** | pgx v5.11.0 | |
| **Migration runner** | goose v3.29.0 | |
| **Query generator** | sqlc v1.31.1 | |
| **Local container** | `postgres:17` | `docker compose` |
| **CI container** | `postgres:17` | The same major as production. |
| **Legacy container** | `mysql:9.6` | The same major as production (CI used 8.0 — that gap is fixed). |
| **Object storage (local/CI)** | MinIO | S3-compatible, deterministic. |
| **Object storage (prod)** | Railway Object Storage (Tigris) | Unchanged. |

---

## 5. Tooling

| Tool | Version | Note |
|---|---|---|
| **Go** | 1.27.2 | `go.mod` declares `go 1.27.2`; the local toolchain (1.26.5) auto-fetches 1.27.2 via `GOTOOLCHAIN`. |
| **Node** | 22.x (CI) / `.nvmrc` | The current `.nvmrc` says 20 and the runtime is 26.8.1 — a real drift, fixed in W1. |
| **PHP** | 8.4 | `composer.json` floor `^8.4`. The host's `php` is 8.3 and **cannot** run `vendor/`; the legacy app is therefore run in a `php:8.4-fpm-alpine` container, matching CI exactly. |
| **Docker** | Compose v2 | `compose.yaml`, no `version:` key. |
| **Task runner** | go-task | `Taskfile.yml`. **Not `make`** — on Windows `make` is absent by default, and the `make` → `composer` → PowerShell chain is exactly how `composer verify` became a green no-op. |
| **CI** | GitHub Actions | Every action first-party or pinned to a 40-hex SHA. |

---

## 6. What is *not* in this list, and why

| Not adopted | Why |
|---|---|
| **GORM / ent** | Reflection-based (GORM) or a full schema re-declaration (ent). Both reintroduce exactly the N+1 and runtime-error classes the rewrite is removing. `sqlc` generates from the live schema and is checked at compile time. |
| **Echo / Fiber / Gin** | Each imposes its own `Context` type on every handler signature, leaking the framework into the domain. Fiber is `fasthttp`-based, not `net/http` — it loses net/http middleware, HTTP/2 and most OTel instrumentation. |
| **Auth.js / NextAuth** | The identity provider is Laravel Sanctum, not an OAuth/OIDC provider. Auth.js's value (a provider matrix, OAuth callbacks, JWT session encoding) is irrelevant here; its cost is a *second* session format that must be reconciled with the Sanctum token on every request. Two sessions, one user, guaranteed drift. |
| **A native Go ORM** | See GORM/ent. The money path uses hand-written SQL — the escrow arithmetic deserves explicit SQL, not a query builder. |
| **`encoding/json/v2`** | Pinned off during parity — see §2.2. |

---

## 7. The version policy, restated

```
EVERYTHING is the current stable, verified against the live registry:

  Go 1.27.2 · pgx 5.11.0 · sqlc 1.31.1 · goose 3.29.0 · go-redis 9.23.0
  Next 16.4.3 · React 19.3.1 · TypeScript 7.0.2 · Tailwind CSS 4.3.3
  Playwright 1.64.1 · Vitest 5.0.5 · ESLint 10.13.0
  zod 4.6.7 · jose 6.2.12
  PostgreSQL 17 · MySQL 9.6 (legacy) · MinIO (local/CI) · Tigris (production)

THE ONE RULE: a version that changes the rendered output lands in the LEGACY
APPLICATION FIRST, so the visual baseline describes one consistent design.

NO ROUTER LIBRARY ON THE GO SIDE. `net/http`'s `ServeMux` is the router, built from the
generated manifest. chi was in an earlier draft and is not a dependency.

  Tailwind 3.4.14  →  4.3.3   in the legacy app, Week 1–2, own PR, own delta report
  TypeScript 6.0.3 →  7.0.2   in the legacy app, Week 1–2, ratchet re-measured
  then: capture the visual baseline against the upgraded app
  then: the Next.js port reproduces it

THE ONLY PINS, and why:

  GOEXPERIMENT=nojsonv2   the tier-1 contract compares JSON byte-for-byte;
                           a different encoder is a different contract.
                           Removed as its own ADR after parity.

  Chromium build          a stale browser is a rendering difference; pinned by
                           web/playwright/package-lock.json, not cached in CI.

  The lockfiles            package-lock.json, composer.lock, go.sum. Every
                           third-party tool is invoked via a pinned version
                           (go run <tool>@<version>), never as a floating
                           GitHub Action.
```

The legacy SPA's `package.json` is upgraded in Week 1–2 along with everything else —
Tailwind 4.3.3, TypeScript 7.0.2 — so there is no "old version still in the tree"
category left. The only thing that outlives the transition is **Vitest 2.1.8** in the
legacy SPA, and only until the port retires the 20 legacy tests it guards.

There is no "pinned for parity" category left; the pins above are all *tools* or
*measurements*, not versions.
