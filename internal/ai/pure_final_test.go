package ai

// Final DB-free closure: NewMCPServer arg parsing (private tools on/off),
// mcpResult error/encode edges, search_memory/remember tool Run branches via
// a stub agent context, buildSpecialists with a real (uncalled) model, and
// Stream disabled/cancelled/yield-false paths. No *pgxpool.Pool, no model key.

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/memory"
	"google.golang.org/adk/v2/model/openaimodel"
	"google.golang.org/adk/v2/tool/toolconfirmation"
	"google.golang.org/genai"
)

// stubAgentCtx satisfies the two agent.Context methods the memory tools use.
// Embedding agent.Context keeps the rest without a database.
type stubAgentCtx struct {
	agent.Context
	searchResp *memory.SearchResponse
	searchErr  error
}

func (s *stubAgentCtx) SearchMemory(_ context.Context, _ string) (*memory.SearchResponse, error) {
	return s.searchResp, s.searchErr
}

func (s *stubAgentCtx) ToolConfirmation() *toolconfirmation.ToolConfirmation { return nil }

type toolRunner interface {
	Run(agent.Context, any) (map[string]any, error)
}

func TestFinalMCPServerPrivateRegistration(t *testing.T) {
	// Private tools appear only with includePrivate and a user id.
	cases := []struct {
		name          string
		include       bool
		userID        int64
		wantMyProject bool
	}{
		{"public only", false, 0, false},
		{"private without identity stays public", true, 0, false},
		{"private with identity", true, 42, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := NewMCPServer(ToolCtx{UserID: tc.userID}, tc.include)
			client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0.0.1"}, nil)
			serverTransport, clientTransport := mcp.NewInMemoryTransports()
			serverSession, err := server.Connect(context.Background(), serverTransport, nil)
			if err != nil {
				t.Fatalf("server connect: %v", err)
			}
			defer serverSession.Close()
			clientSession, err := client.Connect(context.Background(), clientTransport, nil)
			if err != nil {
				t.Fatalf("client connect: %v", err)
			}
			defer clientSession.Close()
			listed, err := clientSession.ListTools(context.Background(), nil)
			if err != nil {
				t.Fatalf("list: %v", err)
			}
			names := map[string]bool{}
			for _, item := range listed.Tools {
				names[item.Name] = true
			}
			if names["my_projects"] != tc.wantMyProject {
				t.Fatalf("my_projects present = %v, want %v", names["my_projects"], tc.wantMyProject)
			}
			if !names["search_houses"] || !names["platform_help"] {
				t.Fatal("public tools missing")
			}
		})
	}
}

func TestFinalMCPEstimateBudgetPure(t *testing.T) {
	server := NewMCPServer(ToolCtx{}, false)
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0.0.1"}, nil)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(context.Background(), serverTransport, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(context.Background(), clientTransport, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "estimate_budget",
		Arguments: map[string]any{"project_type": "new_build", "area_m2": float64(100)},
	})
	if err != nil {
		t.Fatalf("call: %v", err)
	}
	if result.IsError {
		t.Fatalf("pure tool errored: %+v", result)
	}
}

func TestFinalMCPResultEdges(t *testing.T) {
	if _, _, err := mcpResult(context.Background(), func(context.Context) (any, error) {
		return nil, errors.New("boom")
	}); err != nil {
		t.Fatalf("error path must not return a Go error: %v", err)
	} else {
		// The CallToolResult carries IsError; checked via direct call below.
		res, _, _ := mcpResult(context.Background(), func(context.Context) (any, error) {
			return nil, errors.New("boom")
		})
		if !res.IsError {
			t.Fatal("error path must set IsError")
		}
	}
	res, _, err := mcpResult(context.Background(), func(context.Context) (any, error) {
		return func() {}, nil
	})
	if err != nil {
		t.Fatalf("encode path returned Go error: %v", err)
	}
	if !res.IsError {
		t.Fatal("unencodable result must set IsError")
	}
}

