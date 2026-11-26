package ai

// Mock-model edge tests for Chat/Stream assembly (service.go) plus the small
// pure-unit edges they pin. No DATABASE_URL is required; the model is an
// httptest loopback, never a live provider.
//
// Each test asserts LITERAL expectations: exact text, exact error strings
// from our own code, exact chunk sequences. A Logf-only test would prove
// nothing, so there are none here.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"google.golang.org/adk/v2/memory"
	"google.golang.org/adk/v2/session"
)

func edgeWriteChunk(w http.ResponseWriter, payload map[string]any) {
	raw, _ := json.Marshal(payload)
	fmt.Fprintf(w, "data: %s\n\n", raw)
}

// Non-streaming mock: the first model call returns text plus one pure tool
// call, every later call is a 500. Pins collectFinal's error-after-text
// break (the partial answer survives) and the BuildTools platform_help
// handler body (the runner executes it in-process, no DB needed).
func edgeTextToolThen500Server(t *testing.T) *httptest.Server {
	t.Helper()
	var calls int64
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt64(&calls, 1) > 1 {
			http.Error(w, "overloaded", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "mock", "object": "chat.completion", "created": 1, "model": "deepseek-flash",
			"choices": []any{map[string]any{
				"index": 0,
				"message": map[string]any{
					"role":    "assistant",
					"content": "checking escrow",
					"tool_calls": []any{map[string]any{
						"id": "call_1", "type": "function",
						"function": map[string]any{"name": "platform_help", "arguments": `{"topic":"escrow"}`},
					}},
				},
				"finish_reason": "tool_calls",
			}},
		})
	}))
}

func TestModelEdgeChatTextToolThenModel500(t *testing.T) {
	server := edgeTextToolThen500Server(t)
	defer server.Close()
	res, err := Chat(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-000000000001",
		Message:   "explain escrow",
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	if res.Text != "checking escrow" {
		t.Fatalf("text = %q, want %q", res.Text, "checking escrow")
	}
}

// A whitespace-only model reply passes the provider layer (it is non-empty
// on the wire) but trims to nothing: our own "empty model response" error.
func TestModelEdgeChatWhitespaceIsEmptyResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "mock", "object": "chat.completion", "created": 1, "model": "deepseek-flash",
			"choices": []any{map[string]any{
				"index":         0,
				"message":       map[string]any{"role": "assistant", "content": "   "},
				"finish_reason": "stop",
			}},
		})
	}))
	defer server.Close()
	res, err := Chat(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-000000000009",
		Message:   "hi",
	})
	if err == nil {
		t.Fatalf("whitespace reply was accepted with text %q", res.Text)
	}
	if err.Error() != "empty model response" {
		t.Fatalf("err = %q, want %q", err.Error(), "empty model response")
	}
	if res.Text != "" {
		t.Fatalf("text = %q, want empty", res.Text)
	}
}

// The ADK normalizes a user-role model message to a model-authored event, so
// collectFinal answers it instead of skipping it as a user echo. Pins the
// current behavior: if ADK ever surfaces Author=user here, this fails and
// the user-event skip branch gets its test.
func TestModelEdgeChatUserRoleMessageReturnsText(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "mock", "object": "chat.completion", "created": 1, "model": "deepseek-flash",
			"choices": []any{map[string]any{
				"index":         0,
				"message":       map[string]any{"role": "user", "content": "echo"},
				"finish_reason": "stop",
			}},
		})
	}))
	defer server.Close()
	res, err := Chat(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-00000000000a",
		Message:   "hi",
	})
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}
	if res.Text != "echo" {
		t.Fatalf("text = %q, want %q", res.Text, "echo")
	}
}

// Cumulative-style partials ("Hello", then "Hello from mock") make the
// aggregated final ("HelloHello from mock") diverge from the merged stream:
// the client must replace the bubble instead of appending a duplicate.
func edgeCumulativeServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		for _, d := range []map[string]any{
			{"role": "assistant", "content": "Hello"},
			{"role": "assistant", "content": "Hello from mock"},
		} {
			edgeWriteChunk(w, map[string]any{
				"id": "mock", "object": "chat.completion.chunk", "created": 1,
				"model":   "deepseek-flash",
				"choices": []any{map[string]any{"index": 0, "delta": d, "finish_reason": nil}},
			})
		}
		edgeWriteChunk(w, map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}},
		})
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
}

