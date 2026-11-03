package httpapi

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE GEOCODING PROXY.
//
// `GET /api/geocode/reverse` and `/api/geocode/search` proxy Nominatim and
// cache the result. The response body is Nominatim's JSON re-encoded the
// way Laravel re-encodes it (`response()->json($data)` decodes then
// re-encodes), so byte parity reduces to two facts: the same upstream
// parameters, and the same re-encoding.
//
// UPSTREAM PARAMETERS (read off GeocodeController, not assumed):
//   - reverse: format=json, lat (rounded to 4dp), **lon** (not lng),
//     addressdetails=1, accept-language=id
//   - search: format=json, q (trimmed), limit=5, countrycodes=id
//   - both: `User-Agent: 4Ceria-App-Backend`, 5 s timeout
//
// RE-ENCODING: PHP's `json_encode` preserves the decoded key order and
// escapes `/` as `\/`. A verbatim proxy of Nominatim's bytes would differ
// wherever Nominatim prints a raw `/` (its licence URL) or non-compact
// spacing — so the body is decoded order-preservingly and re-encoded
// through `jsonphp`, which mimics PHP's encoder.
//
// CACHE: a 7-day success cache keyed exactly like Laravel's
// (`geocode:reverse:lat:{lat}:lng:{lng}`, `geocode:search:{md5}`). The
// short-TTL-then-promote dance in the controller nets out to the same
// observable behaviour; failures are not cached. A process-local map: two
// replicas may fetch the same query twice, which is a bill, not a bug.
//
// ORIGIN: `GEOCODING_ORIGIN`, default the public Nominatim. Tests point it
// at a stub.
//
// WHY THE 200 PATH IS NOT IN THE SHADOW GATE
// ------------------------------------------
// The body is a third party's data. Two sequential live fetches — one per
// stack — can differ when OpenStreetMap changes, and the two stacks cache
// in different processes with different lifetimes. The validation paths
// are deterministic and ARE gated; the 200 path is proven against the
// PHP re-encode of the same upstream bytes, the honest maximum for a
// transparent proxy.

// geocodeCache is a TTL map with lazy expiry.
type geocodeCache struct {
	sync.Mutex
	entries map[string]geocodeEntry
}

type geocodeEntry struct {
	body    []byte
	expires time.Time
}

func newGeocodeCache() *geocodeCache {
	return &geocodeCache{entries: map[string]geocodeEntry{}}
}

func (c *geocodeCache) get(key string) ([]byte, bool) {
	now := time.Now()

	c.Lock()
	defer c.Unlock()

	entry, ok := c.entries[key]
	if !ok || !now.Before(entry.expires) {
		delete(c.entries, key)
		return nil, false
	}

	return entry.body, true
}

func (c *geocodeCache) set(key string, body []byte, ttl time.Duration) {
	c.Lock()
	defer c.Unlock()

	c.entries[key] = geocodeEntry{body: body, expires: time.Now().Add(ttl)}
}

var geocodeMemo = newGeocodeCache()

const geocodeSuccessTTL = 7 * 24 * time.Hour

// geocodeOrigin is the upstream base URL, without a trailing slash.
func geocodeOrigin() string {
	if origin := strings.TrimRight(strings.TrimSpace(os.Getenv("GEOCODING_ORIGIN")), "/"); origin != "" {
		return origin
	}

	return "https://nominatim.openstreetmap.org"
}

// GeocodeReverseHandler serves `GET /api/geocode/reverse`.
func GeocodeReverseHandler(_ *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()

		failures := &errorBag{}

		lat, latOK := geocodeNumber(query.Get("lat"), "lat", -90, 90, failures)
		lng, lngOK := geocodeNumber(query.Get("lng"), "lng", -180, 180, failures)

		if !failures.empty() {
			failures.write(w)
			return
		}
		_ = latOK
		_ = lngOK

		lat, lng = round4(lat), round4(lng)
		cacheKey := "geocode:reverse:lat:" + formatCoord(lat) + ":lng:" + formatCoord(lng)

		if body, ok := geocodeMemo.get(cacheKey); ok {
			writeJSONRawPublic(w, r, http.StatusOK, body, 300)
			return
		}

		params := url.Values{}
		params.Set("format", "json")
		params.Set("lat", formatCoord(lat))
		params.Set("lon", formatCoord(lng))
		params.Set("addressdetails", "1")
		params.Set("accept-language", "id")

		body, ok := geocodeFetch(r, geocodeOrigin()+"/reverse?"+params.Encode())
		if !ok {
			message(w, http.StatusServiceUnavailable, "Geocoding service unavailable")
			return
		}

		geocodeMemo.set(cacheKey, body, geocodeSuccessTTL)
		writeJSONRawPublic(w, r, http.StatusOK, body, 300)
	}
}

