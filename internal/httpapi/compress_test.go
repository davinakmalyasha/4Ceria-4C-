package httpapi

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
)

func TestAcceptsGzip(t *testing.T) {
	cases := []struct {
		header string
		want   bool
	}{
		{"", false},
		{"gzip", true},
		{"gzip, deflate, br", true},
		{"GZip", true},
		{"gzip;q=0", false},
		{"gzip;q=0.5", true},
		{"*", true},
		{"*;q=0", false},
		{"gzip;q=0, *", false},
		{"br, *;q=0.4", true},
		{"identity", false},
	}
	for _, item := range cases {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.Header.Set("Accept-Encoding", item.header)
		if got := acceptsGzip(request); got != item.want {
			t.Errorf("acceptsGzip(%q) = %v, want %v", item.header, got, item.want)
		}
	}
}

func TestCompressionSmallBodyStaysIdentity(t *testing.T) {
	body := []byte(`{"message":"ok"}`)
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("small body was compressed: %q", got)
	}
	if !strings.Contains(recorder.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("missing Vary: %q", recorder.Header().Get("Vary"))
	}
	if !bytes.Equal(recorder.Body.Bytes(), body) {
		t.Errorf("body changed: %q", recorder.Body.Bytes())
	}
}

func TestCompressionLargeBodyRoundTrips(t *testing.T) {
	body := []byte(`{"data":"` + strings.Repeat("rumah-", 2000) + `"}`)
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(body[:100])
		_, _ = w.Write(body[100:])
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q", got)
	}
	reader, err := gzip.NewReader(bytes.NewReader(recorder.Body.Bytes()))
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	defer reader.Close()
	decoded, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("gunzip: %v", err)
	}
	if !bytes.Equal(decoded, body) {
		t.Errorf("decoded body differs: %d vs %d bytes", len(decoded), len(body))
	}
	if got := recorder.Header().Get("Content-Length"); got != "" {
		t.Errorf("compressed response kept Content-Length %q", got)
	}
	if compressed := recorder.Body.Len(); compressed*4 >= len(body) {
		t.Errorf("compression was not effective: %d compressed from %d", compressed, len(body))
	}
}

func TestCompressionUsesKnownContentLength(t *testing.T) {
	body := []byte(`{"data":"` + strings.Repeat("material-", 1000) + `"}`)
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		_, _ = w.Write(body)
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q", got)
	}
	reader, err := gzip.NewReader(bytes.NewReader(recorder.Body.Bytes()))
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	decoded, err := io.ReadAll(reader)
	reader.Close()
	if err != nil {
		t.Fatalf("gunzip: %v", err)
	}
	if !bytes.Equal(decoded, body) {
		t.Errorf("decoded body differs")
	}
}

func TestCompressionLeavesSSEAlone(t *testing.T) {
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"delta\":\"hi\"}\n\n"))
		w.(http.Flusher).Flush()
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("SSE was compressed: %q", got)
	}
	if got := recorder.Body.String(); got != "data: {\"delta\":\"hi\"}\n\n" {
		t.Errorf("SSE body changed: %q", got)
	}
}

func TestCompressionSkipsNoContent(t *testing.T) {
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Errorf("status = %d", recorder.Code)
	}
	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("204 was compressed: %q", got)
	}
}

func TestPublicJSONETagIsWeakAndVaries(t *testing.T) {
	body := jsonwire.NewObject().Set("data", []any{})
	request := httptest.NewRequest(http.MethodGet, "/api/houses", nil)
	recorder := httptest.NewRecorder()
	writeJSONPublic(recorder, request, http.StatusOK, body, 60)

	etag := recorder.Header().Get("ETag")
	if !strings.HasPrefix(etag, `W/"`) {
		t.Fatalf("ETag = %q, want weak", etag)
	}
	if !strings.Contains(recorder.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("missing Vary on 200: %q", recorder.Header().Get("Vary"))
	}

	conditional := httptest.NewRequest(http.MethodGet, "/api/houses", nil)
	conditional.Header.Set("If-None-Match", etag)
	conditionalRecorder := httptest.NewRecorder()
	writeJSONPublic(conditionalRecorder, conditional, http.StatusOK, body, 60)
	if conditionalRecorder.Code != http.StatusNotModified {
		t.Errorf("conditional status = %d", conditionalRecorder.Code)
	}
	if !strings.Contains(conditionalRecorder.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("missing Vary on 304: %q", conditionalRecorder.Header().Get("Vary"))
	}
}

func TestWeakETagMatchesBothForms(t *testing.T) {
	etag := weakETag([]byte(`{"a":1}`))
	if !strings.HasPrefix(etag, `W/"`) {
		t.Fatalf("not weak: %q", etag)
	}
	for _, header := range []string{etag, strings.TrimPrefix(etag, "W/"), "*", `"other", ` + etag} {
		if !etagMatches(header, etag) {
			t.Errorf("etagMatches(%q) = false", header)
		}
	}
	if etagMatches(`"different"`, etag) {
		t.Error("different etag matched")
	}
}
