package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PG RATE LIMITER — the shared store.
//
// `MemoryLimiter` is per-process: N replicas = N× budget, so login/register
// brute-force gates do not hold across replicas. `PgLimiter` keeps the same
// `RateLimiter` interface and fixed-window semantics, but counts in
// `rate_limit_hits` (migration 0024). No Redis to operate; PostgreSQL is
// already the shared store.
//
// Admission is serialized per bucket with a transaction-scoped advisory lock.
// A count-then-insert without it over-admits under concurrency, which is the
// exact case a brute-force gate exists for.
type PgLimiter struct {
	pool *pgxpool.Pool
}

// NewPgLimiter builds the shared limiter. A nil pool keeps the memory limiter.
func NewPgLimiter(pool *pgxpool.Pool) *PgLimiter {
	return &PgLimiter{pool: pool}
}

func (l *PgLimiter) Allow(r *http.Request, limit int, window time.Duration) (bool, time.Duration, int) {
	if l == nil || l.pool == nil {
		return true, 0, limit
	}

	key := limiterBucket(r, limit, window)
	ctx := r.Context()
	now := time.Now()
	cutoff := now.Add(-window)

	tx, err := l.pool.Begin(ctx)
	if err != nil {
		// Fail closed on the auth attack surface (login/register/reset):
		// a limiter outage must not silently disable brute-force protection.
		// Other routes keep the old fail-open posture so a limiter blip does
		// not take the whole API down.
		if isAuthRateLimitPath(r.URL.Path) {
			return false, time.Minute, 0
		}
		return true, 0, limit
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, key); err != nil {
		if isAuthRateLimitPath(r.URL.Path) {
			return false, time.Minute, 0
		}
		return true, 0, limit
	}

	// Opportunistic housekeeping: rows older than an hour can never be in a
	// live window, and deleting them in bulk is cheaper than one per request.
	if now.UnixNano()%128 == 0 {
		_, _ = tx.Exec(ctx, `DELETE FROM rate_limit_hits WHERE hit_at < $1`, now.Add(-time.Hour))
	}

	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM rate_limit_hits WHERE key = $1 AND hit_at > $2`, key, cutoff).Scan(&count); err != nil {
		if isAuthRateLimitPath(r.URL.Path) {
			return false, time.Minute, 0
		}
		return true, 0, limit
	}

	if count >= limit {
		var oldest time.Time
		if err := tx.QueryRow(ctx, `SELECT min(hit_at) FROM rate_limit_hits WHERE key = $1 AND hit_at > $2`, key, cutoff).Scan(&oldest); err != nil {
			return false, 0, 0
		}
		retry := oldest.Add(window).Sub(now)
		if retry < 0 {
			retry = 0
		}
		return false, retry, 0
	}

	if _, err := tx.Exec(ctx, `INSERT INTO rate_limit_hits (key, hit_at) VALUES ($1, $2)`, key, now); err != nil {
		if isAuthRateLimitPath(r.URL.Path) {
			return false, time.Minute, 0
		}
		return true, 0, limit
	}

	if err := tx.Commit(ctx); err != nil {
		if isAuthRateLimitPath(r.URL.Path) {
			return false, time.Minute, 0
		}
		return true, 0, limit
	}

	return true, 0, limit - count - 1
}

func (l *PgLimiter) Remaining(r *http.Request, limit int, window time.Duration) int {
	if l == nil || l.pool == nil {
		return limit
	}

	key := limiterBucket(r, limit, window)
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

// isAuthRateLimitPath reports whether a request path is on the brute-force
// attack surface. Limiter outages fail closed here (block with a retry) and
// fail open everywhere else (keep serving).
func isAuthRateLimitPath(path string) bool {
	p := strings.ToLower(path)
	for _, sub := range []string{"/login", "/register", "/forgot", "/reset-password", "/password"} {
		if strings.Contains(p, sub) {
			return true
		}
	}
	return false
}
