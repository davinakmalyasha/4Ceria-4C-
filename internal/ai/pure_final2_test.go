package ai

// DB-free micro-closure to lift the package total past 45%:
// pure helpers (mergeDelta/eventText), replayHistory truncation/skip,
// Chat disabled fast path, and Stream snag via a content-less mock.
// No *pgxpool.Pool, no model key, no real network (httptest loopback only).

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestFinalMergeDeltaEdges(t *testing.T) {
	if delta, next := mergeDelta("", "abc"); delta != "abc" || next != "abc" {
		t.Fatalf("empty emitted = (%q, %q)", delta, next)
	}
	if delta, next := mergeDelta("Hello", "Hello world"); delta != " world" || next != "Hello world" {
		t.Fatalf("prefix = (%q, %q)", delta, next)
	}
	if delta, next := mergeDelta("Hello", "Hi"); delta != "Hi" || next != "HelloHi" {
		t.Fatalf("divergent = (%q, %q)", delta, next)
	}
	if delta, next := mergeDelta("x", ""); delta != "" || next != "x" {
		t.Fatalf("empty incoming = (%q, %q)", delta, next)
	}
}

func TestFinalEventTextSkipsNonTextParts(t *testing.T) {
	ev := &session.Event{}
	ev.Content = &genai.Content{Parts: []*genai.Part{
		nil,
		{Thought: true, Text: "hidden"},
		{Text: ""},
		{Text: "visible"},
	}}
	if got := eventText(ev); got != "visible" {
		t.Fatalf("eventText = %q, want visible", got)
	}
}

func TestFinalReplayHistoryTruncatesAndSkips(t *testing.T) {
	ctx := context.Background()
	sessions := session.InMemoryService()
	created, err := sessions.Create(ctx, &session.CreateRequest{
		AppName: "ceria", UserID: "user-1", SessionID: "replay-test",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// Over-long history with a skipped role exercises truncation + continue.
	history := make([]StoredMessage, 0, MaxHistoryMessages+5)
	for i := 0; i < MaxHistoryMessages+5; i++ {
		role := "user"
		if i%2 == 1 {
			role = "assistant"
		}
		if i == 3 {
			role = "system"
		}
		history = append(history, StoredMessage{
			Role: role, Content: fmt.Sprintf("m%d", i), CreatedAt: time.Now().UTC(),
		})
	}
	if err := replayHistory(ctx, sessions, created.Session, history); err != nil {
		t.Fatalf("replay: %v", err)
	}
	if err := replayHistory(ctx, sessions, created.Session, nil); err != nil {
		t.Fatalf("empty replay: %v", err)
	}
}

func TestFinalChatDisabledFastPath(t *testing.T) {
	if _, err := Chat(context.Background(), Config{}, TurnInput{Message: "hi"}); err == nil {
		t.Fatal("keyless Chat was accepted")
	} else if !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("err = %v, want disabled", err)
	}
}

func contentlessStreamServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
}

func TestFinalStreamSnagOnContentlessStream(t *testing.T) {
	server := contentlessStreamServer(t)
	defer server.Close()
	var errs []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "55555555-5555-5555-5555-555555555555",
		Message:   "hello",
	}, func(chunk StreamChunk) bool {
		if chunk.Error != "" {
			errs = append(errs, chunk.Error)
		}
		return true
	})
	if result.Text != "" {
		t.Fatalf("contentless stream text = %q", result.Text)
	}
	if len(errs) == 0 || !strings.Contains(errs[0], "hit a snag") {
		t.Fatalf("errors = %v, want the snag chunk", errs)
	}
}
