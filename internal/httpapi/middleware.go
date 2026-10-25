package httpapi

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// THE GATES
// ---------
// The legacy route table carries four gates, and the Go router has to carry
// the same four or the new stack protects something differently than the old
// one:
//
//	auth                the caller is signed in
//	admin               the caller is an administrator
//	freeze_termination  the project is not awaiting a termination
//	rate:N/m            the caller is not calling too often
//
// Each one is DECLARED from the manifest and ENFORCED by an interface, and
// the interface is not implemented yet. That is the honest state of the
// port, and it is why the gateway reports itself as not ready.
//
// A gate that is declared but not enforced is a gate the new stack does not
// have, and a gateway that answers 200 on a route the legacy app rate
// limits is worse than one that answers 501: the 501 says "not written
// yet", and the 200 says "protected" when it is not.

// Caller is the authenticated caller.
//
// It is an interface rather than a concrete user struct, for the same
// reason `authz.Subject` is: the gate needs a couple of facts about a
// caller, and the storage layer is not the gate's business.
type Caller interface {
	// UserID is the caller's id.
	UserID() int64
	// RoleType is the caller's role, e.g. "arsitek".
	RoleType() string
	// IsAdmin reports whether the caller is an administrator.
	IsAdmin() bool
}

// Authenticator resolves the caller from a request.
//
// The legacy application uses Sanctum bearer tokens: the token is the
// `id|<40 hex>` form, the row lives in `personal_access_tokens`, and the
// lookup is by the SHA-256 of the token.
type Authenticator interface {
	// Authenticate returns the caller, or nil when the request carries no
	// usable token.
	Authenticate(r *http.Request) (Caller, error)
}

// RateLimiter counts the calls per key.
type RateLimiter interface {
	// Allow reports whether the call may proceed, and how long the caller
	// should wait if it may not.
	Allow(r *http.Request, limit int, window time.Duration) (bool, time.Duration)
}

// ProjectFreezer answers whether a project is frozen.
//
// The legacy middleware `FreezeWorkspaceIfTerminationPending` blocks every
// POST, PUT, PATCH and DELETE on a project whose status is
// `termination_pending`, with a 422 and a fixed Indonesian message.
type ProjectFreezer interface {
	// Frozen reports whether the project is frozen for a mutation.
	Frozen(r *http.Request) (bool, error)
}

// Gates is the set of enforcement points the router needs.
//
// Every one of them is an interface, and the default implementations are
// the ones that say "not implemented yet".
type Gates struct {
	// Handlers are the routes this build actually serves, keyed by route id.
	// A route absent from this map answers the stub.
	Handlers map[string]http.HandlerFunc

	Auth    Authenticator
	Limiter RateLimiter
	Freezer ProjectFreezer
}

// Unimplemented reports which gates are not enforced.
//
// The gateway's readiness endpoint reports this, and the router's stub
// handler refuses the request when a gate is missing. A 501 is the honest
// answer: it says the endpoint is not written yet, where a 200 would say
// "protected" and a 401 would say "you are not allowed" — and neither is
// true.
func (g Gates) Unimplemented() []string {
	var missing []string

	if g.Auth == nil {
		missing = append(missing, "auth")
	}
	if g.Limiter == nil {
		missing = append(missing, "rate")
	}
	if g.Freezer == nil {
		missing = append(missing, "freeze_termination")
	}

	sort.Strings(missing)

	return missing
}

// callerKey is the context key the resolved caller is stored under.
type callerKey struct{}

// CallerFrom returns the resolved caller, if there is one.
func CallerFrom(ctx context.Context) (Caller, bool) {
	caller, ok := ctx.Value(callerKey{}).(Caller)
	return caller, ok
}

// withCaller stores the resolved caller.
func withCaller(ctx context.Context, caller Caller) context.Context {
	return context.WithValue(ctx, callerKey{}, caller)
}

// requireAuth is the `auth` gate.
//
// The legacy middleware is `auth:sanctum`, which answers 401 with
// `{"message":"Unauthenticated."}` when there is no usable token.
func (g Gates) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if g.Auth == nil {
			// The gate is declared but not enforced. Saying so is the
			// difference between a port in progress and a hole.
			message(w, http.StatusNotImplemented,
				"This endpoint is not implemented yet: the authentication gate is declared but not enforced.")
			return
		}

		caller, err := g.Auth.Authenticate(r)
		if err != nil {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		if caller == nil {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		next.ServeHTTP(w, r.WithContext(withCaller(r.Context(), caller)))
	})
}

// requireAdmin is the `admin` gate.
//
// The legacy middleware is `AdminMiddleware`, which answers 403 with
// `{"message":"Unauthorized access."}`.
func (g Gates) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())

		if !ok {
			// The admin gate is always stacked on top of the auth gate, so
			// an absent caller means the auth gate did not run — which is a
			// wiring bug, not a request.
			message(w, http.StatusForbidden, "Unauthorized access.")
			return
		}

		if !caller.IsAdmin() {
			message(w, http.StatusForbidden, "Unauthorized access.")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// requireFreeze is the `freeze_termination` gate.
//
// The legacy middleware blocks every mutation on a project that is awaiting
// a termination, with a 422 and a fixed message. It is a READ gate on the
// project, and it only applies to the mutating verbs.
func (g Gates) requireFreeze(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isMutation(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		if g.Freezer == nil {
			message(w, http.StatusNotImplemented,
				"This endpoint is not implemented yet: the termination-freeze gate is declared but not enforced.")
			return
		}

		frozen, err := g.Freezer.Frozen(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity,
				"Proyek sedang dalam proses pengajuan pembatalan bersama. Seluruh aktivitas workspace dibekukan sementara.")
			return
		}

		if frozen {
			message(w, http.StatusUnprocessableEntity,
				"Proyek sedang dalam proses pengajuan pembatalan bersama. Seluruh aktivitas workspace dibekukan sementara.")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// requireRate is the `rate:N/m` gate.
//
// The legacy routes declare `throttle:5,1` on the login, the register and
// the two password resets, `throttle:10,1` on the conversation endpoints and
// the admin CSV export, and `throttle:30,1` on the geocode proxies and the
// message endpoint.
//
// The legacy limiter is keyed by the bearer token's hash, or by the client
// IP for an anonymous caller, and the api group carries a second, coarser
// limit of 60 per minute per IP.
func (g Gates) requireRate(limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if g.Limiter == nil {
				message(w, http.StatusNotImplemented,
					"This endpoint is not implemented yet: the rate limit is declared but not enforced.")
				return
			}

			allowed, retryAfter := g.Limiter.Allow(r, limit, window)
			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				message(w, http.StatusTooManyRequests, "Too Many Attempts.")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// isMutation reports whether a method changes something.
//
// The legacy freeze middleware only blocks the mutating verbs.
func isMutation(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

// rateLimit parses a rate limit spec — `10,1` — into its limit and window.
//
// The spec is Laravel's: the maximum number of attempts, and the decay
// window in minutes.
func rateLimit(spec string) (int, time.Duration, bool) {
	parts := strings.Split(spec, ",")
	if len(parts) != 2 {
		return 0, 0, false
	}

	limit, err := strconv.Atoi(parts[0])
	if err != nil || limit <= 0 {
		return 0, 0, false
	}

	minutes, err := strconv.Atoi(parts[1])
	if err != nil || minutes <= 0 {
		return 0, 0, false
	}

	return limit, time.Duration(minutes) * time.Minute, true
}
