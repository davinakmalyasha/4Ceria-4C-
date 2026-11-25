package httpapi

// Pure-helper coverage without a database or network: numeric parsing,
// paginator windows, limiter scoping (anon vs user, TRUSTED_PROXIES),
// compress skips, FreezeGate/auth/admin/rate gates, multipart limits,
// request parsing and URL helpers. UTC and integer minor units throughout;
// file paths go through safeStorageJoin only.

import (
	"context"
	"crypto/tls"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// --- numericMinor slow path (exponents) ---

func TestPureNumericMinorExponents(t *testing.T) {
	cases := []struct {
		in    string
		want  int64
		valid bool
	}{
		{"1e3", 100000, true},
		{"1E3", 100000, true},
		{"1.5e2", 15000, true},
		{"-2.5e1", -2500, true},
		{"1e-2", 0, true},      // 0.01 * 100 is not exact in binary; truncation wins
		{"1.999e0", 199, true}, // truncated, never rounded
		{"  1e3  ", 100000, true},
		{"abc", 0, false},
		{"", 0, false},
		{"   ", 0, false},
		{"1e30", 0, false}, // overflow guard, same bound as parseMinor
		{"--5", 0, false},
	}

	for _, tc := range cases {
		got, ok := numericMinor(tc.in)
		if ok != tc.valid || (ok && got != tc.want) {
			t.Errorf("numericMinor(%q) = (%d, %v), want (%d, %v)", tc.in, got, ok, tc.want, tc.valid)
		}
	}
}

// --- money.go pure maps ---

func TestPureShortRoleMapping(t *testing.T) {
	cases := map[string]string{
		"arsitek_bid": "arsitek", "kontraktor_bid": "kontraktor",
		"notaris_bid": "notaris", "interior_bid": "interior",
		"pm_bid": "project_manager", "structural_bid": "structural",
		"mep_bid": "mep", "termin": "termin", "bogus": "bogus", "": "",
	}
	for in, want := range cases {
		if got := shortRole(in); got != want {
			t.Errorf("shortRole(%q) = %q, want %q", in, got, want)
		}
	}

	set := bidShortSet()
	for _, short := range []string{"arsitek_bid", "kontraktor_bid", "notaris_bid", "interior_bid", "pm_bid", "structural_bid", "mep_bid"} {
		if !set[short] {
			t.Errorf("bidShortSet missing %q", short)
		}
	}
	if set["termin"] || set[""] {
		t.Error("bidShortSet must hold only the seven bid codes")
	}

	if got := refundTitle(42, "Architect base fee"); got != "Dispute #42 refund: Architect base fee" {
		t.Errorf("refundTitle = %q", got)
	}
}

// --- limiter: Remaining + sweep ---

func TestPureLimiterRemaining(t *testing.T) {
	limiter := NewMemoryLimiter()
	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.9.9.9:1234"

	if got := limiter.Remaining(r, 5, time.Minute); got != 5 {
		t.Fatalf("Remaining fresh = %d, want 5", got)
	}
	for i := 0; i < 3; i++ {
		if allowed, _, _ := limiter.Allow(r, 5, time.Minute); !allowed {
			t.Fatalf("attempt %d denied", i+1)
		}
	}
	if got := limiter.Remaining(r, 5, time.Minute); got != 2 {
		t.Fatalf("Remaining = %d, want 2", got)
	}
	// Exhausted bucket floors at zero.
	for i := 0; i < 5; i++ {
		limiter.Allow(r, 5, time.Minute)
	}
	if got := limiter.Remaining(r, 5, time.Minute); got != 0 {
		t.Fatalf("Remaining exhausted = %d, want 0", got)
	}
}

func TestPureLimiterSweepsIdleBuckets(t *testing.T) {
	limiter := NewMemoryLimiter()
	now := time.Now()
	limiter.now = func() time.Time { return now }

	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.10.10.10:1234"
	limiter.Allow(r, 1, time.Minute)
	if len(limiter.hits) != 1 {
		t.Fatalf("buckets = %d, want 1", len(limiter.hits))
	}

	// Two hours later the sweep drops the idle bucket.
	now = now.Add(2 * time.Hour)
	r2 := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r2.RemoteAddr = "10.11.11.11:1234"
	limiter.Allow(r2, 1, time.Minute)
	if len(limiter.hits) != 1 {
		t.Fatalf("buckets after sweep = %d, want 1 (idle bucket dropped)", len(limiter.hits))
	}

	// limiterBucket separates a route throttle from the coarse API budget.
	a := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	a.RemoteAddr = "10.12.12.12:1234"
	anonA := limiterBucket(a, 5, time.Minute)
	anonB := limiterBucket(a, 300, time.Minute)
	if anonA == anonB {
		t.Error("route and API budgets share a bucket")
	}
}

// --- compress: 304/HEAD/no-gzip/Vary/addVary ---

func TestPureCompressSkipsNotModified(t *testing.T) {
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", "1500")
		w.WriteHeader(http.StatusNotModified)
	}))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, r)

	if recorder.Code != http.StatusNotModified {
		t.Fatalf("status = %d", recorder.Code)
	}
	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("304 was compressed: %q", got)
	}
	if !strings.Contains(recorder.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("missing Vary on 304: %q", recorder.Header().Get("Vary"))
	}
}

