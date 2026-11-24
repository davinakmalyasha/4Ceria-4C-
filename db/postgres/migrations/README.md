# Migrations

Forward-only. Apply in filename order; never edit a migration that has run in
an environment you care about. The verification gate builds a fresh database
and applies every file from `0001`, so a syntax error or a broken dependency
fails before the Go suites run.

Some early files mention MySQL, PHP or a pre-rewrite table name. Those comments
are **provenance**: they explain why a column has an unusual shape or why a
constraint exists, and the SQL is the current PostgreSQL schema. They are not a
runtime dependency. New migrations describe the current system only.

The AI memory tables are in `0029_ai_memory.sql`; see `docs/AI.md`.
The list indexes proven by `EXPLAIN` on the larger benchmark dataset are in
`0030_perf_indexes.sql`; see `docs/PERFORMANCE.md`.