func TestFinalSearchMemoryToolBranches(t *testing.T) {
	tool := newSearchMemoryTool(ToolCtx{})
	runner, ok := tool.(toolRunner)
	if !ok {
		t.Fatal("search_memory tool has no Run method")
	}

	// Empty query asks for a topic without touching memory.
	out, err := runner.Run(&stubAgentCtx{}, map[string]any{"query": "   "})
	if err != nil {
		t.Fatalf("empty query: %v", err)
	}
	if note, _ := out["note"].(string); !strings.Contains(note, "topic") {
		t.Fatalf("empty query note = %v", out)
	}

	// Memory failure surfaces as a soft error, never a panic.
	if _, err := runner.Run(&stubAgentCtx{searchErr: errors.New("down")}, map[string]any{"query": "house"}); err == nil {
		t.Fatal("search error was swallowed")
	}

	// Empty result notes the miss.
	out, err = runner.Run(&stubAgentCtx{searchResp: &memory.SearchResponse{}}, map[string]any{"query": "house"})
	if err != nil {
		t.Fatalf("empty resp: %v", err)
	}
	if note, _ := out["note"].(string); !strings.Contains(note, "No matching") {
		t.Fatalf("empty resp note = %v", out)
	}

	// Entries join text parts, skipping thoughts and blanks.
	resp := &memory.SearchResponse{Memories: []memory.Entry{
		{Author: "user", Content: &genai.Content{Parts: []*genai.Part{{Text: "prefers"}, {Text: "sharia", Thought: true}}}},
		{Author: "user", Content: &genai.Content{Parts: []*genai.Part{{Text: ""}, nil}}},
		{Author: "user", Content: nil},
		{Author: "user", Content: &genai.Content{Parts: []*genai.Part{{Text: "Bandung"}}}},
	}}
	out, err = runner.Run(&stubAgentCtx{searchResp: resp}, map[string]any{"query": "house"})
	if err != nil {
		t.Fatalf("entries: %v", err)
	}
	raw, ok := out["memories"]
	if !ok {
		t.Fatalf("memories missing: %v", out)
	}
	list, ok := raw.([]any)
	if !ok || len(list) != 2 {
		t.Fatalf("memories = %#v, want 2 text entries", raw)
	}
}

func TestFinalRememberToolBranches(t *testing.T) {
	// Memory off (nil pool) refuses without a database.
	tool := newRememberTool(ToolCtx{})
	runner, ok := tool.(toolRunner)
	if !ok {
		t.Fatal("remember tool has no Run method")
	}
	out, err := runner.Run(&stubAgentCtx{}, map[string]any{"content": "likes Bandung"})
	if err != nil {
		t.Fatalf("disabled remember: %v", err)
	}
	if stored, _ := out["stored"].(bool); stored {
		t.Fatalf("disabled remember stored: %v", out)
	}
}

func TestFinalBuildAgentToolsWithSpecialists(t *testing.T) {
	llm, err := openaimodel.NewModel(context.Background(), "deepseek-flash", &openaimodel.ClientConfig{
		APIKey:  "test",
		BaseURL: "http://127.0.0.1:1/v1",
		API:     openaimodel.APIChatCompletions,
	})
	if err != nil {
		t.Fatalf("NewModel: %v", err)
	}
	if llm == nil {
		t.Fatal("nil llm")
	}
	base, err := BuildTools(ToolCtx{})
	if err != nil {
		t.Fatal(err)
	}
	tools, _, err := BuildAgentTools(context.Background(), Config{Specialists: true}, ToolCtx{}, llm)
	if err != nil {
		t.Fatalf("specialists build: %v", err)
	}
	// Two specialists join the direct tools.
	if len(tools) != len(base)+2 {
		t.Fatalf("tools = %d, want %d (direct + 2 specialists)", len(tools), len(base)+2)
	}
	names := map[string]bool{}
	for _, tool := range tools {
		names[tool.Name()] = true
	}
	if !names["property_scout"] || !names["project_auditor"] {
		t.Fatalf("specialists missing: %v", names)
	}
}

func TestFinalStreamDisabled(t *testing.T) {
	var errs []string
	result := Stream(context.Background(), Config{}, TurnInput{Message: "hi"}, func(chunk StreamChunk) bool {
		if chunk.Error != "" {
			errs = append(errs, chunk.Error)
		}
		return true
	})
	if result.Text != "" {
		t.Fatalf("disabled stream text = %q", result.Text)
	}
	if len(errs) != 1 || !strings.Contains(errs[0], "disabled") {
		t.Fatalf("disabled stream errors = %v", errs)
	}
}

func TestFinalStreamCancelledContextFailsRunner(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	called := false
	result := Stream(ctx, Config{APIKey: "test", BaseURL: "http://127.0.0.1:1/v1", Model: "m", MaxSteps: 1},
		TurnInput{SessionID: "33333333-3333-3333-3333-333333333333", Message: "hi"},
		func(chunk StreamChunk) bool {
			called = true
			if chunk.Error == "" {
				t.Errorf("expected a start-up error chunk, got %+v", chunk)
			}
			return true
		})
	if !called {
		t.Fatal("cancelled stream yielded nothing")
	}
	if result.Text != "" {
		t.Fatalf("cancelled stream text = %q", result.Text)
	}
}

func TestFinalStreamYieldFalseStops(t *testing.T) {
	server := mockOpenAI(t, true)
	defer server.Close()
	calls := 0
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "44444444-4444-4444-4444-444444444444",
		Message:   "hello",
	}, func(chunk StreamChunk) bool {
		calls++
		return false
	})
	if calls == 0 {
		t.Fatal("yield was never called")
	}
	_ = result
}