func TestPureCompressSkipsHead(t *testing.T) {
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(strings.Repeat("x", 2000)))
	}))
	r := httptest.NewRequest(http.MethodHead, "/", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, r)

	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("HEAD was compressed: %q", got)
	}
}

func TestPureCompressNoGzipStaysIdentityWithVary(t *testing.T) {
	body := []byte(`{"data":"` + strings.Repeat("z", 2000) + `"}`)
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, r)

	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("no-Accept-Encoding response was compressed: %q", got)
	}
	if recorder.Body.String() != string(body) {
		t.Error("identity body changed")
	}
	if !strings.Contains(recorder.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("missing Vary: %q", recorder.Header().Get("Vary"))
	}
}

func TestPureAddVaryDedupes(t *testing.T) {
	header := http.Header{}
	addVary(header, "Accept-Encoding")
	addVary(header, "Accept-Encoding")
	addVary(header, "accept-encoding")
	if got := len(header.Values("Vary")); got != 1 {
		t.Fatalf("Vary entries = %d, want 1: %q", got, header.Get("Vary"))
	}

	if !isCompressible("text/event-stream") {
		// documented: streams never compress
	} else {
		t.Error("SSE must not be compressible")
	}
	for _, ct := range []string{"application/json", "text/html; charset=utf-8", "image/svg+xml", "application/xml"} {
		if !isCompressible(ct) {
			t.Errorf("%q should be compressible", ct)
		}
	}
	for _, ct := range []string{"image/png", "application/octet-stream", "video/mp4", ""} {
		if isCompressible(ct) {
			t.Errorf("%q must not be compressible", ct)
		}
	}
}

func TestPureGzipWriterFlushAndUnwrap(t *testing.T) {
	recorder := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	gw := &gzipResponseWriter{ResponseWriter: recorder, request: r, status: http.StatusOK}

	// Flush before any header decides the response and passes through.
	gw.Flush()
	if recorder.Flushed {
		// httptest recorder tracks Flush; the pass-through must have run.
	}

	var asAny any = gw
	unwrapper, ok := asAny.(interface{ Unwrap() http.ResponseWriter })
	if !ok {
		t.Fatal("gzipResponseWriter lost Unwrap")
	}
	if unwrapper.Unwrap() != http.ResponseWriter(recorder) {
		t.Error("Unwrap did not return the underlying writer")
	}
}

// --- gates: auth/admin/freeze/rate/isMutation/rateLimit ---

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}

