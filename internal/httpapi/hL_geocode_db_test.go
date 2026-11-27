package httpapi

// hL geocode: handler twins with a stub upstream, cache get/set/expiry,
// origin branches, decoder error pins and the raw writers.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

var hLGeoSeq int64 = 1030001

func hLGeoCoord() (lat, lng string) {
	v := atomic.AddInt64(&hLGeoSeq, 1)
	// Unique 4dp coords per call: -6.(3000+v) keeps us inside [-90,90] and
	// far from every other worker's fixtures.
	micro := 3000 + (v % 5000)
	lat = "-6." + itoaTest(1000 + micro)[1:]
	lng = "106." + itoaTest(2000 + (v % 5000))[1:]
	return lat, lng
}

func hLGeoStub(t *testing.T, status int, body string, hits *int64) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(hits, 1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
}

func TestHLGeocodeReverse(t *testing.T) {
	pool := hLPool(t)

	lat, lng := hLGeoCoord()
	var hits int64
	stub := hLGeoStub(t, http.StatusOK, `{"display_name":"hL Place","lat":"`+lat+`"}`, &hits)
	defer stub.Close()
	t.Setenv("GEOCODING_ORIGIN", stub.URL)

	target := "/api/geocode/reverse?lat=" + lat + "&lng=" + lng
	rec := httptest.NewRecorder()
	GeocodeReverseHandler(pool)(rec, httptest.NewRequest(http.MethodGet, target, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("reverse = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"display_name":"hL Place"`) {
		t.Fatalf("reverse body = %s", rec.Body.String())
	}
	if got := atomic.LoadInt64(&hits); got != 1 {
		t.Fatalf("upstream hits = %d, want 1", got)
	}
	// Second identical request is served from the memo: the stub stays
	// silent and the bytes are identical (rejection twin for refetch).
	rec2 := httptest.NewRecorder()
	GeocodeReverseHandler(pool)(rec2, httptest.NewRequest(http.MethodGet, target, nil))
	if rec2.Code != http.StatusOK || rec2.Body.String() != rec.Body.String() {
		t.Fatalf("reverse cached = %d %q want %q", rec2.Code, rec2.Body.String(), rec.Body.String())
	}
	if got := atomic.LoadInt64(&hits); got != 1 {
		t.Fatalf("upstream hits after cache = %d, want 1", got)
	}
	// If-None-Match on the weak ETag answers 304.
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatalf("reverse missing etag")
	}
	cond := httptest.NewRequest(http.MethodGet, target, nil)
	cond.Header.Set("If-None-Match", etag)
	rec3 := httptest.NewRecorder()
	GeocodeReverseHandler(pool)(rec3, cond)
	if rec3.Code != http.StatusNotModified {
		t.Fatalf("reverse 304 = %d", rec3.Code)
	}

	// Validation twins with exact messages.
	for _, tc := range []struct {
		name, query, field, msg string
	}{
		{"missing lat", "/api/geocode/reverse?lng=106.8", "lat", "The lat field is required."},
		{"missing lng", "/api/geocode/reverse?lat=-6.2", "lng", "The lng field is required."},
		{"bad lat", "/api/geocode/reverse?lat=abc&lng=106.8", "lat", "The lat field must be a number."},
		{"range lng", "/api/geocode/reverse?lat=-6.2&lng=999", "lng", "The lng field must be between -180 and 180."},
	} {
		rr := httptest.NewRecorder()
		GeocodeReverseHandler(pool)(rr, httptest.NewRequest(http.MethodGet, tc.query, nil))
		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s = %d, want 422", tc.name, rr.Code)
		}
		body := hLDecode(t, rr)
		errs := body["errors"].(map[string]any)[tc.field].([]any)
		if len(errs) != 1 || errs[0].(string) != tc.msg {
			t.Fatalf("%s errors = %v", tc.name, errs)
		}
	}

	// Upstream failure is a 503 pin, never a 500.
	var hits503 int64
	bad := hLGeoStub(t, http.StatusInternalServerError, `oops`, &hits503)
	defer bad.Close()
	t.Setenv("GEOCODING_ORIGIN", bad.URL)
	lat2, lng2 := hLGeoCoord()
	rec4 := httptest.NewRecorder()
	GeocodeReverseHandler(pool)(rec4, httptest.NewRequest(http.MethodGet, "/api/geocode/reverse?lat="+lat2+"&lng="+lng2, nil))
	if rec4.Code != http.StatusServiceUnavailable {
		t.Fatalf("reverse upstream 500 = %d", rec4.Code)
	}
	if !strings.Contains(rec4.Body.String(), "Geocoding service unavailable") {
		t.Fatalf("reverse 503 body = %s", rec4.Body.String())
	}

	// Upstream garbage is a 503 too (re-encoding cannot run).
	var hitsBad int64
	garbage := hLGeoStub(t, http.StatusOK, `{oops`, &hitsBad)
	defer garbage.Close()
	t.Setenv("GEOCODING_ORIGIN", garbage.URL)
	lat3, lng3 := hLGeoCoord()
	rec5 := httptest.NewRecorder()
	GeocodeReverseHandler(pool)(rec5, httptest.NewRequest(http.MethodGet, "/api/geocode/reverse?lat="+lat3+"&lng="+lng3, nil))
	if rec5.Code != http.StatusServiceUnavailable {
		t.Fatalf("reverse garbage = %d %s", rec5.Code, rec5.Body.String())
	}
}

