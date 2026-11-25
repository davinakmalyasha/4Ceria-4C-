package httpapi

// Pure-helper final closure: DB-free and network-free branches only.
// Covers randomTokenString shapes, profileRowColumns/directoryColumns tables,
// compress WriteHeader/Flush/finish/decide/acceptsGzip edges, amountString
// numeric branches and the geocode order-preserving decoders. Anything needing
// *pgxpool.Pool or the network is skipped by design.

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- randomTokenString: shapes only (rand.Read failure is untestable pure) ---

func TestFinalRandomTokenShapes(t *testing.T) {
	for _, n := range []int{0, 1, 6, 40} {
		got, err := randomTokenString(n)
		if err != nil {
			t.Fatalf("randomTokenString(%d): %v", n, err)
		}
		if len(got) != n {
			t.Fatalf("len = %d, want %d", len(got), n)
		}
		for _, c := range got {
			if !strings.ContainsRune(tokenAlphabet, c) {
				t.Fatalf("char %q outside the token alphabet", c)
			}
		}
	}
	// Two draws differ (randomness sanity, not a contract).
	a, _ := randomTokenString(16)
	b, _ := randomTokenString(16)
	if a == b {
		t.Log("two draws matched; acceptable but unlikely")
	}
}

// --- profileRowColumns + directoryColumns: every table, no DB ---

func TestFinalProfileAndDirectoryColumns(t *testing.T) {
	tables := []string{
		"arsiteks", "kontraktors", "notaris_profiles", "interior_profiles",
		"structural_engineers", "mep_engineers", "project_managers",
	}
	for _, table := range tables {
		cols := directoryColumns(table)
		if cols == "" || cols == "*" {
			t.Errorf("directoryColumns(%q) = %q, want explicit list", table, cols)
		}
		if got := profileRowColumns(table); got != cols {
			t.Errorf("profileRowColumns(%q) = %q, want directory list", table, got)
		}
	}
	if got := directoryColumns("unknown_table"); got != "*" {
		t.Errorf("directoryColumns(unknown) = %q, want *", got)
	}
	if got := profileRowColumns("unknown_table"); got != "id" {
		t.Errorf("profileRowColumns(unknown) = %q, want id", got)
	}
}

// --- compress: 1xx, double WriteHeader, small known length, Flush/decide ---

func TestFinalCompressForwardsInformational(t *testing.T) {
	recorder := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	gw := &gzipResponseWriter{ResponseWriter: recorder, request: r, status: http.StatusOK}
	gw.WriteHeader(103)
	if gw.wroteHeader {
		t.Error("1xx must not lock the wrapper status")
	}
	if recorder.Code != 103 {
		t.Fatalf("status = %d, want 103", recorder.Code)
	}
}

func TestFinalCompressSecondWriteHeaderIsNoop(t *testing.T) {
	recorder := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	gw := &gzipResponseWriter{ResponseWriter: recorder, request: r, status: http.StatusOK, minBytes: gzipMinBytes}
	gw.WriteHeader(http.StatusOK)
	first := recorder.Code
	gw.WriteHeader(http.StatusTeapot)
	if recorder.Code != first {
		t.Fatalf("second WriteHeader changed status to %d", recorder.Code)
	}
}

func TestFinalCompressSmallKnownLengthStaysIdentity(t *testing.T) {
	body := []byte(`{"message":"ok"}`)
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", "16")
		_, _ = w.Write(body)
	}))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, r)
	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("small known length was compressed: %q", got)
	}
}

func TestFinalCompressInvalidKnownLengthFallsThrough(t *testing.T) {
	body := []byte(`{"message":"ok"}`)
	handler := withCompression(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", "bogus")
		_, _ = w.Write(body)
	}))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, r)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d", recorder.Code)
	}
	if !strings.Contains(recorder.Header().Get("Vary"), "Accept-Encoding") {
		t.Error("missing Vary with invalid Content-Length")
	}
}

func TestFinalCompressFlushDecidesBufferedPrefix(t *testing.T) {
	// No Content-Length at header time: WriteHeader leaves undecided,
	// Flush must decide and pass through (small body stays identity).
	recorder := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	gw := &gzipResponseWriter{
		ResponseWriter: recorder, request: r,
		status: http.StatusOK, acceptsGzip: true, minBytes: gzipMinBytes,
	}
	gw.Header().Set("Content-Type", "application/json")
	gw.WriteHeader(http.StatusOK)
	if gw.decided {
		t.Fatal("no-length header must leave the decision to the prefix buffer")
	}
	if _, err := gw.Write([]byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}
	gw.Flush()
	if gw.decided != true {
		t.Error("Flush did not decide")
	}
	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Errorf("small flushed body was compressed: %q", got)
	}
}

