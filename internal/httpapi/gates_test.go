package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestTheAuthGateRunsBeforeTheAdminGate pins the defect that the first ported
// endpoint found.
//
// `NormalisedMiddleware` returns a SET — a map's keys — because the parity gate
// compares middleware as a set. The router built its CHAIN from that order, so
// `admin` could run before `auth`: the admin gate then looked for a caller that
// had not been resolved yet and answered 403 to an administrator.
//
// The route table matched, the endpoint was wired, and every gate said "not
// enforced" was false — the only symptom was a 403. This test would have failed
// with a single line of output.
func TestTheAuthGateRunsBeforeTheAdminGate(t *testing.T) {
	manifest := &Manifest{
		Routes: []Route{
			{
				ID:      "get.api.admin.thing",
				Methods: []string{http.MethodGet},
				URI:     "api/admin/thing",
				Auth:    AuthAdmin,
				Laravel: struct {
					Action     string   `yaml:"action"`
					Middleware []string `yaml:"middleware"`
				}{
					Action:     "Test@thing",
					Middleware: []string{"api", "auth:sanctum", "freeze_pending_termination", "admin"},
				},
			},
		},
	}

	gates := Gates{
		Auth: StaticAuthenticator{Caller: Session{ID: 1, Role: "admin", IsAdmin_: true}},
		Handlers: map[string]http.HandlerFunc{
			"get.api.admin.thing": func(w http.ResponseWriter, r *http.Request) {
				caller, ok := CallerFrom(r.Context())

				if !ok {
					t.Error("the handler ran without a caller in the context")

					return
				}

				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(caller.RoleType()))
			},
		},
	}

	router := NewRouter(manifest, gates)

	request := httptest.NewRequest(http.MethodGet, "/api/admin/thing", nil)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — the gates ran in the wrong order (body %q)",
			recorder.Code, recorder.Body.String())
	}

	if recorder.Body.String() != "admin" {
		t.Fatalf("body = %q, want the caller's role", recorder.Body.String())
	}
}

// TestAnAnonymousCallerIsRefusedBeforeTheAdminGate is the other half: a request
// with no token must be a 401 (unauthenticated), not a 403 (forbidden). The
// difference is what tells a client whether to retry with credentials.
func TestAnAnonymousCallerIsRefusedBeforeTheAdminGate(t *testing.T) {
	manifest := &Manifest{
		Routes: []Route{
			{
				ID:      "get.api.admin.thing",
				Methods: []string{http.MethodGet},
				URI:     "api/admin/thing",
				Auth:    AuthAdmin,
				Laravel: struct {
					Action     string   `yaml:"action"`
					Middleware []string `yaml:"middleware"`
				}{
					Action:     "Test@thing",
					Middleware: []string{"api", "auth:sanctum", "admin"},
				},
			},
		},
	}

	gates := Gates{
		Auth:     StaticAuthenticator{Caller: nil},
		Handlers: map[string]http.HandlerFunc{"get.api.admin.thing": func(http.ResponseWriter, *http.Request) {}},
	}

	router := NewRouter(manifest, gates)

	request := httptest.NewRequest(http.MethodGet, "/api/admin/thing", nil)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 for an anonymous caller (body %q)", recorder.Code, recorder.Body.String())
	}
}
