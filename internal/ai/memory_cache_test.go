package ai

import (
	"context"
	"sync"
	"testing"

	"google.golang.org/adk/v2/memory"
	"google.golang.org/adk/v2/session"
)

type countingMemory struct {
	mu       sync.Mutex
	calls    int
	response *memory.SearchResponse
}

func (c *countingMemory) AddSessionToMemory(context.Context, session.Session) error { return nil }

func (c *countingMemory) SearchMemory(context.Context, *memory.SearchRequest) (*memory.SearchResponse, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls++
	return c.response, nil
}

func (c *countingMemory) Calls() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls
}

func TestMemorySearchIsCachedForOneTurn(t *testing.T) {
	inner := &countingMemory{response: &memory.SearchResponse{Memories: []memory.Entry{}}}
	cached := newCachedMemoryService(inner)

	first, err := cached.SearchMemory(context.Background(), &memory.SearchRequest{
		UserID: "user-7",
		Query:  "house in Bandung",
	})
	if err != nil {
		t.Fatalf("first search: %v", err)
	}
	if first == nil {
		t.Fatal("nil response")
	}
	for i := 0; i < 3; i++ {
		if _, err := cached.SearchMemory(context.Background(), &memory.SearchRequest{
			UserID: "user-7",
			Query:  "  house in Bandung  ",
		}); err != nil {
			t.Fatalf("cached search: %v", err)
		}
	}
	if got := inner.Calls(); got != 1 {
		t.Fatalf("inner searches = %d, want 1", got)
	}

	if _, err := cached.SearchMemory(context.Background(), &memory.SearchRequest{
		UserID: "user-7",
		Query:  "material price",
	}); err != nil {
		t.Fatalf("second query: %v", err)
	}
	if got := inner.Calls(); got != 2 {
		t.Fatalf("inner searches = %d, want 2", got)
	}
}
