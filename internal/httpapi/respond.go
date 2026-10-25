package httpapi

import (
	"net/http"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// THE RESPONSE HELPERS
// --------------------
// The legacy API has NO shared envelope. It is 780 hand-rolled
// `response()->json([...])` calls across 62 controllers, and the first key
// varies: `message` 623 times, `data` 83, `success` 21, `errors` 7. Six
// `JsonResource` classes account for another 50 call sites, and there are
// TWO pagination shapes — the raw `LengthAwarePaginator` at seven endpoints
// and the `PaginatedResourceResponse` at five more.
//
// So there is nothing to be faithful TO except the individual endpoint, and
// the golden files are what make each one checkable. What is shared is the
// ENCODING, and that is the `jsonphp` package's job.
//
// The helpers here are the two shapes the whole application needs:
//
//   - `writeJSON` — a body that is already the right shape;
//   - `message` — the 623-call convention: `['message' => '...']`, with the
//     status code.
//
// The error shapes are the four the legacy application produces, and they
// are NOT all the same:
//
//	422 validation   {"message":"The given data was invalid.","errors":{"field":["msg"]}}
//	422 business     {"message":"..."}
//	403 controller   {"message":"..."}
//	403 middleware   {"message":"Unauthorized access."}
//	403 policy       {"message":"This action is unauthorized."}
//	401              {"message":"Unauthenticated."}
//	404              {"message":"..."}
//	500              {"message":"Server Error"}
//
// The 500 is worth a note: with `APP_DEBUG=false` the handler answers
// `{"message":"Server Error"}`, and with `APP_DEBUG=true` it answers
// `{"message":..., "exception":..., "file":..., "line":..., "trace":[...]}`
// — PRETTY-PRINTED, because the exception handler is the only place in the
// application that passes `JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES`.
// The capture pins `APP_DEBUG=false`; the golden files record the bytes.

// writeJSON writes a JSON body with the status and the headers Laravel's
// `response()->json()` would produce.
func writeJSON(w http.ResponseWriter, status int, body any) {
	encoded, err := jsonphp.Marshal(body)
	if err != nil {
		// A body that cannot be encoded is a bug in the handler, not
		// something to paper over. Laravel's equivalent is a 500.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"message":"Server Error"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(encoded)
}

// message writes the `{"message": "..."}` shape.
//
// It is the application's most common response by a wide margin, and the
// shape the SPA's error reader expects.
func message(w http.ResponseWriter, status int, text string) {
	body := jsonphp.NewObject()
	body.Set("message", text)

	writeJSON(w, status, body)
}

// validationError writes the 422 shape the validator produces.
//
// The `errors` object maps a field to a LIST of messages, which is
// Laravel's shape and not a shape one would invent.
func validationError(w http.ResponseWriter, messageText string, errors map[string][]string) {
	body := jsonphp.NewObject()
	body.Set("message", messageText)

	fields := jsonphp.NewObject()

	// The field order is the order the validator produced, which is the
	// order the rules were declared in.
	for _, field := range sortedKeys(errors) {
		list := make([]any, 0, len(errors[field]))
		for _, text := range errors[field] {
			list = append(list, text)
		}
		fields.Set(field, list)
	}

	body.Set("errors", fields)

	writeJSON(w, http.StatusUnprocessableEntity, body)
}

// apiNotFound writes the body the SPA catch-all produces.
//
// `routes/web.php` declares `Route::any('/api/{any}', ...)` so that an
// unmatched API path answers with JSON instead of the SPA's HTML — and the
// reason is in the comment above it: a route removed or renamed on the API
// while an older SPA build is still live degrades silently instead of
// 404ing. The body carries a `path` key as well as the message.
func apiNotFound(w http.ResponseWriter, path string) {
	body := jsonphp.NewObject()
	body.Set("message", "API endpoint not found.")
	body.Set("path", path)

	writeJSON(w, http.StatusNotFound, body)
}

// sortedKeys returns a map's keys in a stable order.
//
// A Go map has no order, and the legacy application always produced a
// deterministic one, so anything that iterates a map has to impose one.
func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))

	for key := range values {
		keys = append(keys, key)
	}

	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}

	return keys
}