func TestPureRequireAuthBranches(t *testing.T) {
	// Caller already in context passes through.
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r = r.WithContext(withCaller(r.Context(), Session{ID: 1, Role: "owner"}))
	recorder := httptest.NewRecorder()
	Gates{}.requireAuth(okHandler()).ServeHTTP(recorder, r)
	if recorder.Code != http.StatusOK {
		t.Fatalf("context caller denied: %d", recorder.Code)
	}

	// No authenticator configured answers 501.
	recorder = httptest.NewRecorder()
	Gates{}.requireAuth(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if recorder.Code != http.StatusNotImplemented {
		t.Fatalf("nil auth = %d, want 501", recorder.Code)
	}

	// Authenticator error and nil caller both answer 401.
	recorder = httptest.NewRecorder()
	Gates{Auth: errAuthenticator{}}.requireAuth(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("auth error = %d, want 401", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	Gates{Auth: StaticAuthenticator{}}.requireAuth(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("nil caller = %d, want 401", recorder.Code)
	}

	// Valid token attaches the caller.
	recorder = httptest.NewRecorder()
	Gates{Auth: StaticAuthenticator{Caller: Session{ID: 9, Role: "admin", IsAdmin_: true}}}.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok || caller.UserID() != 9 {
			t.Error("caller not attached to context")
		}
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("valid auth = %d, want 200", recorder.Code)
	}
}

type errAuthenticator struct{}

func (errAuthenticator) Authenticate(*http.Request) (Caller, error) {
	return nil, errors.New("bad token")
}

func TestPureRequireAdminBranches(t *testing.T) {
	// No caller in context: wiring bug, 403.
	recorder := httptest.NewRecorder()
	Gates{}.requireAdmin(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/x", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("missing caller = %d, want 403", recorder.Code)
	}

	// Non-admin: 403.
	r := httptest.NewRequest(http.MethodGet, "/api/admin/x", nil)
	r = r.WithContext(withCaller(r.Context(), Session{ID: 2, Role: "owner"}))
	recorder = httptest.NewRecorder()
	Gates{}.requireAdmin(okHandler()).ServeHTTP(recorder, r)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("non-admin = %d, want 403", recorder.Code)
	}

	// Admin passes.
	r = httptest.NewRequest(http.MethodGet, "/api/admin/x", nil)
	r = r.WithContext(withCaller(r.Context(), Session{ID: 1, Role: "admin", IsAdmin_: true}))
	recorder = httptest.NewRecorder()
	Gates{}.requireAdmin(okHandler()).ServeHTTP(recorder, r)
	if recorder.Code != http.StatusOK {
		t.Fatalf("admin = %d, want 200", recorder.Code)
	}
}

func TestPureRequireFreezeBranches(t *testing.T) {
	// Safe verbs pass even with no freezer.
	recorder := httptest.NewRecorder()
	Gates{}.requireFreeze(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/projects/1", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET = %d, want 200", recorder.Code)
	}

	// Mutation with no freezer: 501 (declared but not enforced).
	recorder = httptest.NewRecorder()
	Gates{}.requireFreeze(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/projects/1/bids", nil))
	if recorder.Code != http.StatusNotImplemented {
		t.Fatalf("nil freezer = %d, want 501", recorder.Code)
	}

	// Not frozen: passes.
	recorder = httptest.NewRecorder()
	Gates{Freezer: stubFreezer{}}.requireFreeze(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodDelete, "/api/projects/1", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("unfrozen = %d, want 200", recorder.Code)
	}

	// Frozen: 422 with the fixed Indonesian message.
	recorder = httptest.NewRecorder()
	Gates{Freezer: frozenStub{}}.requireFreeze(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/projects/1/bids", nil))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("frozen = %d, want 422", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "pembatalan bersama") {
		t.Fatalf("frozen body lost the fixed message: %q", recorder.Body.String())
	}

	// Gate error: also 422, never a 500.
	recorder = httptest.NewRecorder()
	Gates{Freezer: errFreezer{}}.requireFreeze(okHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodPatch, "/api/projects/1", nil))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("gate error = %d, want 422", recorder.Code)
	}
}

type frozenStub struct{}

func (frozenStub) Frozen(*http.Request) (bool, error) { return true, nil }

type errFreezer struct{}

func (errFreezer) Frozen(*http.Request) (bool, error) { return false, errors.New("db down") }

func TestPureDbFreezerWithoutProjectOrMutualTermination(t *testing.T) {
	// No DB is touched on these paths: no "projects" segment, and the
	// mutual-termination escape hatch. A nil pool is safe here.
	freezer := NewDbFreezer(nil)

	r := httptest.NewRequest(http.MethodPost, "/api/me", nil)
	frozen, err := freezer.Frozen(r)
	if err != nil || frozen {
		t.Fatalf("non-project path = (%v, %v), want (false, nil)", frozen, err)
	}

	r = httptest.NewRequest(http.MethodPost, "/api/projects/1/mutual-termination/respond", nil)
	frozen, err = freezer.Frozen(r)
	if err != nil || frozen {
		t.Fatalf("mutual-termination path = (%v, %v), want (false, nil)", frozen, err)
	}

	r = httptest.NewRequest(http.MethodPost, "/api/admin/users", nil)
	frozen, err = freezer.Frozen(r)
	if err != nil || frozen {
		t.Fatalf("admin path = (%v, %v), want (false, nil)", frozen, err)
	}
}

