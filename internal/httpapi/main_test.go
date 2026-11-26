package httpapi

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestMain tops up the shared h1 fixture project once per suite run.
//
// h1's marketplace flows spend REAL escrow money on the buyer's seeded
// project with per-run-unique quote references, and ledger rows are
// immutable by design — so every suite run disburses afresh. Without a
// top-up, consecutive runs on one database (local re-runs; CI's full
// suite immediately followed by the coverage ratchet) exhaust the seed
// ceiling and the quote flow starts 422ing on affordability, which looks
// exactly like a product regression but is only fixture insolvency.
//
// Deposits are repeatable by schema design (partial unique index on the
// dedupe key), and each run nets to zero drift (top-up in, spend out),
// so this keeps the fixture solvent WITHOUT masking real affordability
// failures: a genuinely unaffordable payment still 422s. Best-effort
// and silent: without DATABASE_URL the suite runs (and skips) as before.
func TestMain(m *testing.M) {
	topUpSharedFixture()
	os.Exit(m.Run())
}

func topUpSharedFixture() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return
	}
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return
	}
	// Same fixture the h1 flows spend from: the first user's first
	// project (no hard-coded project id).
	var uid int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err != nil {
		return
	}
	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = $1 ORDER BY id LIMIT 1`, uid).Scan(&projectID); err != nil {
		return
	}
	// One run's shared-fixture spending is on the order of tens of
	// millions; this covers it with two orders of magnitude to spare.
	_, _ = pool.Exec(ctx, `SELECT escrow.record_movement($1, 'deposit', 1000000000.00, 'suite top-up')`, projectID)
}
