# ADR-0005: Go 1.27.2 and the 2026 toolchain

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

The rewrite introduces a Go codebase. The toolchain choice is not cosmetic: it decides
which language features are available, whether the standard library covers what we
would otherwise pull in, and how the escrow's concurrency tests are written.

The repository has **zero Go files in its 401-commit history**. The toolchain is
therefore chosen to minimise the learning surface and maximise the standard library's
coverage.

## Decision

**Go 1.27.2** — the current stable, released 2026-10-08 with security fixes to
`net/http`, `crypto/tls`, `html/template`, `net/textproto` and `os`.

`go.mod` declares `go 1.27.2`. The locally installed toolchain is 1.26.5; Go's
`GOTOOLCHAIN` mechanism fetches 1.27.2 automatically, so no host installation step is
required.

Supporting versions (all verified against `proxy.golang.org` on 2026-10-19):

| Component | Version |
|---|---|
| chi | v5.5.0 |
| pgx | v5.11.0 |
| sqlc | v1.31.1 |
| goose | v3.29.0 |
| go-redis | v9.23.0 |
| golang.org/x/sync | v0.24.0 |
| testify | v1.12.1 |
| golangci-lint | v1.64.8 |
| staticcheck | 2025.1.1 |
| govulncheck | v1.1.4 |

**`GOEXPERIMENT=nojsonv2` is set for the parity phase.** Go 1.27 ships the
`encoding/json/v2` implementation and the release notes state the encoded output may
differ. The Go API's responses are compared byte-for-byte against Laravel's golden
files; a different key order or escape sequence would break the tier-1 contract for
reasons unrelated to the port. The Go team documents the escape hatch explicitly.

## Go 1.27 features this plan uses

- **Generic methods** — a method may declare its own type parameters. The `Money` API
  gains generic helpers without package-level functions.
- **Struct-literal keys may be any valid field selector**, so nested and embedded
  structs initialise directly.
- **Function type inference generalised** to all assignment contexts.
- **`runtime/pprof`'s goroutine-leak profile is generally available** — automatic
  detection of permanently blocked goroutines. Directly applicable to the escrow's
  `FOR UPDATE` lock discipline.
- **`net/http/httptest.NewTestServer`** — an in-memory fake network for
  `testing/synctest`, which makes the concurrency tests **deterministic** rather than
  timing-dependent.
- **`database/sql.ConvertAssign`** and **`driver.RowsColumnScanner`** — better
  driver-level type control.
- **`go fix` modernizers** — `atomictypes`, `embedlit`, `slicesbackward`,
  `unsafefuncs`.
- **The standard library now has a `uuid` package** — no third-party dependency.
- **`go mod tidy`** consolidates `require` blocks automatically.

## Consequences

### Positive

- **The concurrency test the PHP suite cannot express becomes possible** — 100
  goroutines on one escrow row under `-race`, asserting exactly one ledger row and the
  ceiling moved exactly once.
- **`synctest` + `NewTestServer` make that test deterministic**, so it does not become a
  flaky CI job.
- **The goroutine-leak profile** is a permanent observability tool, not a debug hack.

### Negative

- **`GOEXPERIMENT=nojsonv2` is a temporary pin.** It must be removed as its own ADR
  after the tier-1 byte comparison ends, or the codebase is silently pinned to an old
  JSON implementation.
- **Go 1.27's `gofmt` may reformat previously formatted code** (the release notes
  mention a changed alignment decision). Irrelevant here — a new codebase — but it
  means the baseline is Go-1.27-formatted from day one.
- **No Go experience in the repository's history.** The first weeks carry a learning
  cost that the plan absorbs by porting the *pure* domain packages first (money, escrow,
  identity, authz), which have no I/O and no framework.

### Neutral

- **Tools are invoked via `go run <tool>@<pinned-version>`, never as third-party GitHub
  Actions.** The `redis/redis-stack-action@v1` failure in the current CI is exactly the
  class of problem this avoids: an action that must resolve. A pinned Go module version
  is fetched from the Go module proxy, which is a stable, content-addressed
  distribution channel.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Go 1.26.5 (the locally installed version)** | One minor behind, and it lacks the `uuid` package, `httptest.NewTestServer` and the GA goroutine-leak profile. The toolchain auto-fetches 1.27.2 anyway, so there is no benefit to pinning the older one. |
| **A framework (Gin, Echo, Buffalo, Hertz)** | Each imposes its own `Context` type on every handler signature, leaking the framework into the domain layer. Buffalo is effectively unmaintained. Hertz has a smaller talent pool. |
| **GORM or ent** | GORM is reflection-based with runtime errors and N+1 footguns — unacceptable for a financial ledger. ent would require re-declaring the 98-table schema in Go DSL, on top of the SQL migrations. `sqlc` generates from the live schema and is checked at compile time. |
| **Leave `encoding/json/v2` on** | It would work, but the byte-comparison contract is the instrument that proves tier-1 parity. Trading a byte-exact guarantee for a marginally faster encoder is the wrong trade during a rewrite. |

## References

- `docs/STACK.md` §2
- `go.dev/doc/go1.27` — the release notes
- `go.dev/blog/go1.27`
