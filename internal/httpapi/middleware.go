package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// THE GATES
// ---------
// The route manifest declares four enforcement points:
//
//	auth                the caller is signed in
//	admin               the caller is an administrator
//	freeze_termination  the project is not awaiting a termination
//	rate:N/m            the caller is not calling too often
//
// Each one is DECLARED from the manifest and enforced by an interface in
// this file. The gateway wires the real implementations at startup. A gate
// that is declared but cannot be enforced makes the route answer 501 rather
// than 200: a 200 would claim protection the process does not have.

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
// The token is the `id|plain` form; the row lives in
// `personal_access_tokens` and the lookup is by the SHA-256 of the plain
// part. The browser never sees it: the Next server keeps it in an httpOnly
// cookie and attaches it to the upstream request.
type Authenticator interface {
	// Authenticate returns the caller, or nil when the request carries no
	// usable token.
	Authenticate(r *http.Request) (Caller, error)
}

// RateLimiter counts the calls per key.
type RateLimiter interface {
	// Allow reports whether the call may proceed, how long the caller
	// should wait if it may not, and the remaining budget after this call.
	// The remaining count comes from the same read as the decision, so the
	// middleware never pays a second count query for the headers.
	Allow(r *http.Request, limit int, window time.Duration) (bool, time.Duration, int)
}

// ProjectFreezer answers whether a project is frozen.
//
// A project whose status is `termination_pending` rejects every POST, PUT,
// PATCH and DELETE with a 422 and a fixed Indonesian message. The gate is
// intentionally blunt: a termination is a legal/escrow boundary, not a state
// where "just this one write" is safe.
type ProjectFreezer interface {
	// Frozen reports whether the project is frozen for a mutation.
	Frozen(r *http.Request) (bool, error)
}

// Gates is the set of enforcement points the router needs. A nil gate makes
// every route that declares it answer 501, which is what readiness reports.
type Gates struct {
	// Handlers are the routes this build actually serves, keyed by route id.
	// A route absent from this map answers the 501 stub.
	Handlers map[string]http.HandlerFunc

	Auth    Authenticator
	Limiter RateLimiter
	Freezer ProjectFreezer

	// DBStats reports pool totals for /readyz observability. Nil when the
	// gateway runs without PostgreSQL. Readiness itself stays gate-based so
	// a slow database cannot flip a probe into a restart loop.
	DBStats func() (total, idle, acquired int32)
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

// requestIDKey is the context key carrying the request's ID.
type requestIDKey struct{}

// RequestIDFrom returns the request's ID, if the request-ID middleware ran.
func RequestIDFrom(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(requestIDKey{}).(string)
	return id, ok && id != ""
}

// withRequestID propagates the client-supplied `X-Request-ID` or mints a
// 128-bit hex id, echoes it back on the response, and logs the request with
// the id attached — one place, so handlers do not thread it themselves.
func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		if id == "" {
			var b [16]byte
			if _, err := rand.Read(b[:]); err != nil {
				id = "unknown"
			} else {
				id = hex.EncodeToString(b[:])
			}
		}
		if len(id) > 128 {
			id = id[:128]
		}
		w.Header().Set("X-Request-ID", id)
		start := time.Now()
		sr := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sr, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, id)))
		slog.Info("request",
			"request_id", id,
			"method", r.Method,
			"path", r.URL.Path,
			"status", sr.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

// statusRecorder captures the status for the request log.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(status int) {
	s.status = status
	s.ResponseWriter.WriteHeader(status)
}

// Flush lets an SSE handler stream through the request logger. Without this
// method the `http.Flusher` assertion fails and the whole stream is buffered.
func (s *statusRecorder) Flush() {
	if flusher, ok := s.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Unwrap keeps `http.ResponseController` working through the recorder.
func (s *statusRecorder) Unwrap() http.ResponseWriter {
	return s.ResponseWriter
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

// withSecurityHeaders is the browser-side baseline for every response,
// including the JSON 404 catch-all and uploaded bytes.
func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")

		if forwardedProto(r) == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		next.ServeHTTP(w, r)
	})
}