func TestFinalCompressFlushCompressedBody(t *testing.T) {
	// A large buffered body compresses on Flush with a live gzip writer.
	recorder := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	gw := &gzipResponseWriter{
		ResponseWriter: recorder, request: r,
		status: http.StatusOK, acceptsGzip: true, minBytes: 8,
	}
	gw.Header().Set("Content-Type", "application/json")
	gw.WriteHeader(http.StatusOK)
	big := []byte(`{"data":"` + strings.Repeat("x", 4000) + `"}`)
	if _, err := gw.Write(big); err != nil {
		t.Fatal(err)
	}
	// Force the compressed path through decide, then Flush the gzip stream.
	if !gw.decided || !gw.compressed {
		t.Fatal("large prefix should have decided compressed")
	}
	gw.Flush()
	gw.finish()
	if got := recorder.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
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
	if !bytes.Equal(decoded, big) {
		t.Error("flushed gzip body does not round-trip")
	}
}

func TestFinalCompressFinishWithoutHeader(t *testing.T) {
	// A handler that writes nothing: finish() must emit the header.
	recorder := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	gw := &gzipResponseWriter{ResponseWriter: recorder, request: r, status: http.StatusOK}
	gw.finish()
	if recorder.Code != http.StatusOK {
		t.Fatalf("finish status = %d", recorder.Code)
	}
}

func TestFinalCompressDecideIsIdempotent(t *testing.T) {
	recorder := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	gw := &gzipResponseWriter{
		ResponseWriter: recorder, request: r,
		status: http.StatusOK, acceptsGzip: true, minBytes: gzipMinBytes,
	}
	gw.Header().Set("Content-Type", "application/json")
	gw.Write([]byte(`{"a":1}`))
	gw.decide()
	first := recorder.Code
	gw.decide() // second call returns immediately
	if recorder.Code != first {
		t.Error("second decide changed the response")
	}
}

func TestFinalAcceptsGzipIgnoresNonQParams(t *testing.T) {
	cases := []struct {
		header string
		want   bool
	}{
		{"gzip; foo=bar", true},     // non-q param ignored, q stays 1.0
		{"gzip;q=bogus", true},      // unparsable q keeps the default 1.0
		{"gzip; q=0, *;q=1", false}, // explicit zero wins over wildcard
		{"x-gzip", true},
		{"GZIP;q=0", false},
	}
	for _, tc := range cases {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Accept-Encoding", tc.header)
		if got := acceptsGzip(r); got != tc.want {
			t.Errorf("acceptsGzip(%q) = %v, want %v", tc.header, got, tc.want)
		}
	}
}

// --- amountString: the three uncovered numeric branches ---

func TestFinalAmountStringBranches(t *testing.T) {
	if got := amountString(float32(1.5)); got != "1.5" {
		t.Errorf("float32 = %q, want 1.5", got)
	}
	if got := amountString(int(42)); got != "42" {
		t.Errorf("int = %q, want 42", got)
	}
	if got := amountString(int64(-7)); got != "-7" {
		t.Errorf("int64 = %q, want -7", got)
	}
	if got := amountString(nil); got != "" {
		t.Errorf("nil = %q, want empty", got)
	}
}

// --- geocode decoders: pure, no network ---

func TestFinalDecodeOrderedTrailingCharacters(t *testing.T) {
	if _, err := decodeOrdered([]byte(`{"a":1} trailing`)); err == nil {
		t.Fatal("trailing characters were accepted")
	}
	if _, err := decodeOrdered([]byte(`   `)); err == nil {
		t.Fatal("blank input was accepted")
	}
	// Leading/trailing insignificant whitespace is fine.
	value, err := decodeOrdered([]byte(" \t\n\r{\"a\":1} \t\n\r"))
	if err != nil {
		t.Fatalf("whitespace-padded decode: %v", err)
	}
	if value == nil {
		t.Fatal("padded decode returned nil")
	}
}

func TestFinalValueLiteralAndNumberEdges(t *testing.T) {
	for _, input := range []string{``, `   `, `tru`, `fals`, `nul`, `{`, `[`, `"unterminated`, `!`} {
		if _, err := decodeOrdered([]byte(input)); err == nil {
			t.Errorf("decodeOrdered(%q) accepted garbage", input)
		}
	}
	for _, input := range []string{`true`, `false`, `null`, `0`, `-12`, `1.5`, `"hi"`, `[]`, `{}`} {
		if _, err := decodeOrdered([]byte(input)); err != nil {
			t.Errorf("decodeOrdered(%q): %v", input, err)
		}
	}
}

