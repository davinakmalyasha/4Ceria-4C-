package httpapi

import (
	"net/http"
	"strings"
)

// clientIP is the caller's address, honouring the proxy header.
//
// The API sits behind a load balancer in production, so `RemoteAddr` is the
// balancer. `X-Forwarded-For` may carry a comma-separated chain; the first
// entry is the original client, which is what rate limiting and audit records
// mean by "the caller".
func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if i := strings.Index(forwarded, ","); i != -1 {
			forwarded = forwarded[:i]
		}

		return strings.TrimSpace(forwarded)
	}

	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		host = host[:i]
	}

	return strings.Trim(host, "[]")
}

// forwardedProto is the scheme the caller used.
//
// Terraform terminates TLS at the balancer, so the Go process sees plain HTTP
// and has to read the header to build absolute URLs with the right scheme.
func forwardedProto(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}

	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		return proto
	}

	return "http"
}
