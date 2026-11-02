package httpapi

import (
	"bufio"
	"context"
	"net/http"
	"os"
	"strings"
)

// REQUEST-SCOPED URLS.
//
// Laravel's `url()`/`asset()` helpers render from the bound request when
// one exists — under Octane serving live traffic that is the caller's
// scheme and host, and APP_URL is only the fallback when no request is
// bound (queued jobs, mail). A gateway that renders storage and signature
// URLs from APP_URL therefore disagrees with the oracle on every host
// that is not APP_URL — which is every shadow run.
//
// Handlers that emit absolute URLs store the request origin in the
// context; the project URL builders read it back. Anything without a
// request (the mailer, the ETL) keeps the APP_URL default.

// assetBaseKey carries the request origin for URL builders.
type assetBaseKey struct{}

// withAssetBase stores the request origin in the context.
func withAssetBase(ctx context.Context, base string) context.Context {
	return context.WithValue(ctx, assetBaseKey{}, base)
}

// assetBaseOf reads the request origin, falling back to the APP_URL
// default when no request set one.
func assetBaseOf(ctx context.Context) string {
	if base, ok := ctx.Value(assetBaseKey{}).(string); ok && base != "" {
		return base
	}

	return assetBase()
}

// requestOrigin is the caller's scheme and host: the forwarded proto
// when present, TLS awareness otherwise, and the Host header verbatim.
func requestOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	}

	return scheme + "://" + r.Host
}

// loadDotEnv reads KEY=VALUE lines from path into the process env,
// without overriding anything already set. It is the development
// equivalent of the platform's env injection: the gateway needs the
// same secrets Laravel reads from .env (APP_KEY for HMACs), and in
// production the file is simply absent.
func LoadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			continue
		}

		if _, exists := os.LookupEnv(key); exists {
			continue
		}

		value = strings.TrimSpace(value)
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		}

		_ = os.Setenv(key, value)
	}
}
