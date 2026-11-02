package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestTheLimiterKeysAuthenticatedTrafficOnTheTokenHash pins the spoofing fix:
// rotating X-Forwarded-For must not hand out a fresh bucket.
func TestTheLimiterKeysAuthenticatedTrafficOnTheTokenHash(t *testing.T) {
	limiter := NewMemoryLimiter()

	request := func(token, ip string) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/login", nil)
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("X-Forwarded-For", ip)
		r.RemoteAddr = ip + ":1234"
		return r
	}

	// Exhaust the bucket for token-alpha from one IP.
	for i := 0; i < 10; i++ {
		if allowed, _ := limiter.Allow(request("token-alpha", "10.1.2.3"), 10, time.Minute); !allowed {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}

	// The same token from a DIFFERENT IP is still the same bucket: blocked.
	if allowed, _ := limiter.Allow(request("token-alpha", "203.0.113.99"), 10, time.Minute); allowed {
		t.Fatal("the same token from a rotated IP was allowed: the bucket rotated with X-Forwarded-For")
	}

	// A different token is a different bucket: allowed.
	if allowed, _ := limiter.Allow(request("token-beta", "203.0.113.99"), 10, time.Minute); !allowed {
		t.Fatal("a different token was blocked: buckets are shared across tokens")
	}
}

// TestTheLimiterNeverKeysOnTheRawToken pins the credential rule: the bucket
// key must contain the hash, never the token.
func TestTheLimiterNeverKeysOnTheRawToken(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
	r.Header.Set("Authorization", "Bearer super-secret-token-value")

	key := limiterKey(r)

	if strings.Contains(key, "super-secret-token-value") {
		t.Fatalf("the limiter key contains the raw token: %q", key)
	}

	if !strings.HasPrefix(key, "token:") {
		t.Fatalf("the limiter key = %q, want the token: prefix", key)
	}
}

// TestAnonymousTrafficKeysOnTheIP pins the other half: without a token, two
// IPs are two buckets.
func TestAnonymousTrafficKeysOnTheIP(t *testing.T) {
	limiter := NewMemoryLimiter()

	anonymous := func(ip string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
		r.RemoteAddr = ip + ":1234"
		return r
	}

	for i := 0; i < 5; i++ {
		if allowed, _ := limiter.Allow(anonymous("10.1.2.3"), 5, time.Minute); !allowed {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}

	if allowed, _ := limiter.Allow(anonymous("10.1.2.3"), 5, time.Minute); allowed {
		t.Fatal("the sixth attempt from the same IP was allowed")
	}

	if allowed, _ := limiter.Allow(anonymous("10.9.9.9"), 5, time.Minute); !allowed {
		t.Fatal("a different IP was blocked: anonymous buckets are shared")
	}
}

// TestAnEmptyAuthorizationHeaderIsAnonymous pins the malformed-header rule:
// `Bearer ` with nothing after it must not pool every broken caller into the
// hash-of-empty-string bucket.
func TestAnEmptyAuthorizationHeaderIsAnonymous(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.Header.Set("Authorization", "Bearer ")
	r.RemoteAddr = "10.1.2.3:1234"

	if key := limiterKey(r); !strings.HasPrefix(key, "ip:") {
		t.Fatalf("key = %q, want the ip: bucket for an empty bearer", key)
	}
}

// TestTheThrottleAnswers429WithTheLegacyBody pins the wire shape: status,
// Retry-After, and the exact message Laravel sends.
func TestTheThrottleAnswers429WithTheLegacyBody(t *testing.T) {
	manifest := &Manifest{
		Routes: []Route{
			{
				ID:      "post.api.login",
				Methods: []string{http.MethodPost},
				URI:     "api/login",
				Auth:    AuthPublic,
				Throttle: func() *string {
					spec := "5,1"
					return &spec
				}(),
				Laravel: struct {
					Action     string   `yaml:"action"`
					Middleware []string `yaml:"middleware"`
				}{Action: "Test@login", Middleware: []string{"api", "throttle:5,1"}},
			},
		},
	}

	router := NewRouter(manifest, Gates{
		Limiter: NewMemoryLimiter(),
		Handlers: map[string]http.HandlerFunc{
			"post.api.login": func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			},
		},
	})

	var last *httptest.ResponseRecorder

	for i := 0; i < 6; i++ {
		r := httptest.NewRequest(http.MethodPost, "/api/login", nil)
		r.RemoteAddr = "10.1.2.3:1234"

		last = httptest.NewRecorder()
		router.ServeHTTP(last, r)
	}

	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429 on the sixth attempt", last.Code)
	}

	if !strings.Contains(last.Body.String(), "Too Many Attempts.") {
		t.Errorf("body = %q, want the legacy message", last.Body.String())
	}

	if last.Header().Get("Retry-After") == "" {
		t.Error("Retry-After was not set on the 429")
	}
}

// TestTheWindowSlides pins the decay: after the window passes, the bucket is
// empty again.
func TestTheWindowSlides(t *testing.T) {
	limiter := NewMemoryLimiter()
	now := time.Now()
	limiter.now = func() time.Time { return now }

	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.1.2.3:1234"

	for i := 0; i < 5; i++ {
		if allowed, _ := limiter.Allow(r, 5, time.Minute); !allowed {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}

	if allowed, _ := limiter.Allow(r, 5, time.Minute); allowed {
		t.Fatal("the sixth attempt was allowed inside the window")
	}

	now = now.Add(61 * time.Second)

	if allowed, _ := limiter.Allow(r, 5, time.Minute); !allowed {
		t.Fatal("no attempt was allowed after the window slid")
	}
}