func TestHLGeocodeSearch(t *testing.T) {
	pool := hLPool(t)

	var hits int64
	stub := hLGeoStub(t, http.StatusOK, `[{"place_id":1030001}]`, &hits)
	defer stub.Close()
	t.Setenv("GEOCODING_ORIGIN", stub.URL)

	query := "hL Unique Search 1030001"
	target := "/api/geocode/search?q=" + strings.ReplaceAll(query, " ", "+")
	rec := httptest.NewRecorder()
	GeocodeSearchHandler(pool)(rec, httptest.NewRequest(http.MethodGet, target, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("search = %d %s", rec.Code, rec.Body.String())
	}
	if strings.TrimSpace(rec.Body.String()) != `[{"place_id":1030001}]` {
		t.Fatalf("search body = %s", rec.Body.String())
	}
	// Cached: same bytes, no second upstream hit.
	rec2 := httptest.NewRecorder()
	GeocodeSearchHandler(pool)(rec2, httptest.NewRequest(http.MethodGet, target, nil))
	if rec2.Body.String() != rec.Body.String() || atomic.LoadInt64(&hits) != 1 {
		t.Fatalf("search cache miss: hits=%d %q", atomic.LoadInt64(&hits), rec2.Body.String())
	}

	// Missing q and overlong q are 422 twins.
	rr := httptest.NewRecorder()
	GeocodeSearchHandler(pool)(rr, httptest.NewRequest(http.MethodGet, "/api/geocode/search", nil))
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("search missing q = %d", rr.Code)
	}
	if errs := hLDecode(t, rr)["errors"].(map[string]any)["q"].([]any); len(errs) != 1 || errs[0].(string) != "The q field is required." {
		t.Fatalf("search missing q errors = %v", errs)
	}
	rr = httptest.NewRecorder()
	GeocodeSearchHandler(pool)(rr, httptest.NewRequest(http.MethodGet, "/api/geocode/search?q="+strings.Repeat("q", 256), nil))
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("search long q = %d", rr.Code)
	}
	if errs := hLDecode(t, rr)["errors"].(map[string]any)["q"].([]any); len(errs) != 1 || errs[0].(string) != "The q field must not be greater than 255 characters." {
		t.Fatalf("search long q errors = %v", errs)
	}

	// Upstream 500 is a 503 pin.
	var hits503 int64
	bad := hLGeoStub(t, http.StatusBadGateway, `x`, &hits503)
	defer bad.Close()
	t.Setenv("GEOCODING_ORIGIN", bad.URL)
	rec3 := httptest.NewRecorder()
	GeocodeSearchHandler(pool)(rec3, httptest.NewRequest(http.MethodGet, "/api/geocode/search?q=hL+never+1030002", nil))
	if rec3.Code != http.StatusServiceUnavailable {
		t.Fatalf("search upstream = %d", rec3.Code)
	}
}

