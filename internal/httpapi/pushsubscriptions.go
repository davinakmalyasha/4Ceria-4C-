package httpapi

import (
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WEB PUSH — the VAPID public key and the subscription pair.
//
//   - GET /push/public-key answers `{public_key}` or a 501 when the key is not
//     configured (the local default: no VAPID_PUBLIC_KEY in .env).
//   - POST /push/subscribe validates the browser payload, REFUSES loopback /
//     link-local / RFC1918 / non-vendor hosts (SSRF guard: the queue worker
//     fetches this endpoint), then updateOrCreates by endpoint.
//   - POST /push/unsubscribe deletes by endpoint.
//
// The SSRF refusals are `abort(422, …)`, so their local answers carry a debug
// trace and stay out of the byte gate.

// pushAllowedSuffixes is ALLOWED_ENDPOINT_SUFFIXES, verbatim (the Windows
// entry really does contain the literal `{region}`).
var pushAllowedSuffixes = []string{
	"fcm.googleapis.com",
	"updates.push.services.mozilla.com",
	"push.services.mozilla.com",
	"wns2-{region}.notify.windows.com",
	"notify.windows.com",
	"web.push.apple.com",
	"push.apple.com",
}

// PushPublicKeyHandler serves `GET /api/push/public-key`.
func PushPublicKeyHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := os.Getenv("VAPID_PUBLIC_KEY")
		if key == "" {
			message(w, http.StatusNotImplemented, "Web push is not configured")
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("public_key", key)
		writeJSON(w, http.StatusOK, payload)
	}
}

// pushEndpointProblem mirrors assertTrustedEndpoint. It returns the abort
// message, or "" when the endpoint is trusted.
func pushEndpointProblem(endpoint string) string {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "Invalid push endpoint."
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return "Invalid push endpoint."
	}

	blocked := map[string]bool{
		"localhost": true, "127.0.0.1": true, "::1": true, "0.0.0.0": true,
		"169.254.169.254": true, "metadata.google.internal": true,
	}
	if blocked[host] || isIPLiteral(host) {
		return "Invalid push endpoint."
	}

	for _, suffix := range pushAllowedSuffixes {
		if host == suffix || strings.HasSuffix(host, "."+strings.TrimLeft(suffix, ".")) {
			return ""
		}
	}
	return "Unrecognized push service endpoint."
}

// isIPLiteral reports whether the host parses as an IPv4/IPv6 literal.
func isIPLiteral(host string) bool {
	if strings.Count(host, ":") >= 2 {
		return true // IPv6
	}
	parts := strings.Split(host, ".")
	if len(parts) != 4 {
		return false
	}
	for _, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 || value > 255 {
			return false
		}
	}
	return true
}

// pushEndpointInput validates the shared `endpoint` rule set.
func pushEndpointInput(fields map[string]any, failures *errorBag) (string, bool) {
	raw, present := fields["endpoint"]
	if !present || raw == nil {
		failures.add("endpoint", "The endpoint field is required.")
		return "", false
	}
	text, ok := raw.(string)
	if !ok {
		failures.add("endpoint", "The endpoint field must be a string.")
		return "", false
	}
	parsed, err := url.Parse(text)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		failures.add("endpoint", "The endpoint field must be a valid URL.")
		return "", false
	}
	if len([]rune(text)) > 500 {
		failures.add("endpoint", "The endpoint field must not be greater than 500 characters.")
		return "", false
	}
	if !strings.HasPrefix(text, "https://") {
		failures.add("endpoint", "The endpoint field must start with one of the following: https://.")
		return "", false
	}
	return text, true
}

// pushKeyInput validates `keys.<name>` required|string|max:255.
func pushKeyInput(fields map[string]any, name string, failures *errorBag) (string, bool) {
	key := "keys." + name
	keys, ok := fields["keys"].(map[string]any)
	if !ok {
		failures.add(key, "The "+key+" field is required.")
		return "", false
	}
	raw, present := keys[name]
	if !present || raw == nil {
		failures.add(key, "The "+key+" field is required.")
		return "", false
	}
	text, ok := raw.(string)
	if !ok {
		failures.add(key, "The "+key+" field must be a string.")
		return "", false
	}
	if len([]rune(text)) > 255 {
		failures.add(key, "The "+key+" field must not be greater than 255 characters.")
		return "", false
	}
	return text, true
}

// PushSubscribeHandler serves `POST /api/push/subscribe`.
func PushSubscribeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		endpoint, endpointOK := pushEndpointInput(fields, failures)
		p256dh, _ := pushKeyInput(fields, "p256dh", failures)
		auth, _ := pushKeyInput(fields, "auth", failures)

		contentEncoding := "aesgcm"
		if raw, present := fields["contentEncoding"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("contentEncoding", "The contentEncoding field must be a string.")
			} else if len([]rune(text)) > 20 {
				failures.add("contentEncoding", "The contentEncoding field must not be greater than 20 characters.")
			} else {
				contentEncoding = text
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}
		if !endpointOK {
			return
		}

		if problem := pushEndpointProblem(endpoint); problem != "" {
			message(w, http.StatusUnprocessableEntity, problem)
			return
		}

		userAgent := r.UserAgent()
		if runes := []rune(userAgent); len(runes) > 500 {
			userAgent = string(runes[:500])
		}

		var id int64
		err := pool.QueryRow(ctx, `SELECT id FROM push_subscriptions
			WHERE user_id = $1 AND endpoint = $2`, caller.UserID(), endpoint).Scan(&id)
		if err == nil {
			if _, err := pool.Exec(ctx, `UPDATE push_subscriptions
				SET p256dh = $2, auth = $3, content_encoding = $4, user_agent = $5,
				    updated_at = date_trunc('second', now())
				WHERE id = $1`, id, p256dh, auth, contentEncoding, userAgent); err != nil {
				slog.Error("push subscribe: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if _, err := pool.Exec(ctx, `INSERT INTO push_subscriptions
				(user_id, endpoint, p256dh, auth, content_encoding, user_agent, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, date_trunc('second', now()), date_trunc('second', now()))`,
				caller.UserID(), endpoint, p256dh, auth, contentEncoding, userAgent); err != nil {
				slog.Error("push subscribe: insert", "error", err)
				serverError(w)
				return
			}
		}

		message(w, http.StatusOK, "Push subscription saved")
	}
}

// PushUnsubscribeHandler serves `POST /api/push/unsubscribe`.
func PushUnsubscribeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		endpoint, endpointOK := pushEndpointInput(fields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}
		if !endpointOK {
			return
		}

		if problem := pushEndpointProblem(endpoint); problem != "" {
			message(w, http.StatusUnprocessableEntity, problem)
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM push_subscriptions
			WHERE user_id = $1 AND endpoint = $2`, caller.UserID(), endpoint); err != nil {
			slog.Error("push unsubscribe: delete", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Push subscription removed")
	}
}
