// Command retention releases expired retention balances.
//
// Mirrors `escrow:release-retention` from the legacy stack: warranty-expired
// stages whose retention is still held are paid out as `retention_release`
// ledger rows, unless a warranty claim (open/fixing) or an open dispute
// blocks them.
//
// USAGE
//
//	go run ./cmd/retention [--project=ID] [--dry-run]
//	go run ./cmd/retention --project=12 --dry-run
//
// DATABASE_URL defaults to the local baseline; the session is pinned to UTC
// like every other Go entrypoint (AGENTS.md trap #7).
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

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres@127.0.0.1:5432/4ceria_pgcheck"
	}

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
	cfg.MaxConns = 4

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

	var filter *int64
	if *projectID != 0 {
		filter = projectID
	}

	res, err := httpapi.ReleaseExpiredRetentions(context.Background(), pool, filter, *dryRun, logger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "retention: %v\n", err)
		os.Exit(1)
	}

	for _, line := range res.Lines {
		fmt.Println(" ", line)
	}
	verb := "Released"
	if *dryRun {
		verb = "WOULD RELEASE"
	}
	fmt.Printf("%s %d stage(s), total Rp %s\n", verb, res.ReleasedStages, formatIDR(res.ReleasedTotalMinor))
	fmt.Printf("projects scanned %d | skipped (blocking claim) %d | skipped (open dispute) %d | skipped (nothing held) %d\n",
		res.Scanned, res.SkippedBlocked, res.SkippedDispute, res.SkippedNothingHeld)
}

func formatIDR(minor int64) string {
	neg := minor < 0
	if neg {
		minor = -minor
	}
	whole := minor / 100
	var digits []byte
	if whole == 0 {
		digits = []byte("0")
	} else {
		for whole > 0 {
			digits = append([]byte{byte('0' + whole%10)}, digits...)
			whole /= 10
		}
	}
	var grouped []byte
	for i, c := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			grouped = append(grouped, '.')
		}
		grouped = append(grouped, c)
	}
	if neg {
		return "-" + string(grouped)
	}
	return string(grouped)
}