func TestHLGeocodeCacheOrigin(t *testing.T) {
	// Origin branches: env wins with trimming, default is Nominatim.
	t.Setenv("GEOCODING_ORIGIN", "https://hL-geo.example.test/")
	if got := geocodeOrigin(); got != "https://hL-geo.example.test" {
		t.Fatalf("origin env = %q", got)
	}
	t.Setenv("GEOCODING_ORIGIN", "")
	if got := geocodeOrigin(); got != "https://nominatim.openstreetmap.org" {
		t.Fatalf("origin default = %q", got)
	}

	// Cache: miss, hit, expiry, eviction sweep.
	c := newGeocodeCache()
	if _, ok := c.get("hL-missing"); ok {
		t.Fatalf("cache phantom hit")
	}
	c.set("hL-k", []byte(`{"a":1}`), time.Minute)
	body, ok := c.get("hL-k")
	if !ok || string(body) != `{"a":1}` {
		t.Fatalf("cache hit = %q %v", body, ok)
	}
	c.set("hL-old", []byte(`x`), -time.Second)
	if _, ok := c.get("hL-old"); ok {
		t.Fatalf("cache expired hit")
	}
	// Fill past capacity: the janitor drops expired rows first, then
	// arbitrary rows, and the map never grows past the cap.
	for i := 0; i < 2100; i++ {
		ttl := time.Minute
		if i%2 == 0 {
			ttl = -time.Second
		}
		c.set("hL-fill-"+itoaTest(int64(i)), []byte(`{}`), ttl)
	}
	c.set("hL-final", []byte(`{}`), time.Minute)
	c.Lock()
	n := len(c.entries)
	c.Unlock()
	if n > 2048 {
		t.Fatalf("cache size = %d, want <= 2048", n)
	}
}

func TestHLGeocodeDecoderErrors(t *testing.T) {
	// Every decoder error path renders through jsonError with the fixed
	// prefix — the 503 log line the sweeper path pins.
	for _, raw := range []string{
		`{oops`, `{"a":}`, `{"a" 1}`, `{"a":1`, `[1,`, `[1 2]`,
		`"abc`, `"a\qb"`, "\"\\u12\"",
		`truX`, `nul`, `{"a":truX}`, ``, `   `, `1 2`,
	} {
		if _, err := decodeOrdered([]byte(raw)); err == nil {
			t.Fatalf("decodeOrdered(%q) ok, want error", raw)
		} else if !strings.HasPrefix(err.Error(), "geocode: invalid JSON: ") {
			t.Fatalf("decodeOrdered(%q) err = %q", raw, err.Error())
		}
	}
	// Number spellings: int vs float, bad literal.
	if v, err := decodeOrdered([]byte(`-42`)); err != nil || v != int64(-42) {
		t.Fatalf("decode int = %v %v", v, err)
	}
	if v, err := decodeOrdered([]byte(`1e3`)); err != nil || v != float64(1000) {
		t.Fatalf("decode exp = %v %v", v, err)
	}
	if _, err := decodeOrdered([]byte(`--1`)); err == nil {
		t.Fatalf("decode --1 ok, want error")
	}
	if _, err := decodeOrdered([]byte(`"-"`)); err != nil {
		t.Fatalf("decode lone minus string: %v", err)
	}
	// writeJSONRaw carries bytes verbatim with length and content type.
	rec := httptest.NewRecorder()
	writeJSONRaw(rec, http.StatusOK, []byte(`{"hL":1}`))
	if rec.Code != http.StatusOK || rec.Body.String() != `{"hL":1}` {
		t.Fatalf("raw = %d %q", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("raw content-type = %q", ct)
	}
	// isIntLiteral edge spellings.
	if isIntLiteral("") || !isIntLiteral("-0") || isIntLiteral("-") || isIntLiteral("1.5") || isIntLiteral("0x1") {
		t.Fatalf("isIntLiteral edges")
	}
}
