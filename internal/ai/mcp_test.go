package ai

import (
	"context"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPServerListsOnlyReadOnlyTools(t *testing.T) {
	ctx := context.Background()
	server := NewMCPServer(ToolCtx{}, false)
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0.0.1"}, nil)

	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer clientSession.Close()

	listed, err := clientSession.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	names := map[string]bool{}
	for _, item := range listed.Tools {
		names[item.Name] = true
	}
	for _, name := range []string{"search_houses", "get_house", "search_professionals", "search_materials", "platform_help", "estimate_budget"} {
		if !names[name] {
			t.Errorf("missing public MCP tool %q", name)
		}
	}
	if names["my_projects"] || names["get_project"] {
		t.Error("private tools must not be exposed without an identity")
	}
	for _, forbidden := range []string{"pay", "bid", "sign", "dispute", "delete"} {
		for name := range names {
			if strings.Contains(name, forbidden) {
				t.Errorf("mutating-sounding tool exposed: %q", name)
			}
		}
	}
}

func TestMCPToolCallReturnsStructuredText(t *testing.T) {
	ctx := context.Background()
	server := NewMCPServer(ToolCtx{}, false)
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0.0.1"}, nil)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer clientSession.Close()

	result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
		Name:      "platform_help",
		Arguments: map[string]any{"topic": "escrow"},
	})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned an error: %+v", result)
	}
	if len(result.Content) == 0 {
		t.Fatal("empty tool result")
	}
	text, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("content type %T", result.Content[0])
	}
	if !strings.Contains(text.Text, "dispute") {
		t.Errorf("escrow help missing dispute freeze: %q", text.Text)
	}
}
