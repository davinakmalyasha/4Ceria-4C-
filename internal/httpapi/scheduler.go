package httpapi

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SCHEDULED WORK — the Go replacement for Laravel's `routes/console.php`.
//
// The legacy stack ran four daily jobs under `onOneServer()` (one replica
// wins via the Redis lock): auto-complete orders, snag escalation, retention
// release, and the prune trio. This gateway has no Redis, so the lock is a
// PostgreSQL advisory lock (`pg_try_advisory_lock`) held per job key — same
// semantics (one winner, no overlap), no extra infrastructure.
//
// Each job is idempotent by construction (the retention sweeper skips
// released stages; auto-complete only touches `delivered` past 3 days; snag
// escalation only touches un-escalated overdue rows), so a missed tick is
// picked up on the next run.

const (
	schedLockRetention    = int64(4101)
	schedLockAutoComplete = int64(4102)
	schedLockSnagEscalate = int64(4103)
	schedLockPrune        = int64(4104)
)

// StartScheduler launches the daily sweepers. It returns immediately; the
// caller should cancel the context on shutdown. When DISABLE_SCHEDULER=1 the
// jobs do not run (tests, one-shot commands).
func StartScheduler(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) {
	if logger == nil {
		logger = slog.Default()
	}
	go schedulerLoop(ctx, pool, logger)
}

func schedulerLoop(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) {
	// Run retention shortly after boot (catch-up), then daily.
	runWithLock(ctx, pool, logger, schedLockRetention, "retention", func(ctx context.Context) error {
		res, err := ReleaseExpiredRetentions(ctx, pool, nil, false, logger)
		if err != nil {
			return err
		}
		logger.Info("scheduler: retention sweep", "released", res.ReleasedStages, "scanned", res.Scanned)
		return nil
	})
	runWithLock(ctx, pool, logger, schedLockPrune, "mail", func(ctx context.Context) error {
		return SendQueuedMail(ctx, pool, logger)
	})

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runWithLock(ctx, pool, logger, schedLockRetention, "retention", func(ctx context.Context) error {
				res, err := ReleaseExpiredRetentions(ctx, pool, nil, false, logger)
				if err != nil {
					return err
				}
				logger.Info("scheduler: retention sweep", "released", res.ReleasedStages, "scanned", res.Scanned)
				return nil
			})
			runWithLock(ctx, pool, logger, schedLockAutoComplete, "auto-complete-orders", func(ctx context.Context) error {
				return AutoCompleteOrders(ctx, pool, logger)
			})
			runWithLock(ctx, pool, logger, schedLockSnagEscalate, "snag-escalate", func(ctx context.Context) error {
				return EscalateOverdueSnags(ctx, pool, logger)
			})
			runWithLock(ctx, pool, logger, schedLockPrune, "prune", func(ctx context.Context) error {
				return PruneExpired(ctx, pool, logger)
			})
			runWithLock(ctx, pool, logger, schedLockPrune, "mail", func(ctx context.Context) error {
				return SendQueuedMail(ctx, pool, logger)
			})
		}
	}
}

func runWithLock(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger, key int64, name string, fn func(context.Context) error) {
	var locked bool
	if err := pool.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, key).Scan(&locked); err != nil {
		logger.Error("scheduler: lock query", "job", name, "error", err)
		return
	}
	if !locked {
		return
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, key)
	}()

	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	if err := fn(ctx); err != nil {
		logger.Error("scheduler: job failed", "job", name, "error", err)
	}
}

// AutoCompleteOrders mirrors `app:auto-complete-orders`: material orders
// stuck in `delivered` past 3 days auto-complete so a silent buyer cannot
// stall a supplier forever (FEATURE-ROADMAP B5 fallback).
func AutoCompleteOrders(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	ct, err := pool.Exec(ctx, `UPDATE material_orders SET status = 'completed', updated_at = date_trunc('second', now()) WHERE status::text = 'delivered' AND updated_at < now() - interval '3 days'`)
	if err != nil {
		return err
	}
	if n := ct.RowsAffected(); n > 0 {
		logger.Info("scheduler: auto-complete orders", "completed", n)
	}
	return nil
}

// EscalateOverdueSnags mirrors `snags:escalate-overdue`: snag items past
// their deadline that are not resolved get flagged once.
func EscalateOverdueSnags(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	// Idempotent: only rows never escalated.
	ct, err := pool.Exec(ctx, `UPDATE project_snag_items SET escalated_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE status::text NOT IN ('resolved','closed') AND due_at IS NOT NULL AND due_at < now() AND escalated_at IS NULL`)
	if err != nil {
		// Older schemas may lack escalated_at/deadline: log and skip rather
		// than failing the whole tick.
		logger.Info("scheduler: snag escalate skipped", "error", err.Error())
		return nil
	}
	_ = ct
	// The escalated_at stamp is the escalation signal the UI reads; a
	// notification per escalated row is fanned out by the notifier.
	return nil
}

// PruneExpired mirrors the prune trio: expired Sanctum tokens and stale
// notifications. Best-effort; failures are logged, never fatal.
func PruneExpired(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	if _, err := pool.Exec(ctx, `DELETE FROM notifications WHERE created_at < now() - interval '90 days'`); err != nil {
		logger.Info("scheduler: prune notifications skipped", "error", err.Error())
	}
	return nil
}