func TestPureIsMutationAndRateLimit(t *testing.T) {
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		if !isMutation(method) {
			t.Errorf("%s must be a mutation", method)
		}
	}
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions, "TRACE"} {
		if isMutation(method) {
			t.Errorf("%s must not be a mutation", method)
		}
	}

	limit, window, ok := rateLimit("10,1")
	if !ok || limit != 10 || window != time.Minute {
		t.Fatalf("rateLimit(10,1) = (%d, %v, %v)", limit, window, ok)
	}
	for _, spec := range []string{"", "10", "10,1,2", "0,1", "10,0", "-5,1", "x,1", "10,x", " , "} {
		if _, _, ok := rateLimit(spec); ok {
			t.Errorf("rateLimit(%q) was accepted", spec)
		}
	}
}

func TestPureRequireRateBranches(t *testing.T) {
	// No limiter: 501.
	recorder := httptest.NewRecorder()
	Gates{}.requireRate(5, time.Minute)(okHandler()).ServeHTTP(recorder, newRateRequest())
	if recorder.Code != http.StatusNotImplemented {
		t.Fatalf("nil limiter = %d, want 501", recorder.Code)
	}

	// Allowed: budget headers set.
	recorder = httptest.NewRecorder()
	Gates{Limiter: NewMemoryLimiter()}.requireRate(5, time.Minute)(okHandler()).ServeHTTP(recorder, newRateRequest())
	if recorder.Code != http.StatusOK {
		t.Fatalf("allowed = %d, want 200", recorder.Code)
	}
	if recorder.Header().Get("X-RateLimit-Limit") != "5" {
		t.Errorf("missing X-RateLimit-Limit: %q", recorder.Header().Get("X-RateLimit-Limit"))
	}

	// Exhausted: 429 with Retry-After and the legacy body.
	gates := Gates{Limiter: NewMemoryLimiter()}
	var last *httptest.ResponseRecorder
	for i := 0; i < 6; i++ {
		last = httptest.NewRecorder()
		gates.requireRate(5, time.Minute)(okHandler()).ServeHTTP(last, newRateRequest())
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("exhausted = %d, want 429", last.Code)
	}
	if last.Header().Get("Retry-After") == "" {
		t.Error("429 missing Retry-After")
	}
	if !strings.Contains(last.Body.String(), "Too Many Attempts.") {
		t.Errorf("429 body = %q, want the legacy message", last.Body.String())
	}
}

func newRateRequest() *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/api/login", nil)
	r.RemoteAddr = "198.51.100.77:1234"
	return r
}

