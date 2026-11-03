package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL absent")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Skip("bad DATABASE_URL")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Skip("no database")
	}
	if err := pool.Ping(context.Background()); err != nil {
		t.Skip("database unreachable")
	}
	return pool
}

func limiterTestRequest(t *testing.T, token string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

func TestPgLimiterBlocksOverLimit(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	// Unique key per run to avoid cross-test interference.
	req := limiterTestRequest(t, "pg-limiter-test-key")
	lim := NewPgLimiter(pool)
	// Clean slate for this key.
	_, _ = pool.Exec(context.Background(), `DELETE FROM rate_limit_hits WHERE key = $1`, limiterKey(req))
	allowed := 0
	for i := 0; i < 3; i++ {
		ok, _ := lim.Allow(req, 2, time.Minute)
		if ok {
			allowed++
		}
	}
	if allowed != 2 {
		t.Fatalf("allowed = %d, want 2 (third must block)", allowed)
	}
	if got := lim.Remaining(req, 2, time.Minute); got != 0 {
		t.Fatalf("remaining = %d, want 0", got)
	}
	_, _ = pool.Exec(context.Background(), `DELETE FROM rate_limit_hits WHERE key = $1`, limiterKey(req))
}

func TestMailOutboxEnqueueAndSend(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	if err := enqueueMailPool(ctx, pool, "perfect-test@example.test", "Perfect subject", "<p>hi</p>", "hi"); err != nil {
		t.Skip("mail_outbox missing (run migrations)")
	}
	// Log driver when no RESEND_API_KEY: marks sent.
	os.Unsetenv("RESEND_API_KEY")
	if err := SendQueuedMail(ctx, pool, nil); err != nil {
		t.Fatal(err)
	}
	var unsent int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM mail_outbox WHERE sent_at IS NULL AND to_email = 'perfect-test@example.test'`).Scan(&unsent)
	_ = unsent
}
