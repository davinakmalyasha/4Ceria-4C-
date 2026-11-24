# Documentation

| | |
|---|---|
| [`../README.md`](../README.md) | What the project is, quick start, demo accounts |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Topology, request lifecycle, storage, jobs, PWA, deploy |
| [`DOMAIN.md`](DOMAIN.md) | Actors, project lifecycle, bids, disputes, marketplace |
| [`MONEY.md`](MONEY.md) | Integer money, the escrow ledger, invariants |
| [`API.md`](API.md) | Route manifest, auth, errors, pagination, SSE, memory, MCP, uploads |
| [`AI.md`](AI.md) | Agent tree, tools, memory, skills, MCP and safety |
| [`OPERATIONS.md`](OPERATIONS.md) | Environment, reset, verification, backups, deploy |
| [`PERFORMANCE.md`](PERFORMANCE.md) | JSON v2, compression, timeouts and query benchmarks |
| [`PORTFOLIO.md`](PORTFOLIO.md) | Demo script, screenshots, engineering highlights |

The database is the other half of the contract:

- [`db/postgres/migrations`](../db/postgres/migrations) — forward-only schema;
- [`db/postgres/seed.sql`](../db/postgres/seed.sql) — demo data;
- [`db/postgres/tests`](../db/postgres/tests) — SQL invariants.
