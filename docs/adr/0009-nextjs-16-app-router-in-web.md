# ADR-0009: Next.js 16 App Router, in `web/`

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The current frontend is a React 19 + Vite SPA: 327 files, 77 409 LOC, 18 routes, a
`useState('overview')` tab machine with 39 tabs, 41 `any`-typed props on
`DashboardTabs`, 285 components in a flat `components/` tree, 132 `<img>` tags, 4
competing currency formatters, 96 TypeScript errors and 20 vitest tests.

The rewrite moves it to Next.js 16. The decision has two parts: **which Next.js**, and
**where the project lives**.

## Decision

**Next.js 16.4.2, App Router, with the project rooted at `web/` — not the repository
root.**

The location is forced: Next.js requires the App Router at `<root>/app` or
`<root>/src/app`, and the repository root already owns `app/` — Laravel's PSR-4 `App\`
namespace, with 40+ controllers and services. Moving Laravel's `app/` to `src/` means
rewriting `composer.json`'s PSR-4 mapping, a blast radius `AGENTS.md` explicitly warns
against.

> `web/` has its own `package.json`, lockfile, `tsconfig.json`, `vitest.config.ts` and
> `node_modules`. The legacy SPA keeps the repository root's `package.json` until it is
> retired.

### Next.js 16 specifics that shape the port

| Change | Handling |
|---|---|
| **Async Request APIs — synchronous access fully removed.** `params`, `searchParams`, `cookies()` and `headers()` must be awaited. | The 39 dashboard tabs read `?tab=` and `?project=` as query parameters. They become `await searchParams` in a server component. This is *why* the 8 `PhaseKey` phases become a `?phase=` **query parameter** rather than routes: it avoids a client-side `useSearchParams` and therefore a Suspense boundary on every phase. |
| **`middleware` → `proxy`.** | The auth redirect becomes `proxy.ts`. It runs on the Edge, does no DB work, and only checks for the presence of the session cookie. |
| **Turbopack by default.** | ⚠ Turbopack's CSS handling differs from webpack's, and the CSS source order is load-bearing (ADR-0004). The CI **asserts the built stylesheet order**, not only the visual result. |
| **React Compiler is stable and enabled by default.** | **Disabled for the parity phase.** The compiler auto-memoises components, changing render scheduling; P-5 requires the same network-request sequence and order. Enabled post-parity with its own delta report. |
| **`next lint` removed.** | The ESLint CLI is invoked directly. |
| **Node.js 20.9+ required.** | The current `.nvmrc` says 20 while the runtime is 26.8.1 — a real drift, fixed in W1. |
| **`next/image` defaults changed.** | The 132 `<img>` tags stay plain `<img>` tags. Next's image pipeline would re-optimise and change pixels. |

### The 39 tabs become real routes

Tab ids are used **verbatim** as route segments, because notification deep links depend
on them (`app/Jobs/SendWebPushJob.php:127-139` builds `?tab=project-detail&project=…`).
The 11 project-workspace inner tabs become
`/dashboard/projects/[projectId]/<tab>` — which also splits the 1 064 169-byte
`ProjectDetailPage` chunk into eleven.

## Consequences

### Positive

- **Real routes** — deep links, the back button, browser history, and shareable URLs,
  replacing a `useState` string and a `window` CustomEvent.
- **The BFF proxy makes the token unreachable from JavaScript.** The browser holds an
  httpOnly cookie it cannot read; the Next server holds the bearer token. The "token
  leaks to a presigned storage URL" class of bug becomes structurally impossible.
- **Route-level code splitting** falls out of the routing change.
- **The `ProjectDetailPage` chunk splits** from 1.06 MB into eleven.
- **The Next.js dev server** gives fast refresh, a built-in error overlay, and route
  inspection.

### Negative

- **285 components / 65 164 LOC must move** — a large, mechanical, high-volume change
  with real regression risk. The mitigation is the visual-regression gate: a move that
  changes a pixel fails the build.
- **RSC and `'use client'` boundaries are a new source of bugs.** `useSearchParams` and
  `useRouter` require Suspense boundaries; `framer-motion` requires a client boundary
  (ADR: a `components/motion.tsx` island). 285 files currently assume everything is a
  client component.
- **The 39-tab route table is a new artifact** that must stay in sync with
  `DashboardTabs.tsx`'s tab registry and with the notification deep-link builder.
  All three are generated from **one** registry (`features/dashboard/tabs.ts`) so they
  cannot drift.

### Neutral

- **The legacy SPA and the new app coexist** for ~18 weeks, both deployed, both
  behind the gateway. The legacy SPA is served at `/legacy/*` during the window.
- **`web/` has its own toolchain**, so there are two `package.json` files, two
  lockfiles and two vitest configurations during the transition. They converge when the
  legacy SPA is retired.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Keep the Vite SPA** | Leaves the tab machine, the prop drilling, the 4 currency formatters and the missing routes. It is also the *only* thing that makes the Next.js rewrite unnecessary. The rewrite was chosen (ADR-0001). |
| **Next.js at the repository root** | Requires moving Laravel's `app/` to `src/` and rewriting the PSR-4 mapping. A blast radius `AGENTS.md` warns against, for a cosmetic gain. |
| **Pages Router** | The Pages Router is in maintenance. The App Router is the only forward path. |
| **Remix / React Router 7 framework mode** | Viable, and it would keep the existing `react-router-dom` dependency and the 39-tab structure more intact. Rejected: the ecosystem, the Vercel integration and the hiring signal all favour Next.js, and the tab-machine problem is solved by routing, not by the framework. |
| **Enable the React Compiler during parity** | It changes render scheduling, and P-5 requires an identical request sequence and order. Deferred. |

## References

- `docs/REWRITE-PLAN.md` §5.1, §6, §7
- `docs/adr/0004-visual-baseline-is-the-laravel-served-build.md`
- `docs/adr/0016-sanctum-tokens-move-to-an-httponly-cookie.md`
- `nextjs.org/docs/app/guides/upgrading/version-16`
