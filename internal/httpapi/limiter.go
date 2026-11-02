package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"
)

// THE RATE LIMITER
// ----------------
// The legacy routes declare `throttle:5,1` on register and the password
// resets, `throttle:10,1` on login, the conversation endpoints and the admin
// CSV export, and `throttle:30,1` on the geocode proxies and the message
// endpoint. The `api` group carries a second, coarser limit (60/min
// anonymous, 200/min authenticated).
//
// The legacy limiter keys authenticated traffic on the SHA-256 of the bearer
// token — available before auth runs, tied to a credential the caller must
// hold, and never the raw token (a live credential must not appear in a key
// space). Anonymous traffic keys on the client IP. `tests/RateLimitSpoofingTest.php`
// pins all of that, including the refusal to treat an empty `Authorization`
// header as a token.
//
// This is the in-memory implementation: a fixed window per key, safe for
// concurrent use. A multi-replica deployment needs a shared store (Redis);
// the interface (`RateLimiter`) is what the gate depends on, so the store
// can move without touching the router.

// MemoryLimiter counts calls per key in memory.
type MemoryLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
	now  func() time.Time
}

// NewMemoryLimiter builds an empty limiter.
func NewMemoryLimiter() *MemoryLimiter {
	return &MemoryLimiter{
		hits: map[string][]time.Time{},
		now:  time.Now,
	}
}

// Allow reports whether the call may proceed.
//
// The key is the hashed bearer token when the request carries one, and the
// client IP otherwise — the same rule the legacy `api` limiter applies.
func (l *MemoryLimiter) Allow(r *http.Request, limit int, window time.Duration) (bool, time.Duration) {
	key := limiterKey(r)
	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

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
	key := limiterKey(r)
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
// A request with a usable bearer token keys on `token:<sha256(token)>` — the
// hash, never the raw token — so rotating `X-Forwarded-For` cannot rotate the
// bucket. Anything else keys on `ip:<client>`, where the client is the
// forwarded chain's first entry when present, else the peer address. An
// empty or malformed `Authorization` header is anonymous: keying on the hash
// of an empty string would put every malformed caller in one bucket.
func limiterKey(r *http.Request) string {
	if token, ok := bearerToken(r.Header.Get("Authorization")); ok {
		if strings.TrimSpace(token) != "" {
			sum := sha256.Sum256([]byte(token))
			return "token:" + hex.EncodeToString(sum[:])
		}
	}

	return "ip:" + clientIP(r)
}