func TestModelEdgeStreamReplaceDivergentFinal(t *testing.T) {
	server := edgeCumulativeServer(t)
	defer server.Close()
	var replaced []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-000000000004",
		Message:   "hi",
	}, func(chunk StreamChunk) bool {
		if chunk.Replace != "" {
			replaced = append(replaced, chunk.Replace)
		}
		return true
	})
	if len(replaced) != 1 {
		t.Fatalf("replace chunks = %q, want exactly one", replaced)
	}
	if replaced[0] != "HelloHello from mock" {
		t.Fatalf("replace = %q, want %q", replaced[0], "HelloHello from mock")
	}
	if result.Text != "HelloHello from mock" {
		t.Fatalf("text = %q, want %q", result.Text, "HelloHello from mock")
	}
}

// A whitespace-only stream is the Stream twin of the whitespace Chat case:
// the provider accepts it, but it trims to nothing, so our own empty-reply
// error goes to the client.
func TestModelEdgeStreamEmptyYieldsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		edgeWriteChunk(w, map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"role": "assistant", "content": " "}, "finish_reason": nil}},
		})
		edgeWriteChunk(w, map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}},
		})
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()
	var errs []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-000000000005",
		Message:   "hi",
	}, func(chunk StreamChunk) bool {
		if chunk.Error != "" {
			errs = append(errs, chunk.Error)
		}
		return true
	})
	if result.Text != "" {
		t.Fatalf("text = %q, want empty", result.Text)
	}
	if len(errs) != 1 {
		t.Fatalf("errors = %q, want exactly one", errs)
	}
	if errs[0] != "The assistant returned an empty reply. Please try again." {
		t.Fatalf("error = %q, want the empty-reply message", errs[0])
	}
}

// Yielding false on the replace chunk stops the run right there: the
// replacement is delivered and the authoritative final becomes the answer.
func TestModelEdgeStreamReplaceCancelStops(t *testing.T) {
	server := edgeCumulativeServer(t)
	defer server.Close()
	var replaced []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-00000000000d",
		Message:   "hi",
	}, func(chunk StreamChunk) bool {
		if chunk.Replace != "" {
			replaced = append(replaced, chunk.Replace)
			return false
		}
		return true
	})
	if len(replaced) != 1 || replaced[0] != "HelloHello from mock" {
		t.Fatalf("replace chunks = %q, want [HelloHello from mock]", replaced)
	}
	if result.Text != "HelloHello from mock" {
		t.Fatalf("text = %q, want %q", result.Text, "HelloHello from mock")
	}
}
// Yielding false on the tool-started chunk stops the run before the tool
// executes: the started status is delivered and nothing else runs.
func TestModelEdgeStreamToolStartedCancelStops(t *testing.T) {
	server := toolcallStreamServer(t)
	defer server.Close()
	var statuses []string
	_ = Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-000000000006",
		Message:   "explain escrow",
	}, func(chunk StreamChunk) bool {
		if chunk.Tool != "" {
			statuses = append(statuses, chunk.Tool+":"+chunk.ToolStatus)
			if chunk.ToolStatus == "started" {
				return false
			}
		}
		return true
	})
	if len(statuses) != 1 || statuses[0] != "platform_help:started" {
		t.Fatalf("statuses = %q, want [platform_help:started]", statuses)
	}
}

// Yielding false on the tool-completed chunk stops the run after the tool
// executed: both statuses are delivered, the follow-up answer never streams.
func TestModelEdgeStreamToolCompletedCancelStops(t *testing.T) {
	server := toolcallStreamServer(t)
	defer server.Close()
	var statuses []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-00000000000e",
		Message:   "explain escrow",
	}, func(chunk StreamChunk) bool {
		if chunk.Tool != "" {
			statuses = append(statuses, chunk.Tool+":"+chunk.ToolStatus)
			if chunk.ToolStatus == "completed" {
				return false
			}
		}
		return true
	})
	if len(statuses) != 2 || statuses[0] != "platform_help:started" || statuses[1] != "platform_help:completed" {
		t.Fatalf("statuses = %q, want [platform_help:started platform_help:completed]", statuses)
	}
	if result.Text != "" {
		t.Fatalf("text = %q, want empty (answer never streamed)", result.Text)
	}
}

