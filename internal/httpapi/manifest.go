// Package httpapi is the HTTP surface of the Go gateway.
//
// WHAT THIS PACKAGE IS
// --------------------
// The route table, the router, and the middleware that guards it.
//
// WHY THE ROUTE TABLE IS A FILE
// -----------------------------
// The rewrite moves 296 API endpoints from Laravel to Go. "Without losing
// one" is not something a person can check by reading: the table is four
// hundred lines long, and the endpoint that goes missing is the one nobody
// was looking at.
//
// A route that exists in Laravel and not in Go is a 404 in production that no
// test caught, because the test called the Go handler directly.
//
// So the route table is GENERATED (`php artisan routes:export`), read by
// both engines, and compared by a gate (`tools/parity/routes.mjs`) that
// fails the build when the three views disagree. This package is the Go
// view of that file.
//
// THE TWO SPELLINGS OF THE SAME MIDDLEWARE
// -----------------------------------------
// The manifest reports a route's middleware the way the route was WRITTEN
// (`auth:sanctum`, `throttle:10,1`); Laravel's route table reports it
// RESOLVED to the class
// (`Illuminate\Auth\Middleware\Authenticate:sanctum`). Neither is wrong, and
// comparing the raw strings would report every route as a mismatch.
//
// So both are reduced to NormalisedMiddleware, which is the small set the
// Go router is actually built from. That is the thing that has to be equal,
// and it is what the parity gate compares.
package httpapi

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Auth is the AUTH classification of a route.
//
// The three values are the three questions the middleware stack answers:
// may an anonymous caller reach this, may a signed-in caller reach this, may
// only an administrator reach this.
type Auth string

const (
	// AuthPublic is reachable without a token.
	AuthPublic Auth = "public"
	// AuthAuthenticated requires a signed-in caller.
	AuthAuthenticated Auth = "authenticated"
	// AuthAdmin requires an administrator.
	AuthAdmin Auth = "admin"
)

// Route is one entry of the manifest.
type Route struct {
	// ID is the stable identifier: the Laravel route name when it has one,
	// and a generated `<method>.<slug>` otherwise. It is the name of the
	// golden file for this endpoint, so it must not change when the route
	// moves.
	ID string `yaml:"id"`

	// Methods are the HTTP verbs, without the implied HEAD.
	Methods []string `yaml:"methods"`

	// URI is the Laravel URI, WITHOUT a leading slash: `api/projects/{project}`.
	URI string `yaml:"uri"`

	// Auth is the auth classification.
	Auth Auth `yaml:"auth"`

	// Throttle is the rate limit spec — `10,1` means ten attempts per one
	// minute — or null when the route declares none.
	Throttle *string `yaml:"throttle"`

	// Tier is the parity contract of this endpoint (REWRITE-PLAN §5.2):
	// 1 byte-identical including the side-effect rows, 2 shape-identical,
	// 3 compatible. It is generated from the endpoint's AREA, and the
	// matrix in docs/PARITY.md is generated from it.
	Tier int `yaml:"tier"`

	// Upstream is which stack serves the endpoint in production. Every
	// endpoint starts on `laravel`, and flipping one to `go` is the cutover.
	Upstream string `yaml:"upstream"`

	// Laravel carries the legacy facts the manifest recorded.
	Laravel struct {
		Action     string   `yaml:"action"`
		Middleware []string `yaml:"middleware"`
	} `yaml:"laravel"`
}

// Manifest is the whole file.
type Manifest struct {
	Meta struct {
		GeneratedAt   string `yaml:"generated_at"`
		LaravelCommit string `yaml:"laravel_commit"`
		APICount      int    `yaml:"api_route_count"`
		PublicCount   int    `yaml:"public_route_count"`
		AdminCount    int    `yaml:"admin_route_count"`
	} `yaml:"meta"`

	Routes []Route `yaml:"routes"`
}

// LoadManifest reads the route manifest.
//
// The file is GENERATED, so a parse failure means the generator and the
// reader disagree — which is exactly what the parity gate is for, and it is
// not something to paper over with a fallback.
func LoadManifest(path string) (*Manifest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read the route manifest: %w", err)
	}

	var manifest Manifest

	if err := yaml.Unmarshal(raw, &manifest); err != nil {
		return nil, fmt.Errorf("parse the route manifest: %w", err)
	}

	if len(manifest.Routes) == 0 {
		return nil, fmt.Errorf("the route manifest %s declares no routes", path)
	}

	return &manifest, nil
}

