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
	"strconv"
	"strings"
	"syscall"
	"time"

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
	if dsn == "" {
		logger.Error("DATABASE_URL is required")
		os.Exit(2)
	}
	userID := *userFlag
	if userID == 0 {
		if raw := strings.TrimSpace(os.Getenv("CERIA_MCP_USER_ID")); raw != "" {
			parsed, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || parsed <= 0 {
				logger.Error("CERIA_MCP_USER_ID must be a positive integer")
				os.Exit(2)
			}
			userID = parsed
		}
	}
	admin := *adminFlag || strings.EqualFold(strings.TrimSpace(os.Getenv("CERIA_MCP_ADMIN")), "true")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logger.Error("connect PostgreSQL", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
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
