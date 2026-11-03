package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The request-ID middleware echoes a client-supplied id and mints one when
// absent, so local log lines can be joined without touching handlers.
func TestRequestIDEchoedAndMinted(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{})

	// Client-supplied id passes through.
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "local-debug-1")
	router.ServeHTTP(recorder, req)
	if got := recorder.Header().Get("X-Request-ID"); got != "local-debug-1" {
		t.Fatalf("X-Request-ID = %q, want the client-supplied id", got)
	}

	// Absent id is minted (128-bit hex).
	recorder2 := httptest.NewRecorder()
	router.ServeHTTP(recorder2, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	got := recorder2.Header().Get("X-Request-ID")
	if len(got) != 32 {
		t.Fatalf("minted X-Request-ID = %q (len %d), want 32 hex chars", got, len(got))
	}
	for _, c := range got {
		if !strings.ContainsRune("0123456789abcdef", c) {
			t.Fatalf("minted X-Request-ID = %q, want lowercase hex", got)
		}
	}
}

// /readyz reports pool observability without changing the readiness verdict.
func TestReadyzReportsPoolStats(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{
		Auth:    StaticAuthenticator{},
		Limiter: NewMemoryLimiter(),
		Freezer: stubFreezer{},
		DBStats: func() (int32, int32, int32) { return 20, 17, 3 },
	})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /readyz answered %d, want 200 when every gate is enforced", recorder.Code)
	}
	body := recorder.Body.String()
	for _, want := range []string{`"pool"`, `"total_conns":20`, `"idle_conns":17`, `"acquired_conns":3`} {
		if !strings.Contains(body, want) {
			t.Errorf("readyz body missing %s: %s", want, body)
		}
	}
}

type stubFreezer struct{}

func (stubFreezer) Frozen(*http.Request) (bool, error) { return false, nil }
