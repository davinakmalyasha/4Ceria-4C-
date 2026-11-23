package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The MCP surface.
//
// Ceria's tools are exposed to external MCP clients (Claude Desktop, Cursor,
// IDE agents) through the same read-only catalog the in-product assistant
// uses. This is an integration boundary, not a second source of truth:
//
//   - every tool is read-only;
//   - the HTTP endpoint authenticates with the normal bearer token and scopes
//     project tools to the caller;
//   - the stdio command can run public tools without an account, and project
//     tools only when an operator explicitly supplies a user id.
//
// The in-product agent deliberately does NOT call this endpoint. It already
// has the tools in-process, with the caller's identity attached by the HTTP
// middleware; routing through MCP would add a network hop and a second auth
// path without adding a capability.

const mcpVersion = "1.0.0"

// NewMCPServer builds one MCP server for one identity. includePrivate controls
// the account-scoped tools; the HTTP handler always sets it, while the stdio
// command sets it only when a user id was supplied.
func NewMCPServer(tc ToolCtx, includePrivate bool) *mcp.Server {
	tc.Timeout = 12 * time.Second
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "4ceria",
		Version: mcpVersion,
	}, &mcp.ServerOptions{
		Instructions: "Read-only 4Ceria tools: property listings, verified professionals, materials, platform guidance, and (when authenticated) the caller's projects, finances, schedule and bids. No tool can move money, place a bid, sign a contract or file a dispute.",
	})

	addMCPTool(server, "search_houses", "Search live 4Ceria property listings by query, city, price band or bedrooms.", func(ctx context.Context, a HouseSearchArgs) (any, error) {
		return searchHouses(ctx, tc, a)
	})
	addMCPTool(server, "get_house", "Return one property listing in detail. Use the id from search_houses.", func(ctx context.Context, a HouseArgs) (any, error) {
		return getHouse(ctx, tc, a)
	})
	addMCPTool(server, "search_professionals", "Search the verified professional directory by role and free text.", func(ctx context.Context, a ProSearchArgs) (any, error) {
		return searchProfessionals(ctx, tc, a)
	})
	addMCPTool(server, "search_materials", "Search the live building-materials catalogue.", func(ctx context.Context, a MaterialSearchArgs) (any, error) {
		return searchMaterials(ctx, tc, a)
	})
	addMCPTool(server, "platform_help", "Authoritative 4Ceria process help: escrow, termins, bids, disputes, warranty, retention, verification, fees and how-to flows.", func(_ context.Context, a HelpArgs) (any, error) {
		return platformHelp(a), nil
	})
	addMCPTool(server, "estimate_budget", "A rough construction cost range in IDR. Always an estimate, never a quote.", func(_ context.Context, a EstimateArgs) (any, error) {
		return estimateBudget(a), nil
	})

	if includePrivate && tc.UserID > 0 {
		addMCPTool(server, "my_projects", "List the authenticated caller's projects (owned or hired on).", func(ctx context.Context, a MyProjectsArgs) (any, error) {
			return myProjects(ctx, tc, a)
		})
		addMCPTool(server, "get_project", "Return one project the authenticated caller can access.", func(ctx context.Context, a ProjectArgs) (any, error) {
			return getProject(ctx, tc, a)
		})
		addMCPTool(server, "project_finance", "Escrow summary and payment termins for one accessible project.", func(ctx context.Context, a ProjectArgs) (any, error) {
			return projectFinance(ctx, tc, a)
		})
		addMCPTool(server, "project_schedule", "Milestones, phases and progress for one accessible project.", func(ctx context.Context, a ProjectArgs) (any, error) {
			return projectSchedule(ctx, tc, a)
		})
		addMCPTool(server, "project_bids", "Proposals on a project the caller owns (or an admin).", func(ctx context.Context, a ProjectArgs) (any, error) {
			return projectBids(ctx, tc, a)
		})
		addMCPTool(server, "my_bids", "The authenticated professional's own proposals.", func(ctx context.Context, a MyBidsArgs) (any, error) {
			return myBids(ctx, tc, a)
		})
	}

	return server
}

func addMCPTool[In any](server *mcp.Server, name, description string, handler func(context.Context, In) (any, error)) {
	mcp.AddTool(server, &mcp.Tool{Name: name, Description: description},
		func(ctx context.Context, _ *mcp.CallToolRequest, in In) (*mcp.CallToolResult, any, error) {
			return mcpResult(ctx, func(ctx context.Context) (any, error) { return handler(ctx, in) })
		})
}

func mcpResult(ctx context.Context, call func(context.Context) (any, error)) (*mcp.CallToolResult, any, error) {
	out, err := call(ctx)
	if err != nil {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{&mcp.TextContent{Text: err.Error()}},
		}, nil, nil
	}
	encoded, marshalErr := json.MarshalIndent(out, "", "  ")
	if marshalErr != nil {
		return &mcp.CallToolResult{
			IsError: true,
			Content: []mcp.Content{&mcp.TextContent{Text: fmt.Sprintf("could not encode the tool result: %v", marshalErr)}},
		}, nil, nil
	}
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: string(encoded)}},
	}, out, nil
}
