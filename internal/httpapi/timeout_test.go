package httpapi

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestUploadReadTimeout(t *testing.T) {
	cases := []struct {
		name          string
		contentLength int64
		multipart     bool
		want          time.Duration
	}{
		{"json", 2 << 20, false, 30 * time.Second},
		{"small multipart", 1024, true, 30 * time.Second},
		{"80 MB multipart", 80 << 20, true, 30*time.Second + 640*time.Second},
		{"unknown multipart", -1, true, 30 * time.Minute},
		{"huge multipart is capped", 1 << 40, true, 30 * time.Minute},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			if got := uploadReadTimeout(item.contentLength, item.multipart); got != item.want {
				t.Errorf("uploadReadTimeout(%d, %v) = %v, want %v", item.contentLength, item.multipart, got, item.want)
			}
		})
	}
}

type deadlineRecorder struct {
	header     http.Header
	body       bytes.Buffer
	status     int
	readBy     time.Time
	writeBy    time.Time
	flushCount int
}

func (d *deadlineRecorder) Header() http.Header {
	if d.header == nil {
		d.header = http.Header{}
	}
	return d.header
}

func (d *deadlineRecorder) Write(p []byte) (int, error) {
	if d.status == 0 {
		d.status = http.StatusOK
	}
	return d.body.Write(p)
}

func (d *deadlineRecorder) WriteHeader(status int) {
	if d.status == 0 {
		d.status = status
	}
}

func (d *deadlineRecorder) Flush() { d.flushCount++ }

func (d *deadlineRecorder) SetReadDeadline(t time.Time) error {
	d.readBy = t
	return nil
}

func (d *deadlineRecorder) SetWriteDeadline(t time.Time) error {
	d.writeBy = t
	return nil
}

func TestUploadLimitExtendsTheReadDeadline(t *testing.T) {
	handler := withRequestLimits(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
	}))
	request := httptest.NewRequest(http.MethodPost, "/api/upload", bytes.NewReader(nil))
	request.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	request.ContentLength = 80 << 20
	recorder := &deadlineRecorder{}

	before := time.Now()
	handler.ServeHTTP(recorder, request)
	after := time.Now()

	if recorder.readBy.IsZero() {
		t.Fatal("no read deadline was set")
	}
	if recorder.readBy.Before(before.Add(9*time.Minute)) || recorder.readBy.After(after.Add(12*time.Minute)) {
		t.Errorf("read deadline %v is outside the expected window", recorder.readBy.Sub(before))
	}
}

func TestJSONRequestKeepsTheServerReadDeadline(t *testing.T) {
	handler := withRequestLimits(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
	}))
	request := httptest.NewRequest(http.MethodPost, "/api/me", strings.NewReader(`{"name":"x"}`))
	recorder := &deadlineRecorder{}
	handler.ServeHTTP(recorder, request)
	if !recorder.readBy.IsZero() {
		t.Errorf("JSON request got a custom read deadline: %v", recorder.readBy)
	}
}

func TestSSEWriteDeadlineSurvivesCompressionMiddleware(t *testing.T) {
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(3 * time.Minute))
		fmt.Fprint(w, "data: ok\n\n")
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/ai/chat/stream", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := &deadlineRecorder{}
	handler.ServeHTTP(recorder, request)

	if recorder.writeBy.IsZero() {
		t.Fatal("write deadline did not reach the underlying writer")
	}
	if got := recorder.header.Get("Content-Encoding"); got != "" {
		t.Errorf("SSE was compressed: %q", got)
	}
	if got := recorder.body.String(); got != "data: ok\n\n" {
		t.Errorf("body = %q", got)
	}
}

func TestRealServerExtendsASlowSSEWrite(t *testing.T) {
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(2 * time.Second))
		time.Sleep(300 * time.Millisecond)
		fmt.Fprint(w, "data: survived\n\n")
	}))
	server := httptest.NewUnstartedServer(handler)
	server.Config.WriteTimeout = 150 * time.Millisecond
	server.Start()
	defer server.Close()

	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Get(server.URL)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(body) != "data: survived\n\n" {
		t.Errorf("body = %q", body)
	}
}