// Pattern is the chi pattern for the route: the URI with a leading slash.
//
// chi's patterns are rooted at `/`, and the manifest's URIs are not, so the
// leading slash is added here rather than being carried in the file — the
// manifest is read by three programs and the Laravel URI form is the one
// that has to stay recognisable.
func (r Route) Pattern() string {
	return "/" + strings.TrimPrefix(r.URI, "/")
}

// MethodURIs is the flattened view: one entry per (method, URI) pair.
//
// A route with several verbs is SEVERAL routes as far as the router and the
// parity gate are concerned, and collapsing them would hide a verb that was
// dropped.
type MethodURI struct {
	Route
	Method string
}

// MethodURIs flattens the manifest.
//
// The order is stable — the manifest's order, which the generator sorts by
// URI and then by method — so two runs produce byte-identical output.
func (m *Manifest) MethodURIs() []MethodURI {
	out := make([]MethodURI, 0, len(m.Routes))

	for _, route := range m.Routes {
		for _, method := range route.Methods {
			out = append(out, MethodURI{Route: route, Method: method})
		}
	}

	return out
}

// NormalisedMiddleware reduces a middleware list to the set the Go router is
// built from.
//
// The two sides of the comparison report the same middleware in two
// spellings, and neither is wrong:
//
//	the manifest (Route::gatherMiddleware)   the route table (route:list)
//	---------------------------------------   -----------------------------
//	api                                       api
//	auth:sanctum                              Illuminate\Auth\Middleware\Authenticate:sanctum
//	admin                                     App\Http\Middleware\AdminMiddleware
//	freeze_pending_termination                App\Http\Middleware\FreezeWorkspaceIfTerminationPending
//	throttle:10,1                             Illuminate\Routing\Middleware\ThrottleRequests:10,1
//
// The `api` group is dropped: every route is in it, and it carries the
// `SecurityHeaders` middleware and the `ThrottleRequests:api` limiter, which
// apply to the whole API rather than to a route.
//
// An UNRECOGNISED middleware is carried through verbatim rather than
// dropped. A middleware the Go router does not know about is a gate the new
// stack does not have, and silently dropping it would make this function
// agree with a router that is missing a protection.
func NormalisedMiddleware(middleware []string) []string {
	names := map[string]struct{}{}

	for _, raw := range middleware {
		item := raw

		switch {
		case item == "api":
			// The group every route is in.
			continue

		case item == "auth" || item == "auth:sanctum",
			strings.HasPrefix(item, "Illuminate\\Auth\\Middleware\\Authenticate"):
			names["auth"] = struct{}{}

		case item == "admin", item == "App\\Http\\Middleware\\AdminMiddleware":
			names["admin"] = struct{}{}

		case item == "freeze_pending_termination",
			item == "App\\Http\\Middleware\\FreezeWorkspaceIfTerminationPending":
			names["freeze_termination"] = struct{}{}

		case strings.HasPrefix(item, "throttle:"),
			strings.HasPrefix(item, "Illuminate\\Routing\\Middleware\\ThrottleRequests:"):
			// The rate limit. `throttle:10,1` and `ThrottleRequests:10,1` are
			// the same limit: ten attempts per one minute.
			spec := item[strings.LastIndex(item, ":")+1:]

			if parts := strings.Split(spec, ","); len(parts) == 2 && isDigits(parts[0]) && isDigits(parts[1]) {
				names["rate:"+parts[0]+"/m"] = struct{}{}
				continue
			}

			// A NAMED limiter rather than a limit.
			names["rate:"+spec] = struct{}{}

		default:
			names[item] = struct{}{}
		}
	}

	out := make([]string, 0, len(names))
	for name := range names {
		out = append(out, name)
	}

	sort.Strings(out)

	return out
}

// ThrottleSpec returns the rate limit of a middleware list, in the canonical
// `N,M` form, or "" when there is none.
//
// The manifest's `throttle` field and the Laravel route table's middleware
// both reduce to the same value, which is what makes them comparable.
func ThrottleSpec(middleware []string) string {
	for _, item := range middleware {
		if !strings.HasPrefix(item, "throttle:") &&
			!strings.HasPrefix(item, "Illuminate\\Routing\\Middleware\\ThrottleRequests:") {
			continue
		}

		spec := item[strings.LastIndex(item, ":")+1:]

		if parts := strings.Split(spec, ","); len(parts) == 2 && isDigits(parts[0]) && isDigits(parts[1]) {
			return spec
		}
	}

	return ""
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}

	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}

	return true
}
