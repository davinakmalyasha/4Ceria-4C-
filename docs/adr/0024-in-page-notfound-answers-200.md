# ADR-0024: in-page `notFound()` answers HTTP 200 — accepted, not fixed

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

`web/app/not-found.tsx` renders the custom 404 boundary and its header
comment claims unknown URLs "answer 404". That is true for unknown
top-level routes (HTTP 404) and unknown `/api/*` paths (JSON 404), but
**not** for the in-page `notFound()` in `web/app/dashboard/[tab]/page.tsx`
(unknown dashboard tab): curl shows HTTP 200 with the 404 UI in the body.

## Investigation

- `next start` (production, `output: standalone`): `/dashboard/no-such-tab`
  with a valid session → HTTP 200, 404 UI rendered.
- `next dev` (Turbopack): same URL → HTTP 200. The standalone boundary is
  therefore innocent; dev and prod agree.
- No `middleware.ts` exists, `not-found.tsx` is a plain component, and the
  page is dynamic (`await params`/`searchParams` + `cookies()`), so there is
  no app-side rewrite, cache, or static prerender that could pin the status.
- The bundled Next 16 docs (`node_modules/next/dist/docs/`) describe the
  not-found UI but pin no status-code guarantee for the in-page call.

Conclusion: framework-level behaviour in Next 16, not an app bug and not a
serving-boundary artefact.

## Decision

Keep the in-page `notFound()` call and document the status quirk here
instead of working around it. The candidate workarounds were rejected:

- `redirect('/dashboard')` would silently render the overview for a renamed
  tab — exactly what `[tab]/page.tsx` documents as forbidden.
- Throwing a raw 404 `Response` fights the App Router contract for no user
  gain.

Impact is nil: only signed-in users can reach the in-page call (signed-out
visitors to unknown tabs 307 to `/login`), the 404 UI renders correctly in
every case, and dashboard pages carry no SEO surface.

## Consequences

- Probing a dashboard tab id by status code is not possible (always 200);
  probe by the `404` marker in the body instead — E2E checks do this.
- Revisit only if a future Next version documents a status guarantee for
  in-page `notFound()`; the discriminating test is
  `curl /dashboard/no-such-tab` on `next dev` vs `next start`.