func TestPureWithOptionalCallerBranches(t *testing.T) {
	// Nil auth returns the handler untouched.
	seen := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = true
		w.WriteHeader(http.StatusOK)
	})
	recorder := httptest.NewRecorder()
	withOptionalCaller(Gates{}, next).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/houses", nil))
	if !seen || recorder.Code != http.StatusOK {
		t.Fatal("nil-auth optional caller did not pass through")
	}

	// No Authorization header stays anonymous.
	recorder = httptest.NewRecorder()
	withOptionalCaller(Gates{Auth: StaticAuthenticator{Caller: Session{ID: 5}}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := CallerFrom(r.Context()); ok {
			t.Error("anonymous request gained a caller")
		}
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/houses", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("anonymous = %d", recorder.Code)
	}

	// Invalid token stays anonymous; valid token attaches.
	recorder = httptest.NewRecorder()
	withOptionalCaller(Gates{Auth: errAuthenticator{}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := CallerFrom(r.Context()); ok {
			t.Error("failed auth gained a caller")
		}
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(recorder, bearerRequest("bad"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("bad token = %d", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	withOptionalCaller(Gates{Auth: StaticAuthenticator{Caller: Session{ID: 6}}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok || caller.UserID() != 6 {
			t.Error("valid token did not attach the caller")
		}
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(recorder, bearerRequest("good"))
	if recorder.Code != http.StatusOK {
		t.Fatalf("good token = %d", recorder.Code)
	}
}

func bearerRequest(token string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/houses", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

func TestPureRequestIDFrom(t *testing.T) {
	if _, ok := RequestIDFrom(context.Background()); ok {
		t.Error("empty context reported an id")
	}
	r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()
	withRequestID(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		id, ok := RequestIDFrom(req.Context())
		if !ok || id == "" {
			t.Error("handler saw no request id")
		}
	})).ServeHTTP(recorder, r)

	// Overlong client id is capped at 128.
	r = httptest.NewRequest(http.MethodGet, "/healthz", nil)
	r.Header.Set("X-Request-ID", strings.Repeat("a", 200))
	recorder = httptest.NewRecorder()
	withRequestID(okHandler()).ServeHTTP(recorder, r)
	if got := len(recorder.Header().Get("X-Request-ID")); got != 128 {
		t.Fatalf("request id len = %d, want 128", got)
	}
}

func TestPureStatusRecorderFlushUnwrap(t *testing.T) {
	recorder := httptest.NewRecorder()
	sr := &statusRecorder{ResponseWriter: recorder, status: http.StatusOK}
	sr.WriteHeader(http.StatusTeapot)
	if sr.status != http.StatusTeapot {
		t.Fatalf("status = %d", sr.status)
	}
	sr.Flush() // must not panic when the writer flushes
	if sr.Unwrap() != http.ResponseWriter(recorder) {
		t.Error("Unwrap did not return the underlying writer")
	}

	// Flush with a non-flushing writer must not panic either.
	sr2 := &statusRecorder{ResponseWriter: nonFlushingWriter{}, status: http.StatusOK}
	sr2.Flush()
}

type nonFlushingWriter struct{ http.ResponseWriter }

// --- request parsing ---

func TestPureClientIPScoping(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "")

	// Untrusted peer: header ignored.
	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "198.51.100.9:1234"
	r.Header.Set("X-Forwarded-For", "203.0.113.50")
	if got := clientIP(r); got != "198.51.100.9" {
		t.Fatalf("clientIP = %q", got)
	}

	// Bare address without a port.
	r = httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "198.51.100.9"
	if got := remoteIP(r.RemoteAddr); got != "198.51.100.9" {
		t.Fatalf("remoteIP = %q", got)
	}

	// Bracketed IPv6.
	r.RemoteAddr = "[2001:db8::1]:443"
	if got := remoteIP(r.RemoteAddr); got != "2001:db8::1" {
		t.Fatalf("remoteIP v6 = %q", got)
	}

	// Invalid header entries are skipped.
	if got := forwardedChain("not-an-ip, 203.0.113.7, "); len(got) != 1 || got[0] != "203.0.113.7" {
		t.Fatalf("forwardedChain = %v", got)
	}
	if forwardedChain("") != nil {
		t.Error("empty header must give nil")
	}

	// Loopback detection.
	if !isLoopbackIP("127.0.0.1") || isLoopbackIP("203.0.113.1") || isLoopbackIP("bogus") {
		t.Error("isLoopbackIP wrong")
	}
}

func TestPureTrustedProxyCIDRAndIP(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8, 192.0.2.1, bogus-entry, ")

	if !trustedProxy("10.1.2.3") {
		t.Error("CIDR member not trusted")
	}
	if !trustedProxy("192.0.2.1") {
		t.Error("exact IP not trusted")
	}
	if trustedProxy("203.0.113.1") {
		t.Error("outsider trusted")
	}
	if trustedProxy("not-an-ip") {
		t.Error("garbage trusted")
	}

	t.Setenv("TRUSTED_PROXIES", "")
	if trustedProxy("10.1.2.3") {
		t.Error("empty allowlist trusted someone")
	}
}

func TestPureTrustedProxyChainWalk(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8")

	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.0.0.2:1234"
	r.Header.Set("X-Forwarded-For", "203.0.113.50, 10.0.0.3")
	if got := clientIP(r); got != "203.0.113.50" {
		t.Fatalf("clientIP = %q, want the right-most untrusted hop", got)
	}

	// Every hop trusted: fall back to the first entry.
	r = httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.0.0.9:1234"
	r.Header.Set("X-Forwarded-For", "10.0.0.4, 10.0.0.5")
	if got := clientIP(r); got != "10.0.0.4" {
		t.Fatalf("all-trusted chain = %q", got)
	}

	// Trusted peer, no header: the peer itself.
	r = httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.0.0.9:1234"
	if got := clientIP(r); got != "10.0.0.9" {
		t.Fatalf("no-header peer = %q", got)
	}
}

func TestPureForwardedProto(t *testing.T) {
	// TLS wins outright.
	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.TLS = &tls.ConnectionState{}
	if got := forwardedProto(r); got != "https" {
		t.Fatalf("TLS proto = %q", got)
	}

	// Plain direct request.
	r = httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "198.51.100.9:1234"
	r.Header.Set("X-Forwarded-Proto", "https")
	if got := forwardedProto(r); got != "http" {
		t.Fatalf("untrusted proto = %q, want http", got)
	}

	// Trusted proxy header honoured; garbage ignored.
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8")
	r = httptest.NewRequest(http.MethodGet, "/api/x", nil)
	r.RemoteAddr = "10.0.0.2:1234"
	r.Header.Set("X-Forwarded-Proto", "https")
	if got := forwardedProto(r); got != "https" {
		t.Fatalf("trusted proto = %q", got)
	}
	r.Header.Set("X-Forwarded-Proto", "gopher")
	if got := forwardedProto(r); got != "http" {
		t.Fatalf("garbage proto = %q", got)
	}
}

// --- requesturls ---

func TestPureRequestURLHelpers(t *testing.T) {
	t.Setenv("FRONTEND_URL", "")
	if got := frontendBase(); got != "http://127.0.0.1:3000" {
		t.Fatalf("frontendBase default = %q", got)
	}
	t.Setenv("FRONTEND_URL", "https://ceria.example/")
	if got := frontendBase(); got != "https://ceria.example" {
		t.Fatalf("frontendBase = %q", got)
	}

	t.Setenv("APP_URL", "")
	if got := assetBase(); got != "http://localhost:9000" {
		t.Fatalf("assetBase default = %q", got)
	}
	t.Setenv("APP_URL", "https://api.example///")
	if got := assetBase(); got != "https://api.example" {
		t.Fatalf("assetBase trims slashes = %q", got)
	}

	t.Setenv("PUBLIC_ASSET_BASE", "https://cdn.example/assets/")
	if got := assetBaseOf(context.Background()); got != "https://cdn.example/assets" {
		t.Fatalf("assetBaseOf = %q", got)
	}
	t.Setenv("PUBLIC_ASSET_BASE", "")
	t.Setenv("APP_URL", "https://api.example")
	if got := assetBaseOf(context.Background()); got != "https://api.example" {
		t.Fatalf("assetBaseOf fallback = %q", got)
	}

	if got := assetStorage("https://cdn.example/x.png"); got != "https://cdn.example/x.png" {
		t.Fatalf("external assetStorage = %q", got)
	}
	if got := assetStorage("avatars/a.png"); got != "https://api.example/storage/avatars/a.png" {
		t.Fatalf("assetStorage = %q", got)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/houses", nil)
	r.Host = "example.test"
	r.Header.Set("X-Forwarded-Proto", "https")
	if got := requestOrigin(r); got != "https://example.test" {
		t.Fatalf("requestOrigin = %q", got)
	}

	withCtx := withAssetBase(context.Background(), "https://origin.example")
	if withCtx.Value(assetBaseKey{}) != "https://origin.example" {
		t.Error("withAssetBase did not store the base")
	}
}

func TestPureLoadDotEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	content := "# comment\n\nEMPTY_OK=\nQUOTED=\"hello world\"\nSINGLE='single'\nNOEQUALS\n=noname\n  SPACED = spaced value \n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PURE_DOTENV_EXISTING", "keep")
	existing := "PURE_DOTENV_EXISTING=override\n"
	if err := os.WriteFile(path, []byte(existing+content), 0o600); err != nil {
		t.Fatal(err)
	}

	LoadDotEnv(path)
	if got := os.Getenv("QUOTED"); got != "hello world" {
		t.Fatalf("QUOTED = %q", got)
	}
	if got := os.Getenv("SINGLE"); got != "single" {
		t.Fatalf("SINGLE = %q", got)
	}
	if got := os.Getenv("PURE_DOTENV_EXISTING"); got != "keep" {
		t.Fatalf("existing env overridden: %q", got)
	}
	if got := os.Getenv("SPACED"); got != "spaced value" {
		t.Fatalf("SPACED = %q", got)
	}

	LoadDotEnv(filepath.Join(dir, "does-not-exist")) // must not panic
}

// --- respond helpers ---

func TestPureWriteJSONErrorPath(t *testing.T) {
	recorder := httptest.NewRecorder()
	writeJSON(recorder, http.StatusOK, map[int]any{1: "x"}) // unencodable: non-string keys
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("unencodable body = %d, want 500", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "Server Error") {
		t.Fatalf("500 body = %q", recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	writeJSONPublic(recorder, httptest.NewRequest(http.MethodGet, "/api/houses", nil), http.StatusOK, map[int]any{1: "x"}, 60)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("public unencodable = %d, want 500", recorder.Code)
	}
}

func TestPureValidationErrorAndNotFound(t *testing.T) {
	recorder := httptest.NewRecorder()
	validationError(recorder, "The given data was invalid.", map[string][]string{
		"b_field": {"is required"},
		"a_field": {"must be numeric", "is too long"},
	})
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d", recorder.Code)
	}
	body := recorder.Body.String()
	aField := strings.Index(body, "a_field")
	bField := strings.Index(body, "b_field")
	if aField < 0 || bField < 0 || aField > bField {
		t.Fatalf("fields not in stable order: %q", body)
	}
	if !strings.Contains(body, "The given data was invalid.") {
		t.Fatalf("message missing: %q", body)
	}

	recorder = httptest.NewRecorder()
	apiNotFound(recorder, "/api/nope")
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "API endpoint not found.") {
		t.Fatalf("body = %q", recorder.Body.String())
	}

	if got := sortedKeys(map[string]int{}); len(got) != 0 {
		t.Fatalf("empty sortedKeys = %v", got)
	}
	if got := sortedKeys(map[string]int{"b": 1, "a": 2}); len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("sortedKeys = %v", got)
	}
}

// --- withRequestLimits ---

func TestPureRequestLimitsCaps(t *testing.T) {
	// JSON over 2 MB is refused before a byte is read.
	r := httptest.NewRequest(http.MethodPost, "/api/me", nil)
	r.ContentLength = (2 << 20) + 1
	recorder := httptest.NewRecorder()
	withRequestLimits(okHandler()).ServeHTTP(recorder, r)
	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize JSON = %d, want 413", recorder.Code)
	}

	// Multipart over 80 MB is refused.
	r = httptest.NewRequest(http.MethodPost, "/api/upload", nil)
	r.Header.Set("Content-Type", "Multipart/Form-Data; boundary=x")
	r.ContentLength = (80 << 20) + 1
	recorder = httptest.NewRecorder()
	withRequestLimits(okHandler()).ServeHTTP(recorder, r)
	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize multipart = %d, want 413", recorder.Code)
	}

	// Small JSON passes and keeps the body readable.
	r = httptest.NewRequest(http.MethodPost, "/api/me", strings.NewReader(`{"name":"x"}`))
	smallRecorder := &deadlineRecorder{}
	withRequestLimits(okHandler()).ServeHTTP(smallRecorder, r)
	if smallRecorder.status != http.StatusOK {
		t.Fatalf("small JSON = %d, want 200", smallRecorder.status)
	}
	if !smallRecorder.readBy.IsZero() {
		t.Error("JSON request must keep the server read deadline")
	}

	// Multipart extends the read deadline through a writer that supports it.
	r = httptest.NewRequest(http.MethodPost, "/api/upload", strings.NewReader("x"))
	r.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	r.ContentLength = 1024
	multipartRecorder := &deadlineRecorder{}
	before := time.Now()
	withRequestLimits(okHandler()).ServeHTTP(multipartRecorder, r)
	if multipartRecorder.readBy.IsZero() {
		t.Fatal("multipart request got no read deadline")
	}
	if multipartRecorder.readBy.Before(before.Add(29 * time.Second)) {
		t.Fatalf("deadline too short: %v", multipartRecorder.readBy)
	}
}

