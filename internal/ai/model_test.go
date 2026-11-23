package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// These tests exercise the real ADK runner and the OpenAI-compatible client
// against a local mock. They do not need a model key or a database; they pin
// the stream assembly (partial chunks + final aggregate), which is where a
// duplicated answer is easy to introduce.

func mockOpenAI(t *testing.T, stream bool) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			t.Errorf("unexpected model path %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		if stream || strings.Contains(readRequestBody(r), `"stream":true`) {
			w.Header().Set("Content-Type", "text/event-stream")
			w.WriteHeader(http.StatusOK)
			chunks := []string{
				`{"id":"mock","object":"chat.completion.chunk","created":1,"model":"deepseek-flash","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}`,
				`{"id":"mock","object":"chat.completion.chunk","created":1,"model":"deepseek-flash","choices":[{"index":0,"delta":{"content":" from mock"},"finish_reason":null}]}`,
				`{"id":"mock","object":"chat.completion.chunk","created":1,"model":"deepseek-flash","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
			}
			for _, chunk := range chunks {
				fmt.Fprintf(w, "data: %s\n\n", chunk)
			}
			fmt.Fprint(w, "data: [DONE]\n\n")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "mock",
			"object":  "chat.completion",
			"created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{
				"index":         0,
				"message":       map[string]any{"role": "assistant", "content": "Hello from mock"},
				"finish_reason": "stop",
			}},
			"usage": map[string]any{"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13},
		})
	}))
}

func readRequestBody(r *http.Request) string {
	var b strings.Builder
	buf := make([]byte, 4096)
	for {
		n, err := r.Body.Read(buf)
		b.Write(buf[:n])
		if err != nil {
			break
		}
	}
	return b.String()
}

func mockConfig(server *httptest.Server) Config {
	return Config{
		APIKey:          "test",
		BaseURL:         server.URL + "/v1",
		Model:           "deepseek-flash",
		Temperature:     0.1,
		MaxOutputTokens: 128,
		MaxSteps:        4,
		Memory:          false,
		Specialists:     false,
	}
}

func TestChatAgainstMockModel(t *testing.T) {
	server := mockOpenAI(t, false)
	defer server.Close()

	result, err := Chat(context.Background(), mockConfig(server), TurnInput{
		SessionID: "11111111-1111-1111-1111-111111111111",
		Message:   "hello",
		History:   nil,
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	if result.Text != "Hello from mock" {
		t.Errorf("text = %q", result.Text)
	}
	if result.Steps == 0 {
		t.Error("no steps recorded")
	}
}

func TestStreamAgainstMockModelDoesNotDuplicateFinalText(t *testing.T) {
	server := mockOpenAI(t, true)
	defer server.Close()

	var deltas []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "22222222-2222-2222-2222-222222222222",
		Message:   "hello",
	}, func(chunk StreamChunk) bool {
		if chunk.Text != "" {
			deltas = append(deltas, chunk.Text)
		}
		return true
	})
	if result.Text != "Hello from mock" {
		t.Fatalf("text = %q", result.Text)
	}
	if strings.Join(deltas, "") != "Hello from mock" {
		t.Errorf("deltas = %q", strings.Join(deltas, ""))
	}
	if strings.Count(strings.Join(deltas, ""), "Hello") != 1 {
		t.Errorf("the answer was duplicated: %q", strings.Join(deltas, ""))
	}
}
