// Command gateway is the Go API server.
//
// WHAT IT IS FOR
// --------------
// The rewrite moves 296 API endpoints from Laravel to Go. The gateway is
// the process that serves them, and the first thing it does is serve the
// ROUTE TABLE — because "without losing one" is not something a person can
// check by reading.
//
// A route that exists in Laravel and not in Go is a 404 in production that
// no test caught, because the test called the Go handler directly.
//
// So the gateway:
//
//   - reads the GENERATED route manifest (`routing/routes.yaml`), which the
//     same command that produced it also checks against the live Laravel
//     route table;
//   - registers every route in it, with the same gates;
//   - reports its own route table at `GET /internal/routes`, so the parity
//     gate can compare the THIRD view against the other two;
//   - answers `GET /healthz` and `GET /readyz`.
//
// USAGE
//
//	go run ./cmd/gateway --manifest=routing/routes.yaml --addr=:8080
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/httpapi"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	manifestPath := flag.String("manifest", "routing/routes.yaml", "the route manifest to serve")
	addr := flag.String("addr", ":8080", "the address to listen on")
	readTimeout := flag.Duration("read-timeout", 15*time.Second, "the read timeout")
	writeTimeout := flag.Duration("write-timeout", 30*time.Second, "the write timeout")
	shutdownTimeout := flag.Duration("shutdown-timeout", 20*time.Second, "how long to wait for in-flight requests")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	manifest, err := httpapi.LoadManifest(*manifestPath)
	if err != nil {
		logger.Error("could not read the route manifest", "path", *manifestPath, "error", err)
		os.Exit(1)
	}

	// The gates are declared from the manifest and enforced through
	// interfaces that are not implemented yet. The readiness probe reports
	// that, so a load balancer never sends traffic to a gateway that would
	// answer 200 on a route it does not actually protect.
	gates := httpapi.Gates{
		Handlers: map[string]http.HandlerFunc{},
	}

	// POSTGRES IS OPTIONAL, AND SAYS SO WHEN IT IS ABSENT.
	//
	// The gateway must be runnable without a database — the route-parity gate
	// starts it and compares route tables, which needs no data. With
	// DATABASE_URL set, the ported handlers and the Sanctum authenticator are
	// wired; without it they stay stubs and `/readyz` reports the reason.
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		pool, err := pgxpool.New(context.Background(), dsn)
		if err != nil {
			logger.Error("connecting to PostgreSQL", "error", err)
			os.Exit(1)
		}
		defer pool.Close()

		if err := pool.Ping(context.Background()); err != nil {
			logger.Error("PostgreSQL did not answer", "error", err)
			os.Exit(1)
		}

		gates.Auth = httpapi.NewSanctum(pool)
		gates.Handlers["get.api.admin.stats"] = httpapi.StatsHandler(pool)
		gates.Handlers["get.api.notifications"] = httpapi.NotificationsHandler(pool)
		gates.Handlers["get.api.user.active-projects"] = httpapi.ActiveProjectsHandler(pool)

		logger.Info("postgres wired", "handlers", len(gates.Handlers))
	}

	router := httpapi.NewRouter(manifest, gates)

	logger.Info("gateway starting",
		"manifest", *manifestPath,
		"routes", len(manifest.Routes),
		"method_uri_pairs", len(manifest.MethodURIs()),
		"missing_gates", gates.Unimplemented(),
	)

	server := &http.Server{
		Addr:              *addr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       *readTimeout,
		WriteTimeout:      *writeTimeout,
	}

	// The graceful shutdown: a request in flight is a request that may be
	// writing to the database, so the process waits for it.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	serveErr := make(chan error, 1)

	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		logger.Error("the server stopped", "error", err)
		os.Exit(1)

	case sig := <-stop:
		logger.Info("shutting down", "signal", sig.String())

		ctx, cancel := context.WithTimeout(context.Background(), *shutdownTimeout)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			logger.Error("the shutdown did not finish cleanly", "error", err)
			os.Exit(1)
		}

		logger.Info("stopped")
	}
}
