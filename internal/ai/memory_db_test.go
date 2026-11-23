package ai

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/adk/v2/memory"
)

func memoryPool(t *testing.T) (*pgxpool.Pool, int64, int64) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL absent")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Skipf("database: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("database unreachable: %v", err)
	}
	var first, second int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&first); err != nil {
		pool.Close()
		t.Skip("no seeded users")
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE id <> $1 ORDER BY id LIMIT 1`, first).Scan(&second); err != nil {
		second = first
	}
	return pool, first, second
}

func TestMemoryIngestSearchAndIsolation(t *testing.T) {
	pool, userID, otherID := memoryPool(t)
	defer pool.Close()
	ctx := context.Background()

	cleanup := func() {
		pool.Exec(ctx, `DELETE FROM ai_chat_sessions WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM ai_memories WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM ai_memory_settings WHERE user_id = $1`, userID)
	}
	cleanup()
	t.Cleanup(cleanup)

	if enabled, err := MemoryEnabled(ctx, pool, userID); err != nil || !enabled {
		t.Fatalf("memory should default on: enabled=%v err=%v", enabled, err)
	}
	session, err := CreateSession(ctx, pool, userID, "memory test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, session.ID, "user", "I am looking for a house in Bandung under 1.5 billion"); err != nil {
		t.Fatalf("append user: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, session.ID, "assistant", "I can shortlist listings in Bandung."); err != nil {
		t.Fatalf("append assistant: %v", err)
	}
	if err := SyncSession(ctx, pool, userID, session.ID); err != nil {
		t.Fatalf("sync: %v", err)
	}
	// Idempotent: a retry must not duplicate context.
	if err := SyncSession(ctx, pool, userID, session.ID); err != nil {
		t.Fatalf("sync retry: %v", err)
	}
	if count, err := CountMemories(ctx, pool, userID); err != nil || count != 2 {
		t.Fatalf("count = %d, err = %v, want 2", count, err)
	}

	svc := NewMemoryService(pool)
	result, err := svc.SearchMemory(ctx, &memory.SearchRequest{
		UserID: fmt.Sprintf("user-%d", userID),
		Query:  "Bandung house",
	})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(result.Memories) == 0 {
		t.Fatal("expected a memory hit")
	}
	other, err := svc.SearchMemory(ctx, &memory.SearchRequest{
		UserID: fmt.Sprintf("user-%d", otherID),
		Query:  "Bandung house",
	})
	if err != nil {
		t.Fatalf("other search: %v", err)
	}
	if len(other.Memories) != 0 {
		t.Fatalf("memory leaked across users: %d rows", len(other.Memories))
	}

	if _, err := Remember(ctx, pool, userID, "Prefers a 3-bedroom house in Bandung."); err != nil {
		t.Fatalf("remember: %v", err)
	}
	result, err = svc.SearchMemory(ctx, &memory.SearchRequest{
		UserID: fmt.Sprintf("user-%d", userID),
		Query:  "bedroom",
	})
	if err != nil || len(result.Memories) == 0 {
		t.Fatalf("note search: %v (%d rows)", err, len(result.Memories))
	}
}

func TestMemoryCanBeDisabledAndCleared(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	defer pool.Close()
	ctx := context.Background()

	cleanup := func() {
		pool.Exec(ctx, `DELETE FROM ai_chat_sessions WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM ai_memories WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM ai_memory_settings WHERE user_id = $1`, userID)
	}
	cleanup()
	t.Cleanup(cleanup)

	if err := SetMemoryEnabled(ctx, pool, userID, false); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if enabled, err := MemoryEnabled(ctx, pool, userID); err != nil || enabled {
		t.Fatalf("enabled = %v, err = %v", enabled, err)
	}
	session, err := CreateSession(ctx, pool, userID, "disabled test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, session.ID, "user", "Remember this secret preference"); err != nil {
		t.Fatalf("append: %v", err)
	}
	if err := SyncSession(ctx, pool, userID, session.ID); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if count, _ := CountMemories(ctx, pool, userID); count != 0 {
		t.Fatalf("disabled memory ingested %d rows", count)
	}
	if err := SetMemoryEnabled(ctx, pool, userID, true); err != nil {
		t.Fatalf("enable: %v", err)
	}
	if err := SyncSession(ctx, pool, userID, session.ID); err != nil {
		t.Fatalf("sync enabled: %v", err)
	}
	if count, _ := CountMemories(ctx, pool, userID); count != 1 {
		t.Fatalf("count = %d, want 1", count)
	}
	if err := ClearMemories(ctx, pool, userID); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if count, _ := CountMemories(ctx, pool, userID); count != 0 {
		t.Fatalf("clear left %d rows", count)
	}
}
