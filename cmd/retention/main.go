// Command retention releases expired retention balances.
//
// Warranty-expired stages whose retention is still held are paid out as
// `retention_release` ledger rows, unless a warranty claim (open/fixing) or
// an open dispute blocks them.
//
// USAGE
//
//	go run ./cmd/retention [--project=ID] [--dry-run]
//	go run ./cmd/retention --project=12 --dry-run
//
// DATABASE_URL defaults to the local baseline; the session is pinned to UTC
// like every other Go entrypoint.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"

	"github.com/davinakmalyasha/4ceria/internal/httpapi"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	projectID := flag.Int64("project", 0, "limit to one project id (0 = all expired)")
	dryRun := flag.Bool("dry-run", false, "report what would be released, write nothing")
	flag.Parse()

	httpapi.LoadDotEnv(".env")
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	dsn := defaultRetentionDSN(os.Getenv("DATABASE_URL"))

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "retention: parsing DATABASE_URL: %v\n", err)
		os.Exit(1)
	}
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET TIME ZONE 'UTC'")
		return err
	}
	// Single-purpose sweeper: small pool, short life.
	cfg.MaxConns = defaultRetentionMaxConns()

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "retention: connecting to PostgreSQL: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "retention: PostgreSQL did not answer: %v\n", err)
		os.Exit(1)
	}

	filter := retentionProjectFilter(*projectID)

	res, err := httpapi.ReleaseExpiredRetentions(context.Background(), pool, filter, *dryRun, logger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "retention: %v\n", err)
		os.Exit(1)
	}

	for _, line := range res.Lines {
		fmt.Println(" ", line)
	}
	totalLine, statsLine := formatRetentionSummary(res, *dryRun)
	fmt.Println(totalLine)
	fmt.Println(statsLine)
}
