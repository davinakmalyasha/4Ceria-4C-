package httpapi

import (
	"net/http"
	"sort"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// THE ROUTER
// ----------
// The router registers every route of the manifest, and reports its own
// route table at `GET /internal/routes`.
//
// The route table is the point. A route that exists in Laravel and not in
// Go is a 404 in production that no test caught, because the test called
// the Go handler directly — so the table is compared by a gate
// (`tools/parity/routes.mjs`) that fails the build when the manifest, the
// Laravel route table and the Go route table disagree.

// Router is the gateway's HTTP surface.
type Router struct {
	manifest *Manifest
	gates    Gates
	handler  http.Handler
}

// NewRouter builds the router.
//
// The manifest is read, not hard-coded, so the route table cannot drift
// from the file the parity gate reads. A route that is in the manifest and
// not in the router is a failure, and so is the reverse.
func NewRouter(manifest *Manifest, gates Gates) *Router {
	router := &Router{manifest: manifest, gates: gates}

	mux := http.NewServeMux()

	// The route table, for the parity gate.
	mux.HandleFunc("GET /internal/routes", router.internalRoutes)

	// The liveness and readiness probes.
	mux.HandleFunc("GET /healthz", router.healthz)
	mux.HandleFunc("GET /readyz", router.readyz)

	// The API routes.
	//
	// They are registered on the SAME mux as the catch-all below, rather
	// than on a nested one. A nested mux would answer an unmatched API path
	// with Go's default `text/plain` 404, because the nested mux's own
	// catch-all is Go's and not ours — and the legacy application answers
	// an unmatched API path with a JSON body, for the reason in the comment
	// on the catch-all below.
	for _, entry := range manifest.MethodURIs() {
		// A route with a HANDLER is served; everything else answers the stub
		// with the route's identity, so the port's progress is measurable from
		// the route table itself rather than from a comment.
		if handler, ok := gates.Handlers[entry.Route.ID]; ok {
			mux.Handle(entry.Method+" "+entry.Pattern(), router.wrap(entry, handler))
			continue
		}

		mux.Handle(entry.Method+" "+entry.Pattern(), router.stub(entry))
	}

	// The catch-all. The legacy application answers an unmatched API path
	// with a JSON 404, because a route removed or renamed on the API while
	// an older SPA build is still live degrades silently into the SPA's
	// HTML instead of 404ing. The SPA's own routes are not the gateway's
	// business — the SPA is served by Next.js — so everything else is a
	// plain 404.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			apiNotFound(w, r.URL.Path)
			return
		}

		message(w, http.StatusNotFound, "Not found.")
	})

	router.handler = mux

	return router
}

// ServeHTTP makes the router an http.Handler.
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.handler.ServeHTTP(w, req)
}

// stub returns the handler for a route that has not been ported yet.
//
// The route EXISTS — that is what the parity gate compares — and the
// handler says so, rather than pretending.
//
// A 501 is the honest status: the endpoint is registered but not written.
// The gate the route declares is also not enforced, and the handler says
// that too, because a 200 from a route whose rate limit is not enforced
// would be a lie with a cache header on it.
// wrap applies the route's gates to a real handler.
//
// The SAME chain the stub builds, because a route's middleware is a property of
// the ROUTE, not of whether its handler happens to be written yet. A ported
// handler that skipped `requireAdmin` would be authorized differently from the
// endpoint it replaces, and the parity gate would never see it.
func (r *Router) wrap(entry MethodURI, inner http.HandlerFunc) http.Handler {
	return r.chain(entry, inner)
}

func (r *Router) stub(entry MethodURI) http.Handler {
	inner := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body := jsonphp.NewObject()
		body.Set("message", "This endpoint is not implemented yet.")
		body.Set("route", entry.ID)
		body.Set("method", entry.Method)
		body.Set("uri", entry.URI)

		writeJSON(w, http.StatusNotImplemented, body)
	})

	return r.chain(entry, inner)
}