// withRequestLimits bounds the bytes a request can make the process buffer.
//
// JSON is small by design (2 MB); a multipart upload is allowed up to 80 MB,
// which is the largest attachment cap any handler declares. A content length
// that already exceeds the cap is refused before a single byte is read.
//
// A multipart body also gets its own read deadline. The server's global
// ReadTimeout is deliberately short (slowloris protection), but an 80 MB
// upload is legitimate work: the deadline assumes a slow 1 Mbps client and
// is capped at 30 minutes.
func withRequestLimits(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := int64(2 << 20)

		if strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "multipart/form-data") {
			limit = 80 << 20
			deadline := uploadReadTimeout(r.ContentLength, true)
			// A ResponseWriter that cannot set a deadline (a test recorder,
			// an HTTP version without support) keeps the server default.
			_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(deadline))
		}

		if r.ContentLength > limit {
			message(w, http.StatusRequestEntityTooLarge, "The request body is too large.")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

const (
	uploadDeadlineFloor = 30 * time.Second
	uploadDeadlineCap   = 30 * time.Minute
	uploadBytesPerSec   = 128 * 1024 // a slow 1 Mbps client
)

// uploadReadTimeout sizes a multipart read window from the declared body.
// Unknown/streamed lengths get the cap; a small multipart still gets the
// floor.
func uploadReadTimeout(contentLength int64, multipart bool) time.Duration {
	if !multipart {
		return uploadDeadlineFloor
	}
	if contentLength <= 0 {
		return uploadDeadlineCap
	}
	deadline := uploadDeadlineFloor + time.Duration(contentLength/uploadBytesPerSec)*time.Second
	if deadline > uploadDeadlineCap {
		return uploadDeadlineCap
	}
	return deadline
}

// withOptionalCaller resolves a bearer token without requiring one.
//
// Public endpoints still need to know who is asking: `GET /api/houses?mine=1`
// and the public directories personalize their rows for a signed-in caller.
// A missing or invalid token stays anonymous here; `requireAuth` is what
// rejects it on a protected route.
func withOptionalCaller(gates Gates, next http.Handler) http.Handler {
	if gates.Auth == nil {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			if caller, err := gates.Auth.Authenticate(r); err == nil && caller != nil {
				r = r.WithContext(withCaller(r.Context(), caller))
			}
		}

		next.ServeHTTP(w, r)
	})
}

// requireAuth is the `auth` gate. A missing or unusable token answers 401
// with `{"message":"Unauthenticated."}`; a valid token is attached to the
// request context for the handler and the other gates.
func (g Gates) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := CallerFrom(r.Context()); ok {
			next.ServeHTTP(w, r)
			return
		}

		if g.Auth == nil {
			message(w, http.StatusNotImplemented, "Authentication is not configured.")
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
// The previous middleware is `AdminMiddleware`, which answers 403 with
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
// The previous middleware blocks every mutation on a project that is awaiting
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
// The previous routes declare `throttle:5,1` on the login, the register and
// the two password resets, `throttle:10,1` on the conversation endpoints and
// the admin CSV export, and `throttle:30,1` on the geocode proxies and the
// message endpoint.
//
// The previous limiter is keyed by the bearer token's hash, or by the client
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

			allowed, retryAfter, remaining := g.Limiter.Allow(r, limit, window)
			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
				w.Header().Set("X-RateLimit-Remaining", "0")
				message(w, http.StatusTooManyRequests, "Too Many Attempts.")
				return
			}

			// The remaining count, for observability. It comes from the
			// Allow call above, not a second query. The shadow comparator
			// only checks status, content-type and body, so these headers do
			// not affect contract — but a client that cannot see its budget
			// cannot back off, and the original API emits them.
			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))

			next.ServeHTTP(w, r)
		})
	}
}

// isMutation reports whether a method changes something.
//
// The previous freeze middleware only blocks the mutating verbs.
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
// The spec is the original API's: the maximum number of attempts, and the decay
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
