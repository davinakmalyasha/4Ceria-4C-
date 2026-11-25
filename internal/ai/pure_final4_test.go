package ai

// DB-free error-path closure: replayHistory AppendEvent failure via a nil
// session, and Chat error propagation via a 200 mock with no content
// (the model layer refuses it before collectFinal's own empty check).
// No *pgxpool.Pool, no model key, httptest loopback only.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"google.golang.org/adk/v2/session"
)

func TestFinalReplayHistoryAppendError(t *testing.T) {
	ctx := context.Background()
	sessions := session.InMemoryService()
	history := []StoredMessage{
		{Role: "user", Content: "hello", CreatedAt: time.Now().UTC()},
	}
	if err := replayHistory(ctx, sessions, nil, history); err == nil {
		t.Fatal("nil-session replay was accepted")
	}
}

func emptyChatServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "mock",
			"object":  "chat.completion",
			"created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{
				"index":         0,
				"message":       map[string]any{"role": "assistant", "content": ""},
				"finish_reason": "stop",
			}},
		})
	}))
}

func TestFinalChatEmptyResponse(t *testing.T) {
	server := emptyChatServer(t)
	defer server.Close()
	if _, err := Chat(context.Background(), mockConfig(server), TurnInput{
		SessionID: "66666666-6666-6666-6666-666666666666",
		Message:   "hello",
	}); err == nil {
		t.Fatal("content-less model response was accepted")
	}
}
