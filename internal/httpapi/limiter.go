package httpapi

import (
	"net/http"
	"strconv"
	"sync"
	"time"
)

// THE RATE LIMITER
// ----------------
// Routes declare limits (`throttle:10,1` on login, `30,1` on geocode, ...),
// and every route also passes through a coarse 300/minute API ceiling. A
// signed-in caller is keyed by user id; anonymous traffic by the client
// address, with `X-Forwarded-For` trusted only from `TRUSTED_PROXIES`.
// A bearer token sent to a public route is not an identity: otherwise
// `/login` would hand out one bucket per guessed token.
//
// This is the in-memory implementation: a fixed window per scope, safe for
// concurrent use, with idle buckets swept once a minute. A multi-replica
// deployment uses the shared PgLimiter (`rate_pg.go`, same interface).

// MemoryLimiter counts calls per key in memory.
type MemoryLimiter struct {
	mu        sync.Mutex
	hits      map[string][]time.Time
	now       func() time.Time
	lastSweep time.Time
}

// NewMemoryLimiter builds an empty limiter.
func NewMemoryLimiter() *MemoryLimiter {
	return &MemoryLimiter{
		hits: map[string][]time.Time{},
		now:  time.Now,
	}
}

// Allow reports whether the call may proceed.
func (l *MemoryLimiter) Allow(r *http.Request, limit int, window time.Duration) (bool, time.Duration) {
	key := limiterBucket(r, limit, window)
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	// A rotating address must not grow the map forever. Once a minute, drop
	// buckets that have been idle for an hour.
	if now.Sub(l.lastSweep) > time.Minute {
		for bucket, hits := range l.hits {
			if len(hits) == 0 || hits[len(hits)-1].Before(now.Add(-time.Hour)) {
				delete(l.hits, bucket)
			}
		}
		l.lastSweep = now
	}

	cutoff := now.Add(-window)
	kept := l.hits[key][:0]

	for _, hit := range l.hits[key] {
		if hit.After(cutoff) {
			kept = append(kept, hit)
		}
	}

	if len(kept) >= limit {
		retryAfter := kept[0].Add(window).Sub(now)
		if retryAfter < 0 {
			retryAfter = 0
		}
		l.hits[key] = kept
		return false, retryAfter
	}

	l.hits[key] = append(kept, now)

	return true, 0
}

// Remaining reports how many attempts are left in the current window.
// It is what the `X-RateLimit-Remaining` header carries.
func (l *MemoryLimiter) Remaining(r *http.Request, limit int, window time.Duration) int {
	key := limiterBucket(r, limit, window)
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := now.Add(-window)
	count := 0

	for _, hit := range l.hits[key] {
		if hit.After(cutoff) {
			count++
		}
	}

	remaining := limit - count
	if remaining < 0 {
		return 0
	}

	return remaining
}

// limiterKey is the bucket a request counts against.
//
// An authenticated caller keys on their user id: rotating a bearer token or an
// `X-Forwarded-For` header cannot buy a fresh budget. Everything else keys on
// the client address. A token is never a key — and a token sent to a public
// route is not an identity, or `/login` would hand out one bucket per guess.
func limiterKey(r *http.Request) string {
	if caller, ok := CallerFrom(r.Context()); ok {
		return "user:" + formatInt(caller.UserID())
	}

	return "ip:" + clientIP(r)
}

// limiterBucket separates the coarse API budget from a route's own throttle.
// Both run for the same caller, and without the scope suffix the route would
// spend its budget twice as fast.
func limiterBucket(r *http.Request, limit int, window time.Duration) string {
	return limiterKey(r) + "|" + strconv.Itoa(limit) + "|" + strconv.FormatInt(int64(window/time.Second), 10)
}
