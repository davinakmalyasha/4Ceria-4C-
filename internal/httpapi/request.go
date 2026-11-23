package httpapi

import (
	"net"
	"net/http"
	"os"
	"strings"
)

// clientIP is the caller's address, honouring proxy headers only when the
// request came from a proxy the deployment trusts.
//
// A directly exposed gateway must not let a caller choose its own rate-limit
// bucket with `X-Forwarded-For`. `TRUSTED_PROXIES` is a comma-separated list of
// CIDRs or IPs (for example `10.0.0.0/8,127.0.0.1`); when the peer is on that
// list, the right-most untrusted hop is the caller.
func clientIP(r *http.Request) string {
	peer := remoteIP(r.RemoteAddr)

	if peer == "" || !trustedProxy(peer) {
		return peer
	}

	chain := forwardedChain(r.Header.Get("X-Forwarded-For"))
	// Walk from the proxy inward, skipping hops we trust. The first address we
	// do not trust is the client that spoke to our edge.
	for i := len(chain) - 1; i >= 0; i-- {
		if !trustedProxy(chain[i]) {
			return chain[i]
		}
	}

	if len(chain) > 0 {
		return chain[0]
	}

	return peer
}

func remoteIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil {
		return strings.Trim(host, "[]")
	}

	return strings.Trim(strings.TrimSpace(remoteAddr), "[]")
}

func isLoopbackIP(ip string) bool {
	parsed := net.ParseIP(ip)
	return parsed != nil && parsed.IsLoopback()
}

func forwardedChain(header string) []string {
	if header == "" {
		return nil
	}

	parts := strings.Split(header, ",")
	out := make([]string, 0, len(parts))

	for _, part := range parts {
		ip := net.ParseIP(strings.TrimSpace(part))
		if ip != nil {
			out = append(out, ip.String())
		}
	}

	return out
}

func trustedProxy(ip string) bool {
	raw := strings.TrimSpace(os.Getenv("TRUSTED_PROXIES"))
	if raw == "" {
		return false
	}

	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}

	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}

		if _, cidr, err := net.ParseCIDR(entry); err == nil {
			if cidr.Contains(parsed) {
				return true
			}
			continue
		}

		if candidate := net.ParseIP(entry); candidate != nil && candidate.Equal(parsed) {
			return true
		}
	}

	return false
}

// forwardedProto is the scheme the caller used, trusted only from a configured
// proxy. A direct request answers with its own TLS state.
func forwardedProto(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}

	if peer := remoteIP(r.RemoteAddr); trustedProxy(peer) {
		if proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); proto == "http" || proto == "https" {
			return proto
		}
	}

	return "http"
}
