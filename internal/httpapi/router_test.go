package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// manifestPath is the route manifest, relative to this package.
const manifestPath = "../../routing/routes.yaml"

// loadManifest reads the manifest, or fails the test.
func loadManifest(t *testing.T) *Manifest {
	t.Helper()

	manifest, err := LoadManifest(manifestPath)
	if err != nil {
		t.Fatalf("LoadManifest(%s) failed: %v", manifestPath, err)
	}

	return manifest
}

func TestLoadManifest(t *testing.T) {
	manifest := loadManifest(t)

	// The manifest is GENERATED, and the count is in its own metadata. If
	// the two disagree, the generator and the file have drifted.
	if got := len(manifest.Routes); got != manifest.Meta.APICount {
		t.Errorf("the manifest declares %d routes in its metadata but holds %d", manifest.Meta.APICount, got)
	}

	if manifest.Meta.LaravelCommit == "" {
		t.Error("the manifest records no laravel_commit")
	}
}

func TestEveryRouteIsRegistered(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{})

	seen := map[string]int{}

	for _, entry := range manifest.MethodURIs() {
		seen[entry.Method+" "+entry.Pattern()]++
	}

	for route, count := range seen {
		if count > 1 {
			t.Errorf("%s is registered %d times", route, count)
		}
	}

	// The router's own list of route ids is what the parity gate compares
	// against the manifest, so it must be the same set.
	if got, want := len(router.RouteIDs()), len(manifest.Routes); got != want {
		t.Errorf("the router serves %d routes and the manifest holds %d", got, want)
	}
}

func TestInternalRoutesReportsTheManifest(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/internal/routes", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /internal/routes answered %d", recorder.Code)
	}

	var payload struct {
		Routes []struct {
			ID         string   `json:"id"`
			URI        string   `json:"uri"`
			Auth       string   `json:"auth"`
			Middleware []string `json:"middleware"`
			Methods    []string `json:"methods"`
		} `json:"routes"`
	}

	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("the route table is not valid JSON: %v", err)
	}

	if len(payload.Routes) != len(manifest.Routes) {
		t.Fatalf("the route table reports %d routes and the manifest holds %d", len(payload.Routes), len(manifest.Routes))
	}

	// The URI is the MANIFEST's form — without a leading slash — because the
	// parity gate compares the two directly.
	for _, route := range payload.Routes {
		if strings.HasPrefix(route.URI, "/") {
			t.Errorf("route %s reports the uri %q with a leading slash", route.ID, route.URI)
		}
	}
}

func TestUnmatchedAPIPathAnswersTheJSON404(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/nope/does-not-exist", nil))

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("an unmatched API path answered %d", recorder.Code)
	}

	// The exact body the legacy catch-all produces.
	//
	// The slashes are escaped, because PHP's `json_encode` escapes them and
	// the rewrite's contract is about BYTES. A body that parsed to the same
	// JSON would still be a different body.
	want := `{"message":"API endpoint not found.","path":"\/api\/nope\/does-not-exist"}`

	if got := recorder.Body.String(); got != want {
		t.Errorf("an unmatched API path\n  got  %s\n  want %s", got, want)
	}

	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type is %q, want application/json", got)
	}
}

func TestReadinessReportsTheMissingGates(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	// The gates are declared but not enforced, so the gateway is NOT ready.
	// A load balancer that ignored this would send traffic to a gateway
	// that answers 200 on a route it does not protect.
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET /readyz answered %d, want 503 while the gates are unenforced", recorder.Code)
	}

	body := recorder.Body.String()

	for _, gate := range []string{"auth", "rate", "freeze_termination"} {
		if !strings.Contains(body, gate) {
			t.Errorf("the readiness body does not mention the missing gate %q: %s", gate, body)
		}
	}
}

func TestLivenessIsAlwaysOK(t *testing.T) {
	manifest := loadManifest(t)
	router := NewRouter(manifest, Gates{})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /healthz answered %d", recorder.Code)
	}
}

func TestNormalisedMiddleware(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{
			name: "the alias form",
			in:   []string{"api", "auth:sanctum", "admin", "freeze_pending_termination", "throttle:10,1"},
			want: []string{"admin", "auth", "freeze_termination", "rate:10/m"},
		},
		{
			name: "the class form",
			in: []string{
				"api",
				"Illuminate\\Auth\\Middleware\\Authenticate:sanctum",
				"App\\Http\\Middleware\\AdminMiddleware",
				"App\\Http\\Middleware\\FreezeWorkspaceIfTerminationPending",
				"Illuminate\\Routing\\Middleware\\ThrottleRequests:10,1",
			},
			want: []string{"admin", "auth", "freeze_termination", "rate:10/m"},
		},
		{
			name: "the two forms agree",
			in:   []string{"api", "auth:sanctum", "throttle:30,1"},
			want: []string{"auth", "rate:30/m"},
		},
		{
			name: "a named limiter is not a limit",
			in:   []string{"api", "Illuminate\\Routing\\Middleware\\ThrottleRequests:api"},
			want: []string{"rate:api"},
		},
		{
			name: "an unknown middleware is carried through",
			in:   []string{"api", "Something\\Unknown"},
			want: []string{"Something\\Unknown"},
		},
	}

	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			got := NormalisedMiddleware(item.in)

			if strings.Join(got, ",") != strings.Join(item.want, ",") {
				t.Errorf("NormalisedMiddleware(%v)\n  got  %v\n  want %v", item.in, got, item.want)
			}
		})
	}
}

func TestThrottleSpec(t *testing.T) {
	if got := ThrottleSpec([]string{"api", "throttle:10,1"}); got != "10,1" {
		t.Errorf("ThrottleSpec gave %q, want 10,1", got)
	}

	if got := ThrottleSpec([]string{"api", "Illuminate\\Routing\\Middleware\\ThrottleRequests:30,1"}); got != "30,1" {
		t.Errorf("ThrottleSpec gave %q, want 30,1", got)
	}

	if got := ThrottleSpec([]string{"api"}); got != "" {
		t.Errorf("ThrottleSpec gave %q, want the empty string", got)
	}
}

// TestTheManifestIsCommitted guards against a build that silently serves a
// different route table than the one the parity gate reads.
func TestTheManifestIsCommitted(t *testing.T) {
	if _, err := os.Stat(filepath.Clean(manifestPath)); err != nil {
		t.Fatalf("the route manifest is not readable at %s: %v", manifestPath, err)
	}
}
