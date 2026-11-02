package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestTheProxyForwardsByteForByte pins the strangler's edge: an unported
// route is Laravel's answer, not the gateway's interpretation of it.
func TestTheProxyForwardsByteForByte(t *testing.T) {
	var gotMethod, gotURI, gotAuth, gotForwardedFor string
	var gotBody string

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotURI = r.URL.RequestURI()
		gotAuth = r.Header.Get("Authorization")
		gotForwardedFor = r.Header.Get("X-Forwarded-For")

		raw, _ := io.ReadAll(r.Body)
		gotBody = string(raw)

		// A Set-Cookie the gateway must NOT pass back: the session is the
		// gateway's cookie, not the API's.
		w.Header().Set("Set-Cookie", "laravel_session=abc; Path=/; HttpOnly")
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Custom", "kept")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":[{"id":1}]}`))
	}))
	defer upstream.Close()

	proxy, err := NewProxy(upstream.URL)
	if err != nil {
		t.Fatalf("NewProxy failed: %v", err)
	}

	manifest := &Manifest{
		Routes: []Route{
			{
				ID:      "get.api.houses",
				Methods: []string{http.MethodGet},
				URI:     "api/houses",
				Auth:    AuthPublic,
				Laravel: struct {
					Action     string   `yaml:"action"`
					Middleware []string `yaml:"middleware"`
				}{Action: "Test@houses", Middleware: []string{"api"}},
			},
		},
	}

	router := NewRouter(manifest, Gates{Proxy: proxy})

	request := httptest.NewRequest(http.MethodGet, "/api/houses?page=2", strings.NewReader(`{"q":1}`))
	request.Header.Set("Authorization", "Bearer 1|plain")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Cookie", "4ceria_session=should-not-forward")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 from upstream (body %q)", recorder.Code, recorder.Body.String())
	}

	if gotMethod != http.MethodGet {
		t.Errorf("method = %q, want GET", gotMethod)
	}

	if gotURI != "/api/houses?page=2" {
		t.Errorf("uri = %q, want the caller's path and query", gotURI)
	}

	if gotAuth != "Bearer 1|plain" {
		t.Errorf("authorization = %q, want the caller's token", gotAuth)
	}

	if gotForwardedFor == "" {
		t.Error("X-Forwarded-For was not set: Laravel would see the gateway as the caller")
	}

	if gotBody != `{"q":1}` {
		t.Errorf("body = %q, want the caller's body", gotBody)
	}

	if got := recorder.Body.String(); got != `{"data":[{"id":1}]}` {
		t.Errorf("body = %q, want the upstream bytes verbatim", got)
	}

	if got := recorder.Header().Get("X-Custom"); got != "kept" {
		t.Errorf("X-Custom = %q, want the upstream header", got)
	}

	if got := recorder.Header().Get("Set-Cookie"); got != "" {
		t.Errorf("Set-Cookie = %q, want it stripped", got)
	}
}

// TestAPortedRouteIsNeverProxied pins the cutover direction: once a handler
// exists, it serves — even when a proxy is configured.
func TestAPortedRouteIsNeverProxied(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"from":"laravel"}`))
	}))
	defer upstream.Close()

	proxy, err := NewProxy(upstream.URL)
	if err != nil {
		t.Fatalf("NewProxy failed: %v", err)
	}

	manifest := &Manifest{
		Routes: []Route{
			{
				ID:      "get.api.me",
				Methods: []string{http.MethodGet},
				URI:     "api/me",
				Auth:    AuthAuthenticated,
				Laravel: struct {
					Action     string   `yaml:"action"`
					Middleware []string `yaml:"middleware"`
				}{Action: "Test@me", Middleware: []string{"api", "auth:sanctum"}},
			},
		},
	}

	gates := Gates{
		Proxy: proxy,
		Auth:  StaticAuthenticator{Caller: Session{ID: 7, Role: "user"}},
		Handlers: map[string]http.HandlerFunc{
			"get.api.me": func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"from":"go"}`))
			},
		},
	}

	router := NewRouter(manifest, gates)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/me", nil))

	if got := recorder.Body.String(); got != `{"from":"go"}` {
		t.Fatalf("body = %q, want the Go handler, not the proxy", got)
	}
}

// TestWithoutAProxyAnUnportedRouteAnswers501 pins the development default:
// no surprise network calls from a test that forgot its environment.
func TestWithoutAProxyAnUnportedRouteAnswers501(t *testing.T) {
	manifest := &Manifest{
		Routes: []Route{
			{
				ID:      "get.api.houses",
				Methods: []string{http.MethodGet},
				URI:     "api/houses",
				Auth:    AuthPublic,
				Laravel: struct {
					Action     string   `yaml:"action"`
					Middleware []string `yaml:"middleware"`
				}{Action: "Test@houses", Middleware: []string{"api"}},
			},
		},
	}

	router := NewRouter(manifest, Gates{})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/houses", nil))

	if recorder.Code != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501 without a proxy", recorder.Code)
	}
}

// TestTheProxyReportsBadGateway pins the failure shape when Laravel is down.
func TestTheProxyReportsBadGateway(t *testing.T) {
	// A server that is started and immediately closed: the port is real,
	// nothing answers on it.
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	target := dead.URL
	dead.Close()

	proxy, err := NewProxy(target)
	if err != nil {
		t.Fatalf("NewProxy failed: %v", err)
	}

	manifest := &Manifest{
		Routes: []Route{
			{
				ID:      "get.api.houses",
				Methods: []string{http.MethodGet},
				URI:     "api/houses",
				Auth:    AuthPublic,
				Laravel: struct {
					Action     string   `yaml:"action"`
					Middleware []string `yaml:"middleware"`
				}{Action: "Test@houses", Middleware: []string{"api"}},
			},
		},
	}

	router := NewRouter(manifest, Gates{Proxy: proxy})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/houses", nil))

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502 when Laravel is unreachable", recorder.Code)
	}
}

// TestNewProxyWithAnEmptyTargetMeansNoProxy pins the constructor contract:
// an empty origin disables the proxy rather than proxying to nowhere.
func TestNewProxyWithAnEmptyTargetMeansNoProxy(t *testing.T) {
	proxy, err := NewProxy("")
	if err != nil {
		t.Fatalf("NewProxy(\"\") failed: %v", err)
	}

	if proxy != nil {
		t.Fatal("NewProxy(\"\") returned a proxy, want nil (the 501 stub stays)")
	}
}