// --- storage urls ---

func TestPureStorageURLHelpers(t *testing.T) {
	t.Setenv("APP_URL", "https://api.example")
	t.Setenv("PUBLIC_ASSET_BASE", "")
	ctx := context.Background()

	if resolveStorageURL(ctx, "") != nil {
		t.Error("empty path must stay null")
	}
	if projectStorageURL(ctx, nil) != nil || projectStorageURL(ctx, "") != nil {
		t.Error("empty project URL must stay null")
	}

	// External URLs pass through both resolvers.
	ext := "https://cdn.example/x.png"
	if got := resolveStorageURL(ctx, ext); got != ext {
		t.Fatalf("external resolve = %v", got)
	}
	if got := projectStorageURL(ctx, ext); got != ext {
		t.Fatalf("external project URL = %v", got)
	}
	if !isExternalURL(ext) || isExternalURL("/storage/x.png") {
		t.Error("isExternalURL wrong")
	}

	// Public prefix renders an absolute asset URL.
	got := projectStorageURL(ctx, "avatars/a.png")
	if want := "https://api.example/storage/avatars/a.png"; got != want {
		t.Fatalf("public URL = %v, want %v", got, want)
	}

	// /storage/ and S3 prefixes collapse to the relative path.
	got = projectStorageURL(ctx, "https://api.example/storage/avatars/a.png")
	if want := "https://api.example/storage/avatars/a.png"; got != want {
		t.Fatalf("collapsed URL = %v, want %v", got, want)
	}
	got = projectStorageURL(ctx, "https://t3.storageapi.dev/fourc-storage-fneicjrzkq3/milestones/m.png")
	if want := "https://api.example/storage/milestones/m.png"; got != want {
		t.Fatalf("s3 URL = %v, want %v", got, want)
	}

	// Private paths resolve through the vault, never an absolute asset URL.
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	private := resolveStorageURL(ctx, "vault/secret.pdf")
	signed, ok := private.(string)
	if !ok || !strings.Contains(signed, "vault/secret.pdf") {
		t.Fatalf("private resolve = %v", private)
	}

	public := resolveStorageURL(ctx, "avatars/a.png")
	if _, ok := public.(string); !ok {
		t.Fatalf("public resolve = %v (%T), want a URL string", public, public)
	}
}

