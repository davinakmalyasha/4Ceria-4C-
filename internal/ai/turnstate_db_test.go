package ai

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type aiQueryCounter struct {
	mu      sync.Mutex
	queries int
}

func (c *aiQueryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	c.mu.Lock()
	c.queries++
	c.mu.Unlock()
	return ctx
}

func (c *aiQueryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func (c *aiQueryCounter) Count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.queries
}

func (c *aiQueryCounter) Reset() {
	c.mu.Lock()
	c.queries = 0
	c.mu.Unlock()
}

func TestTurnAndStatusSnapshotsAreOneQuery(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL absent")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Skip("bad DATABASE_URL")
	}
	counter := &aiQueryCounter{}
	cfg.ConnConfig.Tracer = counter
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Skip("no database")
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(context.Background()); err != nil {
		t.Skip("database unreachable")
	}
	ctx := context.Background()

	var userID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID); err != nil {
		t.Skip("no seeded users")
	}
	cleanup := func() {
		pool.Exec(ctx, `DELETE FROM ai_chat_sessions WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM ai_memories WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM ai_memory_settings WHERE user_id = $1`, userID)
	}
	cleanup()
	t.Cleanup(cleanup)

	session, err := CreateSession(ctx, pool, userID, "snapshot test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	counter.Reset()
	state, err := LoadTurnState(ctx, pool, userID, session.ID)
	if err != nil {
		t.Fatalf("turn state: %v", err)
	}
	if !state.SessionExists {
		t.Fatal("session not found")
	}
	if got := counter.Count(); got != 1 {
		t.Errorf("LoadTurnState used %d queries, want 1", got)
	}

	counter.Reset()
	if _, err := LoadStatusSnapshot(ctx, pool, userID); err != nil {
		t.Fatalf("status snapshot: %v", err)
	}
	if got := counter.Count(); got != 1 {
		t.Errorf("LoadStatusSnapshot used %d queries, want 1", got)
	}
}