func TestFinalObjectErrorBranches(t *testing.T) {
	for _, input := range []string{
		`{a:1}`,         // expected key
		`{"a" 1}`,       // expected colon
		`{"a":1`,        // unterminated object
		`{"a":1;}`,      // expected comma
		`{"a":}`,        // value error inside object
		`{"a":1,}`,      // trailing comma then close
		`{"ab\uz":1}`,   // bad escape inside the key
		`{"a":1 "b":2}`, // missing comma
	} {
		if _, err := decodeOrdered([]byte(input)); err == nil {
			t.Errorf("object %q accepted", input)
		}
	}
	// Empty and nested objects decode.
	if _, err := decodeOrdered([]byte(`{"a":{"b":[1,{"c":null}]}}`)); err != nil {
		t.Fatalf("nested object: %v", err)
	}
}

func TestFinalArrayErrorBranches(t *testing.T) {
	for _, input := range []string{
		`[1,`,   // unterminated array
		`[1`,    // unterminated after value
		`[1 `,   // trailing space, still unterminated
		`[1;2]`, // expected comma
		`[,]`,   // value error on comma
		`[1 2]`, // missing comma
		`[tru]`, // bad literal inside array
		`["x`,   // unterminated string inside array
	} {
		if _, err := decodeOrdered([]byte(input)); err == nil {
			t.Errorf("array %q accepted", input)
		}
	}
	for _, input := range []string{`[]`, `[1,2]`, `[1,"x",null,true]`, `[[],[{}]]`} {
		if _, err := decodeOrdered([]byte(input)); err != nil {
			t.Errorf("array %q: %v", input, err)
		}
	}
}

func TestFinalTextEscapeBranches(t *testing.T) {
	// Every short escape plus \/ folding and \uXXXX.
	value, err := decodeOrdered([]byte(`{"e":"a\/b\\c\"d\be\fe\nf\rg\th"}`))
	if err != nil {
		t.Fatalf("escapes: %v", err)
	}
	if value == nil {
		t.Fatal("escapes decoded to nil")
	}
	if _, err := decodeOrdered([]byte(`{"u":"caf\u00e9"}`)); err != nil {
		t.Fatalf("unicode escape: %v", err)
	}
	for _, input := range []string{
		`"unterminated`,
		`"bad\`,
		`"bad\uz"`,
		`"short\u12"`,
		`"badunicode\uZZZZ"`,
		`"bad\x"`,
	} {
		parser := &jsonParser{input: []byte(input)}
		if _, err := parser.text(); err == nil {
			t.Errorf("text %q accepted", input)
		}
	}
}

func TestFinalUnquoteJSONBranches(t *testing.T) {
	cases := map[string]string{
		`\/`:     "/",
		`\\`:     `\`,
		`\"`:     `"`,
		`\b`:     "\b",
		`\f`:     "\f",
		`\n`:     "\n",
		`\r`:     "\r",
		`\t`:     "\t",
		`\u00e9`: "é",
		`\u0041`: "A",
	}
	for in, want := range cases {
		got, err := unquoteJSON([]byte(in))
		if err != nil {
			t.Errorf("unquoteJSON(%q): %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("unquoteJSON(%q) = %q, want %q", in, got, want)
		}
	}
	for _, in := range []string{`\x`, `\q`, `\uZZZZ`, `\u12`, ``, `\`} {
		if _, err := unquoteJSON([]byte(in)); err == nil {
			t.Errorf("unquoteJSON(%q) accepted garbage", in)
		}
	}
}

func TestFinalNumberAndIntLiteralBranches(t *testing.T) {
	if _, err := decodeOrdered([]byte(`1e`)); err == nil {
		t.Error("number 1e was accepted")
	}
	if _, err := decodeOrdered([]byte(`--5`)); err == nil {
		t.Error("number --5 was accepted")
	}
	// Integer literals stay ints; exponents and fractions stay floats.
	if value, err := decodeOrdered([]byte(`42`)); err != nil {
		t.Fatal(err)
	} else if _, ok := value.(int64); !ok {
		t.Errorf("42 decoded as %T, want int64", value)
	}
	if value, err := decodeOrdered([]byte(`-7`)); err != nil {
		t.Fatal(err)
	} else if value != int64(-7) {
		t.Errorf("-7 = %v", value)
	}
	if value, err := decodeOrdered([]byte(`1.5`)); err != nil {
		t.Fatal(err)
	} else if value != 1.5 {
		t.Errorf("1.5 = %v", value)
	}

	for in, want := range map[string]bool{
		"": false, "-": false, "12a": false, "1.5": false, "1e3": false,
		"12": true, "-12": true, "0": true, "-0": true,
	} {
		if got := isIntLiteral(in); got != want {
			t.Errorf("isIntLiteral(%q) = %v, want %v", in, got, want)
		}
	}
}