// A usage-bearing SSE chunk records UsageMetadata on the Stream result.
func TestModelEdgeStreamUsageChunkRecorded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		edgeWriteChunk(w, map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"role": "assistant", "content": "Hi"}, "finish_reason": nil}},
		})
		edgeWriteChunk(w, map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model":   "deepseek-flash",
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}},
			"usage":   map[string]any{"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13},
		})
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-000000000007",
		Message:   "hi",
	}, func(chunk StreamChunk) bool { return true })
	if result.Text != "Hi" {
		t.Fatalf("text = %q, want %q", result.Text, "Hi")
	}
	if result.Usage == nil {
		t.Fatal("usage was not recorded")
	}
	if result.Usage.PromptTokenCount != 10 || result.Usage.CandidatesTokenCount != 3 || result.Usage.TotalTokenCount != 13 {
		t.Fatalf("usage = %+v, want 10/3/13", result.Usage)
	}
}

// Streaming twin of the Chat 500 case: a text partial plus a pure tool call,
// then the follow-up model call fails. The partial answer survives.
func TestModelEdgeStreamTextSurvivesModel500(t *testing.T) {
	var calls int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt64(&calls, 1)
		if n > 1 {
			http.Error(w, "overloaded", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		edgeWriteChunk(w, map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model": "deepseek-flash",
			"choices": []any{map[string]any{"index": 0,
				"delta":         map[string]any{"role": "assistant", "content": "Working"},
				"finish_reason": nil}},
		})
		edgeWriteChunk(w, map[string]any{
			"id": "mock", "object": "chat.completion.chunk", "created": 1,
			"model": "deepseek-flash",
			"choices": []any{map[string]any{"index": 0, "delta": map[string]any{
				"role": "assistant", "content": nil,
				"tool_calls": []any{map[string]any{
					"index": 0, "id": "call_1", "type": "function",
					"function": map[string]any{"name": "platform_help", "arguments": `{"topic":"escrow"}`},
				}},
			}, "finish_reason": "tool_calls"}},
		})
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "dd000000-0000-0000-0000-000000000008",
		Message:   "explain escrow",
	}, func(chunk StreamChunk) bool { return true })
	if result.Text != "Working" {
		t.Fatalf("text = %q, want %q", result.Text, "Working")
	}
}

// The int64 case of idrText: display-only formatting, integer minor units in,
// grouped rupiah out.
func TestModelEdgeIdrTextInt64(t *testing.T) {
	if got := idrText(int64(1500000)); got != "Rp 1.500.000" {
		t.Fatalf("int64 = %q, want %q", got, "Rp 1.500.000")
	}
}

// A nil pool means "no database for this turn": the scoped-tool lookup
// answers empty instead of panicking.
func TestModelEdgeCallerProfileIDsNilPool(t *testing.T) {
	ids := callerProfileIDsCached(context.Background(), ToolCtx{}, 1)
	if len(ids) != 0 {
		t.Fatalf("nil pool = %v, want empty", ids)
	}
}

type edgeErrMemoryService struct{}

func (edgeErrMemoryService) AddSessionToMemory(context.Context, session.Session) error {
	return nil
}
func (edgeErrMemoryService) SearchMemory(context.Context, *memory.SearchRequest) (*memory.SearchResponse, error) {
	return nil, errors.New("zz boom")
}

// The turn cache passes an inner search failure through unwrapped.
func TestModelEdgeCachedMemoryServiceInnerError(t *testing.T) {
	cached := newCachedMemoryService(edgeErrMemoryService{})
	_, err := cached.SearchMemory(context.Background(), &memory.SearchRequest{UserID: "user-1", Query: "x"})
	if err == nil {
		t.Fatal("inner error was swallowed")
	}
	if err.Error() != "zz boom" {
		t.Fatalf("err = %q, want %q", err.Error(), "zz boom")
	}
}