// GeocodeSearchHandler serves `GET /api/geocode/search`.
func GeocodeSearchHandler(_ *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()

		failures := &errorBag{}

		values, present := query["q"]
		var text string
		if !present || len(values) == 0 {
			failures.add("q", "The q field is required.")
		} else {
			text = values[0]
			if len([]rune(text)) > 255 {
				failures.add("q", "The q field must not be greater than 255 characters.")
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		trimmed := strings.TrimSpace(text)
		sum := md5.Sum([]byte(trimmed))
		cacheKey := "geocode:search:" + hex.EncodeToString(sum[:])

		if body, ok := geocodeMemo.get(cacheKey); ok {
			writeJSONRawPublic(w, r, http.StatusOK, body, 300)
			return
		}

		params := url.Values{}
		params.Set("format", "json")
		params.Set("q", trimmed)
		params.Set("limit", "5")
		params.Set("countrycodes", "id")

		body, ok := geocodeFetch(r, geocodeOrigin()+"/search?"+params.Encode())
		if !ok {
			message(w, http.StatusServiceUnavailable, "Geocoding service unavailable")
			return
		}

		geocodeMemo.set(cacheKey, body, geocodeSuccessTTL)
		writeJSONRawPublic(w, r, http.StatusOK, body, 300)
	}
}

// geocodeNumber validates one coordinate: required, numeric, between.
// A non-numeric value fails ONLY the numeric rule: Laravel's `between`
// reads its string length (which passes), so no second message appears.
func geocodeNumber(raw, field string, min, max float64, failures *errorBag) (float64, bool) {
	if raw == "" {
		failures.add(field, "The "+field+" field is required.")
		return 0, false
	}

	if !isPHPNumeric(raw) {
		failures.add(field, "The "+field+" field must be a number.")
		return 0, false
	}

	value, _ := strconv.ParseFloat(raw, 64)
	if value < min || value > max {
		failures.add(field, "The "+field+" field must be between "+strconv.Itoa(int(min))+" and "+strconv.Itoa(int(max))+".")
		return 0, false
	}

	return value, true
}

// round4 is PHP's `round($v, 4)`: half away from zero.
func round4(value float64) float64 {
	return math.Round(value*10000) / 10000
}

// formatCoord is PHP's float interpolation for the rounded values.
func formatCoord(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

// geocodeFetch GETs the upstream with the controller's headers and timeout,
// returning the re-encoded body. False means "503", exactly when Laravel's
// `$response->successful()` is false or the request throws.
func geocodeFetch(r *http.Request, target string) ([]byte, bool) {
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		slog.Error("geocode: request", "error", err)
		return nil, false
	}

	request.Header.Set("User-Agent", "4Ceria-App-Backend")

	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		slog.Error("geocode: upstream", "target", target, "error", err)
		return nil, false
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, false
	}

	raw, err := io.ReadAll(response.Body)
	if err != nil {
		slog.Error("geocode: body", "error", err)
		return nil, false
	}

	value, err := decodeOrdered(raw)
	if err != nil {
		slog.Error("geocode: decode", "error", err)
		return nil, false
	}

	encoded, err := jsonphp.Marshal(value)
	if err != nil {
		slog.Error("geocode: encode", "error", err)
		return nil, false
	}

	return encoded, true
}

