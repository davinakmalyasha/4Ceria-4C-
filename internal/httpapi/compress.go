package httpapi

import (
	"compress/gzip"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// Response compression.
//
// The API is JSON: highly compressible, and often much larger on the wire
// than in memory. Compression belongs in ONE middleware rather than in 277
// handlers, and it must never touch a stream:
//
//   - `text/event-stream` is passed through untouched, with Flush;
//   - small bodies stay uncompressed, because a gzip header/footer can cost
//     more than the body saves;
//   - 204/304/HEAD responses carry no body to compress;
//   - `Vary: Accept-Encoding` is set for compressible responses even when the
//     caller did not ask for gzip, so caches keep the variants apart.
//
// When a handler knows its body length (writeJSON sets Content-Length), the
// decision happens at header time and nothing is buffered. Otherwise a
// prefix is buffered until the size is known; a large body then streams
// through gzip instead of waiting for the handler to finish.

const (
	gzipMinBytes = 1024
	gzipLevel    = 5
)

var gzipPool = sync.Pool{
	New: func() any {
		writer, err := gzip.NewWriterLevel(io.Discard, gzipLevel)
		if err != nil {
			// gzip.NewWriterLevel only fails for an invalid level, which is a
			// compile-time constant here.
			panic(err)
		}
		return writer
	},
}

func withCompression(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gw := &gzipResponseWriter{
			ResponseWriter: w,
			request:        r,
			status:         http.StatusOK,
			acceptsGzip:    acceptsGzip(r),
			minBytes:       gzipMinBytes,
		}
		defer gw.finish()
		next.ServeHTTP(gw, r)
	})
}

type gzipResponseWriter struct {
	http.ResponseWriter
	request     *http.Request
	status      int
	wroteHeader bool
	decided     bool
	compressed  bool
	acceptsGzip bool
	minBytes    int
	buffer      []byte
	gzip        *gzip.Writer
}

func (w *gzipResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	// Informational responses do not finalise the response; forward them
	// without locking the wrapper into a status.
	if status >= 100 && status < http.StatusOK {
		w.ResponseWriter.WriteHeader(status)
		return
	}
	w.wroteHeader = true
	w.status = status

	contentType := w.Header().Get("Content-Type")
	if isCompressible(contentType) {
		addVary(w.Header(), "Accept-Encoding")
	}

	// Streaming, empty and non-compressible responses are written through
	// immediately.
	if status == http.StatusNoContent ||
		status == http.StatusNotModified ||
		w.request.Method == http.MethodHead ||
		!w.acceptsGzip ||
		!isCompressible(contentType) {
		w.decided = true
		w.ResponseWriter.WriteHeader(status)
		return
	}

	// A handler that knows its body length (writeJSON does) lets us decide
	// at header time. No prefix buffer, no extra copy.
	if rawLength := w.Header().Get("Content-Length"); rawLength != "" {
		if length, err := strconv.Atoi(rawLength); err == nil {
			w.decided = true
			if length >= w.minBytes {
				w.compressed = true
				w.Header().Set("Content-Encoding", "gzip")
				w.Header().Del("Content-Length")
				w.ResponseWriter.WriteHeader(status)
				w.gzip = gzipPool.Get().(*gzip.Writer)
				w.gzip.Reset(w.ResponseWriter)
			} else {
				w.ResponseWriter.WriteHeader(status)
			}
			return
		}
	}
}

func (w *gzipResponseWriter) Write(p []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}

	if w.decided {
		if w.compressed {
			return w.gzip.Write(p)
		}
		return w.ResponseWriter.Write(p)
	}

	w.buffer = append(w.buffer, p...)
	if len(w.buffer) >= w.minBytes {
		w.decide()
	}
	return len(p), nil
}

// Flush decides the response and flushes it. SSE reaches this with a
// non-compressible content type, so it is a direct pass-through.
func (w *gzipResponseWriter) Flush() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if !w.decided {
		w.decide()
	}
	if w.compressed && w.gzip != nil {
		_ = w.gzip.Flush()
	}
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Unwrap lets http.NewResponseController reach the real writer, so a handler
// can still extend its own write deadline through this middleware.
func (w *gzipResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *gzipResponseWriter) finish() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if !w.decided {
		w.decide()
	}
	if w.compressed && w.gzip != nil {
		_ = w.gzip.Close()
		w.gzip.Reset(io.Discard)
		gzipPool.Put(w.gzip)
		w.gzip = nil
	}
}

func (w *gzipResponseWriter) decide() {
	if w.decided {
		return
	}
	w.decided = true

	contentType := w.Header().Get("Content-Type")
	compress := len(w.buffer) >= w.minBytes &&
		w.acceptsGzip &&
		isCompressible(contentType) &&
		w.status >= http.StatusOK &&
		w.status != http.StatusNoContent &&
		w.status != http.StatusNotModified &&
		w.request.Method != http.MethodHead

	if compress {
		w.compressed = true
		w.Header().Set("Content-Encoding", "gzip")
		// The length of the identity body is not the length of this body.
		w.Header().Del("Content-Length")
	}

	w.ResponseWriter.WriteHeader(w.status)

	if w.compressed {
		w.gzip = gzipPool.Get().(*gzip.Writer)
		w.gzip.Reset(w.ResponseWriter)
		if len(w.buffer) > 0 {
			_, _ = w.gzip.Write(w.buffer)
		}
	} else if len(w.buffer) > 0 {
		_, _ = w.ResponseWriter.Write(w.buffer)
	}
	w.buffer = nil
}

func acceptsGzip(r *http.Request) bool {
	explicit, wildcard := -1.0, -1.0
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		fields := strings.Split(part, ";")
		coding := strings.ToLower(strings.TrimSpace(fields[0]))
		if coding == "" {
			continue
		}
		q := 1.0
		for _, field := range fields[1:] {
			field = strings.TrimSpace(field)
			if !strings.HasPrefix(field, "q=") {
				continue
			}
			if value, err := strconv.ParseFloat(strings.TrimPrefix(field, "q="), 64); err == nil {
				q = value
			}
		}
		switch coding {
		case "gzip", "x-gzip":
			explicit = q
		case "*":
			wildcard = q
		}
	}
	if explicit >= 0 {
		return explicit > 0
	}
	return wildcard > 0
}

func isCompressible(contentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.IndexByte(mediaType, ';'); i >= 0 {
		mediaType = strings.TrimSpace(mediaType[:i])
	}
	switch {
	case mediaType == "application/json",
		mediaType == "application/xml",
		mediaType == "application/javascript",
		mediaType == "application/x-ndjson",
		mediaType == "image/svg+xml",
		strings.HasPrefix(mediaType, "text/"):
		// A stream is not a finite document; gzip would add latency and
		// break the flush contract.
		return mediaType != "text/event-stream"
	default:
		return false
	}
}

func addVary(header http.Header, value string) {
	for _, existing := range header.Values("Vary") {
		for _, part := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(part), value) {
				return
			}
		}
	}
	header.Add("Vary", value)
}
