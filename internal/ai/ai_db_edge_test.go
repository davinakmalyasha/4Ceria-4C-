package ai

// DB-gated edge tests for internal/ai: the branches that need a real
// PostgreSQL (service.go's cached memory service, the profile-cache store
// path, the pinned-memory query failure, and a full 12-tool runner turn).
// Skip-gated on DATABASE_URL like the rest of the DB suite; every row read
// is seeded demo data, nothing is written, so there is no cleanup.
//
// Expectations are literals, including the seeded ids also pinned by
// ai_db2_test.go (first user 31682 with arsitek profile 6634, project 14976
// owned by 31692).

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"google.golang.org/adk/v2/memory"
)

// A zero-value ProfileCache has a nil map: storing the caller's profiles
// must initialize it, not panic. First user 31682 holds arsitek profile 6634.
func TestDBEdgeProfilesNilMapStore(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ids := callerProfileIDsCached(context.Background(), ToolCtx{Pool: pool, Profiles: &ProfileCache{}}, userID)
	if len(ids) != 1 || ids["arsiteks"] != 6634 {
		t.Fatalf("profiles = %v, want map[arsiteks:6634]", ids)
	}
}

// With the memory switch pinned on, a dead database surfaces the query
// failure instead of an empty scope. The exact driver text is not ours to
// pin, so only the failure itself is asserted.
func TestDBEdgeSearchMemoryClosedPoolPinned(t *testing.T) {
	pool, _, _ := memoryPool(t)
	pool.Close()
	svc := NewEnabledMemoryService(pool, true)
	if _, err := svc.SearchMemory(context.Background(), &memory.SearchRequest{UserID: "user-1", Query: "x"}); err == nil {
		t.Fatal("closed pool was accepted")
	}
}

// A turn with a pool and memory on builds the cached memory service and
// still answers from the mock model.
func TestDBEdgeChatCachesMemoryService(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	server := mockOpenAI(t, false)
	defer server.Close()
	res, err := Chat(context.Background(), mockConfig(server), TurnInput{
		Pool: pool, UserID: userID, MemoryEnabled: true,
		SessionID: "dd000000-0000-0000-0000-00000000000b",
		Message:   "hi",
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	if res.Text != "Hello from mock" {
		t.Fatalf("text = %q, want %q", res.Text, "Hello from mock")
	}
}

// One model response carrying all 12 tool calls (valid args against the
// seed), then a final answer. Exercises every BuildTools handler body
// through the real runner with the caller's identity attached.
func TestDBEdgeChatInvokesAllTools(t *testing.T) {
	pool, _, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	var owner14976 int64
	if err := pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = 14976`).Scan(&owner14976); err != nil {
		t.Skip("no seeded project 14976")
	}
	if owner14976 != 31692 {
		t.Fatalf("project 14976 owner = %d, want 31692", owner14976)
	}
	var calls int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt64(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		if n > 1 {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": "mock", "object": "chat.completion", "created": 1, "model": "deepseek-flash",
				"choices": []any{map[string]any{"index": 0,
					"message":       map[string]any{"role": "assistant", "content": "done"},
					"finish_reason": "stop"}},
			})
			return
		}
		mk := func(id, name, args string) map[string]any {
			return map[string]any{"id": id, "type": "function",
				"function": map[string]any{"name": name, "arguments": args}}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "mock", "object": "chat.completion", "created": 1, "model": "deepseek-flash",
			"choices": []any{map[string]any{"index": 0,
				"message": map[string]any{"role": "assistant", "content": "working",
					"tool_calls": []any{
						mk("c1", "search_houses", `{"city":"Bandung"}`),
						mk("c2", "get_house", `{"house_id":6}`),
						mk("c3", "search_professionals", `{"role":"kontraktor"}`),
						mk("c4", "search_materials", `{"limit":99}`),
						mk("c5", "my_projects", `{}`),
						mk("c6", "get_project", `{"project_id":14976}`),
						mk("c7", "project_finance", `{"project_id":14976}`),
						mk("c8", "project_schedule", `{"project_id":14976}`),
						mk("c9", "project_bids", `{"project_id":14976}`),
						mk("c10", "my_bids", `{}`),
						mk("c11", "platform_help", `{"topic":"escrow"}`),
						mk("c12", "estimate_budget", `{"project_type":"new_build","area_m2":100}`),
					}},
				"finish_reason": "tool_calls"}},
		})
	}))
	defer server.Close()
	res, err := Chat(ctx, mockConfig(server), TurnInput{
		Pool: pool, UserID: owner14976,
		SessionID: "dd000000-0000-0000-0000-00000000000c",
		Message:   "do everything",
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	if res.Text != "done" {
		t.Fatalf("text = %q, want %q", res.Text, "done")
	}
	wantTools := []string{
		"estimate_budget", "get_house", "get_project", "my_bids",
		"my_projects", "platform_help", "project_bids", "project_finance",
		"project_schedule", "search_houses", "search_materials", "search_professionals",
	}
	if len(res.Tools) != len(wantTools) {
		t.Fatalf("tools = %q, want %q", res.Tools, wantTools)
	}
	for i := range wantTools {
		if res.Tools[i] != wantTools[i] {
			t.Fatalf("tools = %q, want %q", res.Tools, wantTools)
		}
	}
}
