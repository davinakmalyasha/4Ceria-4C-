package httpapi

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PG RATE LIMITER — the shared store.
//
// `MemoryLimiter` is per-process: N replicas = N× budget, so login/register
// brute-force gates do not hold across replicas. `PgLimiter` keeps the same
// `RateLimiter` interface and fixed-window semantics, but counts in
// `rate_limit_hits` (migration 0024), pruned on every write. No Redis to
// operate; PostgreSQL is already the shared store.
//
// Key rule is identical to the memory limiter (hashed bearer token else IP).

type PgLimiter struct {
	pool *pgxpool.Pool
}

// NewPgLimiter builds the shared limiter. Nil pool → caller keeps memory.
func NewPgLimiter(pool *pgxpool.Pool) *PgLimiter {
	return &PgLimiter{pool: pool}
}

func (l *PgLimiter) Allow(r *http.Request, limit int, window time.Duration) (bool, time.Duration) {
	if l == nil || l.pool == nil {
		return true, 0
	}
	key := limiterKey(r)
	ctx := r.Context()
	cutoff := time.Now().Add(-window)
	// Prune outside the count so the table stays small.
	_, _ = l.pool.Exec(ctx, `DELETE FROM rate_limit_hits WHERE hit_at < $1`, cutoff)
	var count int
	if err := l.pool.QueryRow(ctx, `SELECT count(*) FROM rate_limit_hits WHERE key = $1 AND hit_at > $2`, key, cutoff).Scan(&count); err != nil {
		// Fail open (log-and-allow): a limiter outage must not 500 auth.
		return true, 0
	}
	if count >= limit {
		var oldest time.Time
		if err := l.pool.QueryRow(ctx, `SELECT min(hit_at) FROM rate_limit_hits WHERE key = $1 AND hit_at > $2`, key, cutoff).Scan(&oldest); err != nil {
			return false, 0
		}
		retry := oldest.Add(window).Sub(time.Now())
		if retry < 0 {
			retry = 0
		}
		return false, retry
	}
	_, _ = l.pool.Exec(ctx, `INSERT INTO rate_limit_hits (key, hit_at) VALUES ($1, now())`, key)
	return true, 0
}

func (l *PgLimiter) Remaining(r *http.Request, limit int, window time.Duration) int {
	if l == nil || l.pool == nil {
		return limit
	}
	key := limiterKey(r)
	cutoff := time.Now().Add(-window)
	var count int
	if err := l.pool.QueryRow(r.Context(), `SELECT count(*) FROM rate_limit_hits WHERE key = $1 AND hit_at > $2`, key, cutoff).Scan(&count); err != nil {
		return limit
	}
	remaining := limit - count
	if remaining < 0 {
		return 0
	}
	return remaining
}