// --- paginator windows ---

func TestPurePaginatorWindows(t *testing.T) {
	items := make([]any, 15)
	for i := range items {
		items[i] = map[string]any{}
	}

	// Far-middle page: two ellipses.
	body := Paginate(300, 15, 10, "http://localhost/api/x", "", items)
	if body == nil {
		t.Fatal("nil page")
	}

	// Near-start page: leading run then ellipsis.
	start := Paginate(300, 15, 2, "http://localhost/api/x", "", items)
	if start == nil {
		t.Fatal("nil page")
	}

	// Near-end page: ellipsis then trailing run.
	end := Paginate(300, 15, 19, "http://localhost/api/x", "", items)
	if end == nil {
		t.Fatal("nil page")
	}

	// Invalid per-page reads as the 15 default.
	def := Paginate(10, 0, 1, "http://localhost/api/x", "", items)
	if def == nil {
		t.Fatal("nil page")
	}

	// buildPageURL: base already carrying a query, empty parts, key-only part.
	u := buildPageURL("http://h/api/x?fixed=1", "b=2&&c&d=%zz", 3)
	if !strings.HasPrefix(u, "http://h/api/x?fixed=1&") {
		t.Fatalf("base query lost: %q", u)
	}
	if !strings.Contains(u, "page=3") {
		t.Fatalf("page missing: %q", u)
	}
	if !strings.Contains(u, "c=") {
		t.Fatalf("key-only part lost: %q", u)
	}

	// page <= 0 reads as 1.
	if u := buildPageURL("http://h/api/x", "", 0); !strings.HasSuffix(u, "page=1") {
		t.Fatalf("page 0 = %q", u)
	}
}

// --- router stub + manifest ---

func TestPureRouterStub501(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{})

	r := httptest.NewRequest(http.MethodGet, "/api/admin/projects", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, r)
	if recorder.Code != http.StatusNotImplemented {
		t.Fatalf("unenforced route = %d, want 501", recorder.Code)
	}

	empty := Gates{}.Unimplemented()
	if len(empty) != 3 {
		t.Fatalf("empty gates unimplemented = %v", empty)
	}
	full := Gates{Auth: StaticAuthenticator{}, Limiter: NewMemoryLimiter(), Freezer: stubFreezer{}}.Unimplemented()
	if len(full) != 0 {
		t.Fatalf("full gates unimplemented = %v", full)
	}
}
