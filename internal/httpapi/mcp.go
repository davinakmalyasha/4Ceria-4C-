package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/davinakmalyasha/4ceria/internal/ai"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCPHandler serves the read-only MCP endpoint at `POST /api/mcp`.
//
// The endpoint is stateless: every request is self-contained and authenticated
// by the normal bearer token, so the handler keeps no server-side session map
// and no identity can be reused by a later request. The route manifest applies
// `auth` and the request body limit before this handler runs.
func MCPHandler(pool *pgxpool.Pool) http.HandlerFunc {
	handler := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
		caller, ok := CallerFrom(r.Context())
		if !ok || caller == nil {
			return nil
		}
		return ai.NewMCPServer(ai.ToolCtx{
			Pool:    pool,
			UserID:  caller.UserID(),
			IsAdmin: caller.IsAdmin(),
		}, true)
	}, &mcp.StreamableHTTPOptions{
		Stateless:                    true,
		MaxRequestBodyBytes:          1 << 20,
		PropagateRequestCancellation: true,
	})
	return func(w http.ResponseWriter, r *http.Request) {
		slog.Debug("mcp request", "method", r.Method, "path", r.URL.Path)
		handler.ServeHTTP(w, r)
	}
}