// writeJSONRaw writes an already-encoded JSON document with the API's
// content type.
func writeJSONRaw(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// writeJSONRawPublic adds public caching to writeJSONRaw for geocode hits
// (third-party bytes, short TTL).
func writeJSONRawPublic(w http.ResponseWriter, r *http.Request, status int, body []byte, maxAge int) {
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:16]) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(maxAge))
	if r != nil {
		if inm := r.Header.Get("If-None-Match"); inm != "" && inm == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// decodeOrdered decodes JSON preserving object key order and number
// literals: objects become *jsonphp.Object, numbers stay verbatim.
func decodeOrdered(raw []byte) (any, error) {
	parser := &jsonParser{input: raw}
	value, err := parser.value()
	if err != nil {
		return nil, err
	}

	parser.spaces()
	if parser.atEnd() {
		return value, nil
	}

	return nil, jsonError("trailing characters")
}

type jsonError string

func (e jsonError) Error() string { return "geocode: invalid JSON: " + string(e) }

type jsonParser struct {
	input []byte
	pos   int
}

func (p *jsonParser) atEnd() bool { return p.pos >= len(p.input) }

func (p *jsonParser) spaces() {
	for !p.atEnd() {
		switch p.input[p.pos] {
		case ' ', '\t', '\n', '\r':
			p.pos++
		default:
			return
		}
	}
}

func (p *jsonParser) value() (any, error) {
	p.spaces()
	if p.atEnd() {
		return nil, jsonError("unexpected end")
	}

	switch c := p.input[p.pos]; c {
	case '{':
		return p.object()
	case '[':
		return p.array()
	case '"':
		return p.text()
	case 't':
		return p.literal("true", true)
	case 'f':
		return p.literal("false", false)
	case 'n':
		return p.literal("null", nil)
	default:
		return p.number()
	}
}

func (p *jsonParser) literal(word string, value any) (any, error) {
	if strings.HasPrefix(string(p.input[p.pos:]), word) {
		p.pos += len(word)
		return value, nil
	}

	return nil, jsonError("invalid literal")
}

func (p *jsonParser) object() (any, error) {
	p.pos++
	object := jsonphp.NewObject()

	p.spaces()
	if !p.atEnd() && p.input[p.pos] == '}' {
		p.pos++
		return object, nil
	}

	for {
		p.spaces()
		if p.atEnd() || p.input[p.pos] != '"' {
			return nil, jsonError("expected key")
		}

		key, err := p.text()
		if err != nil {
			return nil, err
		}

		p.spaces()
		if p.atEnd() || p.input[p.pos] != ':' {
			return nil, jsonError("expected colon")
		}
		p.pos++

		entry, err := p.value()
		if err != nil {
			return nil, err
		}

		object.Set(key, entry)

		p.spaces()
		if p.atEnd() {
			return nil, jsonError("unterminated object")
		}

		switch p.input[p.pos] {
		case ',':
			p.pos++
		case '}':
			p.pos++
			return object, nil
		default:
			return nil, jsonError("expected comma")
		}
	}
}

func (p *jsonParser) array() (any, error) {
	p.pos++
	list := make([]any, 0)

	p.spaces()
	if !p.atEnd() && p.input[p.pos] == ']' {
		p.pos++
		return list, nil
	}

	for {
		entry, err := p.value()
		if err != nil {
			return nil, err
		}

		list = append(list, entry)

		p.spaces()
		if p.atEnd() {
			return nil, jsonError("unterminated array")
		}

		switch p.input[p.pos] {
		case ',':
			p.pos++
		case ']':
			p.pos++
			return list, nil
		default:
			return nil, jsonError("expected comma")
		}
	}
}

// text decodes a JSON string. `\/` is folded to `/` first: it means `/`
// in JSON, and Go's escape handling has no name for it.
func (p *jsonParser) text() (string, error) {
	p.pos++

	var out strings.Builder

	for {
		if p.atEnd() {
			return "", jsonError("unterminated string")
		}

		c := p.input[p.pos]
		if c == '"' {
			p.pos++
			return out.String(), nil
		}

		if c != '\\' {
			out.WriteByte(c)
			p.pos++
			continue
		}

		end := p.pos + 2
		if end > len(p.input) {
			return "", jsonError("bad escape")
		}

		if p.input[p.pos+1] == 'u' {
			end = p.pos + 6
			if end > len(p.input) {
				return "", jsonError("bad unicode escape")
			}
		}

		unquoted, err := unquoteJSON(p.input[p.pos:end])
		if err != nil {
			return "", err
		}

		out.WriteString(unquoted)
		p.pos = end
	}
}

// unquoteJSON decodes one JSON escape sequence.
func unquoteJSON(escaped []byte) (string, error) {
	if len(escaped) == 2 && escaped[1] == '/' {
		return "/", nil
	}

	sequence := string(escaped)

	switch sequence {
	case `\\`:
		return `\`, nil
	case `\"`:
		return `"`, nil
	}

	if len(sequence) == 2 {
		switch sequence[1] {
		case 'b':
			return "\b", nil
		case 'f':
			return "\f", nil
		case 'n':
			return "\n", nil
		case 'r':
			return "\r", nil
		case 't':
			return "\t", nil
		}
	}

	if len(escaped) == 6 && escaped[0] == '\\' && escaped[1] == 'u' {
		code, err := strconv.ParseUint(string(escaped[2:]), 16, 32)
		if err != nil {
			return "", err
		}
		return string(rune(code)), nil
	}

	return "", jsonError("bad escape")
}

// number reads a JSON number the way PHP decodes it: an integer literal
// becomes an int, anything else a double. The encoder then formats it
// back — which is what normalises Nominatim's `e-05` to PHP's `e-5`.
// A verbatim passthrough would preserve the upstream spelling, and the
// two stacks would differ on every exponent.
func (p *jsonParser) number() (any, error) {
	start := p.pos

	for !p.atEnd() {
		switch c := p.input[p.pos]; c {
		case '-', '+', '.', 'e', 'E', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
			p.pos++
		default:
			goto done
		}
	}
done:

	if p.pos == start {
		return nil, jsonError("invalid number")
	}

	literal := string(p.input[start:p.pos])

	if isIntLiteral(literal) {
		if value, err := strconv.ParseInt(literal, 10, 64); err == nil {
			return value, nil
		}
	}

	value, err := strconv.ParseFloat(literal, 64)
	if err != nil {
		return nil, jsonError("invalid number")
	}

	return value, nil
}

// isIntLiteral reports a canonical JSON integer: no fraction, no exponent.
func isIntLiteral(literal string) bool {
	if literal == "" {
		return false
	}

	rest := literal
	if rest[0] == '-' {
		rest = rest[1:]
	}

	if rest == "" {
		return false
	}

	for i := 0; i < len(rest); i++ {
		if rest[i] < '0' || rest[i] > '9' {
			return false
		}
	}

	return true
}
