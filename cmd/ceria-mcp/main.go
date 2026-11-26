// Command ceria-mcp is the stdio MCP front-end for 4Ceria.
//
// It exposes the same read-only catalog as the HTTP MCP endpoint, for clients
// that launch a local process (Claude Desktop, Cursor, an IDE agent). Public
// tools work with only DATABASE_URL; account-scoped tools are enabled when
// CERIA_MCP_USER_ID (or --user) names the account that should own the
// session.
//
// The process speaks MCP on stdout, so every log line goes to stderr. A
// database failure is fatal: a tool server that silently answers "no data"
// would be worse than one that refuses to start.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/davinakmalyasha/4ceria/internal/ai"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	userFlag := flag.Int64("user", 0, "4Ceria user id for account-scoped tools (0 = public tools only)")
	adminFlag := flag.Bool("admin", false, "treat the supplied user as an administrator")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if err := validateMCPDSN(dsn); err != nil {
		logger.Error("DATABASE_URL is required")
		os.Exit(2)
	}
	userID, err := resolveMCPUserID(*userFlag, os.Getenv("CERIA_MCP_USER_ID"))
	if err != nil {
		logger.Error("CERIA_MCP_USER_ID must be a positive integer")
		os.Exit(2)
	}
	admin := resolveMCPAdmin(*adminFlag, os.Getenv("CERIA_MCP_ADMIN"))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logger.Error("connect PostgreSQL", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	pingCtx, cancel := context.WithTimeout(ctx, defaultMCPPingTimeout())
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		logger.Error("PostgreSQL is unreachable", "error", err)
		os.Exit(1)
	}

	server := ai.NewMCPServer(ai.ToolCtx{
		Pool:    pool,
		UserID:  userID,
		IsAdmin: admin,
	}, userID > 0)

	logger.Info("4Ceria MCP server ready", "user_id", userID, "admin", admin)
	if err := server.Run(ctx, &mcp.StdioTransport{}); err != nil && ctx.Err() == nil {
		logger.Error("MCP server stopped", "error", err)
		os.Exit(1)
	}
}