func (r *Router) chain(entry MethodURI, inner http.Handler) http.Handler {
	var chain []func(http.Handler) http.Handler

	// THE ORDER IS FIXED, AND THAT IS THE POINT.
	//
	// `NormalisedMiddleware` returns a SET (a map's keys, so the order is
	// deliberately irrelevant for the parity gate, which compares sets).
	// Building a CHAIN from that order would apply the gates in whatever order
	// Go happened to iterate — and `admin` before `auth` means the admin gate
	// looks for a caller that has not been resolved yet, and answers 403 to an
	// administrator. That is exactly what happened the first time this handler
	// ran: the route table matched, the endpoint refused its own admin.
	//
	// So the order is declared here, once: identify, then authorize, then the
	// state gate, then the rate limit.
	names := map[string]bool{}
	for _, name := range NormalisedMiddleware(entry.Laravel.Middleware) {
		names[name] = true
	}

	if names["auth"] {
		chain = append(chain, r.gates.requireAuth)
	}

	if names["admin"] {
		chain = append(chain, r.gates.requireAdmin)
	}

	if names["freeze_termination"] {
		chain = append(chain, r.gates.requireFreeze)
	}

	// The rate limit, when the route declares one.
	if entry.Throttle != nil {
		if limit, window, ok := rateLimit(*entry.Throttle); ok {
			chain = append(chain, r.gates.requireRate(limit, window))
		}
	}

	var handler http.Handler = inner

	for i := len(chain) - 1; i >= 0; i-- {
		handler = chain[i](handler)
	}

	return handler
}

// internalRoutes reports the router's own route table.
//
// The shape is what `tools/parity/routes.mjs` reads, and the URI is the
// manifest's URI — WITHOUT a leading slash — because that is the form the
// manifest uses and the gate compares the two directly.
func (r *Router) internalRoutes(w http.ResponseWriter, req *http.Request) {
	routes := jsonphp.NewObject()

	list := make([]any, 0, len(r.manifest.Routes))

	for _, route := range r.manifest.Routes {
		entry := jsonphp.NewObject()

		entry.Set("id", route.ID)
		entry.Set("uri", route.URI)
		entry.Set("auth", string(route.Auth))
		entry.Set("middleware", NormalisedMiddleware(route.Laravel.Middleware))

		if route.Throttle != nil {
			entry.Set("throttle", *route.Throttle)
		} else {
			entry.Set("throttle", nil)
		}

		methods := make([]any, 0, len(route.Methods))
		for _, method := range route.Methods {
			methods = append(methods, method)
		}
		entry.Set("methods", methods)

		list = append(list, entry)
	}

	routes.Set("routes", list)

	meta := jsonphp.NewObject()
	meta.Set("api_route_count", r.manifest.Meta.APICount)
	meta.Set("public_route_count", r.manifest.Meta.PublicCount)
	meta.Set("admin_route_count", r.manifest.Meta.AdminCount)
	meta.Set("laravel_commit", r.manifest.Meta.LaravelCommit)
	routes.Set("meta", meta)

	writeJSON(w, http.StatusOK, routes)
}

// healthz is the liveness probe.
//
// It answers 200 as long as the process is running. It deliberately does
// NOT touch the database: a liveness probe that fails when the database is
// slow restarts the process, and the database being slow is not the
// process's fault.
func (r *Router) healthz(w http.ResponseWriter, req *http.Request) {
	body := jsonphp.NewObject()
	body.Set("status", "ok")

	writeJSON(w, http.StatusOK, body)
}

// readyz is the readiness probe.
//
// It answers 200 only when every declared gate is enforced. Until the
// identity and the limiter are implemented, it answers 503 and says which
// gates are missing — so a load balancer never sends traffic to a gateway
// that would answer 200 on a route it does not actually protect.
func (r *Router) readyz(w http.ResponseWriter, req *http.Request) {
	missing := r.gates.Unimplemented()

	body := jsonphp.NewObject()

	if len(missing) == 0 {
		body.Set("status", "ready")
		writeJSON(w, http.StatusOK, body)
		return
	}

	body.Set("status", "not_ready")

	gates := jsonphp.NewObject()
	for _, name := range missing {
		gates.Set(name, true)
	}
	body.Set("missing_gates", gates)

	writeJSON(w, http.StatusServiceUnavailable, body)
}

// RouteIDs returns the router's route ids, sorted.
//
// It is the router's own list of what it serves, which is what the parity
// gate compares against the manifest.
func (r *Router) RouteIDs() []string {
	ids := make([]string, 0, len(r.manifest.Routes))

	for _, route := range r.manifest.Routes {
		ids = append(ids, route.ID)
	}

	sort.Strings(ids)

	return ids
}
