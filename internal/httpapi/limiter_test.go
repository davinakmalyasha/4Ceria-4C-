package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestTheLimiterKeysAuthenticatedTrafficOnTheUser pins the spoofing fix:
// neither a rotated token nor a rotated X-Forwarded-For buys a fresh bucket.
func TestTheLimiterKeysAuthenticatedTrafficOnTheUser(t *testing.T) {
	limiter := NewMemoryLimiter()

	request := func(token, ip string) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/conversations", nil)
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("X-Forwarded-For", ip)
		r.RemoteAddr = ip + ":1234"
		r = r.WithContext(withCaller(r.Context(), Session{ID: 42}))
		return r
	}

	for i := 0; i < 10; i++ {
		if allowed, _, _ := limiter.Allow(request("token-alpha", "10.1.2.3"), 10, time.Minute); !allowed {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}

	if allowed, _, _ := limiter.Allow(request("token-beta", "203.0.113.99"), 10, time.Minute); allowed {
		t.Fatal("the same user with a rotated token and IP was allowed: the bucket rotated")
	}

	other := request("token-gamma", "203.0.113.7")
	other = other.WithContext(withCaller(other.Context(), Session{ID: 43}))
	if allowed, _, _ := limiter.Allow(other, 10, time.Minute); !allowed {
		t.Fatal("a different user was blocked: buckets are shared across users")
	}
}

// TestAPublicRouteIgnoresABearerHeader pins the login bypass: an anonymous
// route must key on the address even when the caller invents a token.
func TestAPublicRouteIgnoresABearerHeader(t *testing.T) {
	request := func(token string) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/login", nil)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		r.RemoteAddr = "198.51.100.4:1234"
		return r
	}

	if a, b := limiterKey(request("one")), limiterKey(request("two")); a != b {
		t.Fatalf("rotating a bearer token on /api/login rotated the bucket: %q vs %q", a, b)
	}

	if key := limiterKey(request("super-secret-token-value")); strings.Contains(key, "super-secret-token-value") {
		t.Fatalf("the limiter key contains the raw token: %q", key)
	}
}

// TestAnonymousTrafficKeysOnTheIP pins the other half: without a resolved
// caller, two IPs are two buckets.
func TestAnonymousTrafficKeysOnTheIP(t *testing.T) {
	limiter := NewMemoryLimiter()

	anonymous := func(ip string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
		r.RemoteAddr = ip + ":1234"
		return r
	}

	for i := 0; i < 5; i++ {
		if allowed, _, _ := limiter.Allow(anonymous("10.1.2.3"), 5, time.Minute); !allowed {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}

	if allowed, _, _ := limiter.Allow(anonymous("10.1.2.3"), 5, time.Minute); allowed {
		t.Fatal("the sixth attempt from the same IP was allowed")
	}

	if allowed, _, _ := limiter.Allow(anonymous("10.9.9.9"), 5, time.Minute); !allowed {
		t.Fatal("a different IP was blocked: anonymous buckets are shared")
	}
}

// TestForwardedForIsIgnoredWithoutATrustedProxy pins the second bypass: a
// direct client cannot pick its bucket with a header.
func TestForwardedForIsIgnoredWithoutATrustedProxy(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "")

	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "198.51.100.9:1234"
	r.Header.Set("X-Forwarded-For", "203.0.113.50")
	r.Header.Set("X-Forwarded-Proto", "https")

	if got := clientIP(r); got != "198.51.100.9" {
		t.Fatalf("clientIP = %q, want the peer address", got)
	}
	if got := forwardedProto(r); got != "http" {
		t.Fatalf("forwardedProto = %q, want http for an untrusted header", got)
	}
}

// TestForwardedForWalksPastTrustedProxies pins the proxy rule when enabled.
func TestForwardedForWalksPastTrustedProxies(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8")

	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.0.0.2:1234"
	r.Header.Set("X-Forwarded-For", "203.0.113.50, 10.0.0.3")

	if got := clientIP(r); got != "203.0.113.50" {
		t.Fatalf("clientIP = %q, want the right-most untrusted hop", got)
	}
}

// TestTheThrottleAnswers429WithTheLegacyBody pins the wire shape: status,
// Retry-After, and the exact message the original API sends.
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
				Gates: struct {
					Middleware []string `yaml:"middleware"`
				}{Middleware: []string{"api", "throttle:5,1"}},
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
		if allowed, _, _ := limiter.Allow(r, 5, time.Minute); !allowed {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}

	if allowed, _, _ := limiter.Allow(r, 5, time.Minute); allowed {
		t.Fatal("the sixth attempt was allowed inside the window")
	}

	now = now.Add(61 * time.Second)

	if allowed, _, _ := limiter.Allow(r, 5, time.Minute); !allowed {
		t.Fatal("no attempt was allowed after the window slid")
	}
}
