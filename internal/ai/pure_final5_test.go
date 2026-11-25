package ai

// DB-free Stream delegation closure: the mock model issues a platform_help
// tool call (pure, no DB), the runner executes it in-process, and the mock
// answers the follow-up with final text. Covers the FunctionCall/Response
// status branches and the final-aggregate paths. Httptest loopback only.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func toolcallStreamServer(t *testing.T) *httptest.Server {
	t.Helper()
	var calls int64
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt64(&calls, 1)
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		writeChunk := func(payload map[string]any) {
			raw, _ := json.Marshal(payload)
			fmt.Fprintf(w, "data: %s\n\n", raw)
		}
		if n == 1 {
			delta := map[string]any{
				"role":    "assistant",
				"content": nil,
				"tool_calls": []any{map[string]any{
					"index": 0,
					"id":    "call_1",
					"type":  "function",
					"function": map[string]any{
						"name":      "platform_help",
						"arguments": `{"topic":"escrow"}`,
					},
				}},
			}
			writeChunk(map[string]any{
				"id": "mock", "object": "chat.completion.chunk", "created": 1,
				"model":   "deepseek-flash",
				"choices": []any{map[string]any{"index": 0, "delta": delta, "finish_reason": nil}},
			})
			writeChunk(map[string]any{
				"id": "mock", "object": "chat.completion.chunk", "created": 1,
				"model":   "deepseek-flash",
				"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "tool_calls"}},
			})
			fmt.Fprint(w, "data: [DONE]\n\n")
			return
		}
		for _, text := range []string{"Hello from mock"} {
			writeChunk(map[string]any{
				"id": "mock", "object": "chat.completion.chunk", "created": 1,
				"model": "deepseek-flash",
				"choices": []any{map[string]any{
					"index":         0,
					"delta":         map[string]any{"role": "assistant", "content": text},
					"finish_reason": nil,
				}},
			})
		}
		writeChunk(map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}},
		})
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
}

func TestFinalStreamDelegatesToPureTool(t *testing.T) {
	server := toolcallStreamServer(t)
	defer server.Close()
	var statuses []string
	var texts []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "77777777-7777-7777-7777-777777777777",
		Message:   "explain escrow",
	}, func(chunk StreamChunk) bool {
		if chunk.Tool != "" {
			statuses = append(statuses, chunk.Tool+":"+chunk.ToolStatus)
		}
		if chunk.Text != "" {
			texts = append(texts, chunk.Text)
		}
		return true
	})
	if result.Text == "" {
		t.Fatalf("delegated stream returned no text (statuses=%v texts=%v)", statuses, texts)
	}
	found := false
	for _, s := range statuses {
		if strings.HasPrefix(s, "platform_help:") {
			found = true
		}
	}
	if !found {
		t.Fatalf("platform_help tool status never yielded: %v", statuses)
	}
}
