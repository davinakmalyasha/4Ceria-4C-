// Package httpapi — the Laravel proxy.
//
// WHAT THIS IS FOR
// ----------------
// The rewrite is a strangler, not a big bang: one origin serves traffic, and
// each endpoint moves from Laravel to Go one line in `routing/routes.yaml` at
// a time (`upstream: laravel` -> `upstream: go`).
//
// Until a route is ported, the gateway must NOT answer 501 for it in
// production — a 501 is the honest answer in development ("not written yet"),
// but in production it is an outage on an endpoint the old stack still
// serves. So an unported route is PROXIED to Laravel, byte for byte.
//
// WHY THE PROXY DOES NOT ENFORCE THE GO GATES
// -------------------------------------------
// When the gateway proxies, Laravel is the authority: it enforces its own
// auth, admin, freeze and throttle gates against its own MySQL. Enforcing
// the Go gates as well would double-enforce — and the two would disagree
// during the transition (Go reads PostgreSQL, Laravel reads MySQL, and the
// ETL only copies on demand). A proxied request therefore skips the Go
// chain entirely; the chain in `router.go` applies to served handlers and
// to the 501 stub, not to the proxy.
//
// WHAT IS FORWARDED
// -----------------
// The method, the path, the raw query, the body (streamed, not buffered —
// uploads must not be loaded into memory twice), and the caller headers the
// API reads: `Authorization`, `Accept`, `Content-Type`, `X-Requested-With`
// and the `X-Forwarded-*` chain. Hop-by-hop headers (`Connection`,
// `Transfer-Encoding`, `Keep-Alive`, `Upgrade`, `Trailer`) are stripped,
// because they describe the client-gateway hop, not the gateway-Laravel hop.
//
// The response is passed through VERBATIM: status, headers and body. A proxy
// that "helps" — re-encoding JSON, adding a cache header, normalising an
// error shape — introduces a second contract, and the port is supposed to
// make the wire format identical, not introduce a new one.
//
// `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` are set so
// Laravel's `TRUSTED_PROXIES` handling and its paginator URLs (which are
// built from the request host) see the original caller, not the gateway.
package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
)

// Proxy forwards unported routes to the Laravel application.
type Proxy struct {
	target *url.URL
	client *http.Client
}

// NewProxy builds a proxy for a Laravel origin such as
// `http://127.0.0.1:9001`.
//
// An empty target means "no proxy": the router keeps answering the 501 stub.
// That is the development default — no surprise network calls from a test
// that forgot its environment.
func NewProxy(target string) (*Proxy, error) {
	if strings.TrimSpace(target) == "" {
		return nil, nil
	}

	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(target), "/"))
	if err != nil {
		return nil, err
	}

	return &Proxy{
		target: parsed,
		client: &http.Client{},
	}, nil
}

// Handler returns the handler that forwards one request to Laravel.
//
// It is intentionally NOT wrapped in the route's gate chain (see the package
// comment): Laravel enforces its own gates.
func (p *Proxy) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		out, err := http.NewRequestWithContext(r.Context(), r.Method, p.target.String()+r.URL.RequestURI(), r.Body)
		if err != nil {
			slog.Error("proxy: build upstream request", "error", err)
			serverError(w)
			return
		}

		copyProxyHeaders(out.Header, r.Header)
		out.Header.Set("X-Forwarded-For", clientIP(r))
		out.Header.Set("X-Forwarded-Proto", forwardedProto(r))
		out.Header.Set("X-Forwarded-Host", r.Host)

		// The Host of the upstream request is Laravel's, not the caller's:
		// otherwise the upstream server name check and any host-based
		// routing see the wrong name.
		out.Host = p.target.Host

		resp, err := p.client.Do(out)
		if err != nil {
			slog.Error("proxy: upstream unreachable", "target", p.target.String(), "path", r.URL.Path, "error", err)
			badGateway(w)
			return
		}
		defer resp.Body.Close()

		copyProxyResponseHeaders(w.Header(), resp.Header)
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})
}

// copyProxyHeaders copies the end-to-end headers from the caller to the
// upstream request, dropping the hop-by-hop ones.
func copyProxyHeaders(dst, src http.Header) {
	for key, values := range src {
		if isHopByHop(key) {
			continue
		}

		// The cookie is the Next.js session, not the API's Sanctum cookie.
		// Forwarding it would send the gateway's own session name to
		// Laravel, which ignores it — but an ignored credential that looks
		// present is how a future middleware misreads the request.
		if strings.EqualFold(key, "Cookie") {
			continue
		}

		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

// copyProxyResponseHeaders copies the upstream response headers, dropping the
// hop-by-hop ones and `Set-Cookie` (the session is the gateway's cookie, not
// the API's — see the BFF comment in `web/app/api/[...path]/route.ts`).
func copyProxyResponseHeaders(dst, src http.Header) {
	for key, values := range src {
		if isHopByHop(key) {
			continue
		}

		if strings.EqualFold(key, "Set-Cookie") {
			continue
		}

		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

// isHopByHop reports whether a header describes the transport hop rather
// than the request itself (RFC 2616 §13.5.1).
func isHopByHop(header string) bool {
	switch strings.ToLower(header) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
		"te", "trailer", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

// clientIP is the caller address without the port.
func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return forwarded
	}

	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		host = host[:i]
	}

	return strings.Trim(host, "[]")
}

// forwardedProto is the caller's scheme.
func forwardedProto(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}

	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		return proto
	}

	return "http"
}

// badGateway answers when Laravel cannot be reached.
//
// The shape matches the application's error convention (`{"message": ...}`)
// without impersonating a Laravel body Laravel never sent.
func badGateway(w http.ResponseWriter) {
	message(w, http.StatusBadGateway, "Bad Gateway.")
}
