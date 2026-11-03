package httpapi

import (
	"os"
	"testing"
	"time"
)

// Functional proof for the "perfect" pass: pure helpers that back the
// push/S3/mail/limiter work. DB-gated tests live in perfect_db_test.go and
// skip without DATABASE_URL.

func TestPushJSONStringEscapes(t *testing.T) {
	got := pushJSONString("a\"b\\c\n")
	want := `"a\"b\\c\n"`
	if got != want {
		t.Fatalf("pushJSONString = %s, want %s", got, want)
	}
}

func TestStorageHMACRoundTrip(t *testing.T) {
	rel := "disputes/1/evidence.pdf"
	exp := time.Now().Add(15 * time.Minute).Unix()
	sig := signStorageURL(rel, exp)
	if !verifyStorageURL(rel, exp, sig) {
		t.Fatal("fresh HMAC did not verify")
	}
	if verifyStorageURL(rel, exp, sig+"0") {
		t.Fatal("tampered HMAC verified")
	}
	if verifyStorageURL(rel, time.Now().Add(-time.Minute).Unix(), signStorageURL(rel, time.Now().Add(-time.Minute).Unix())) {
		t.Fatal("expired HMAC verified")
	}
}

func TestColumnsAreEnumerated(t *testing.T) {
	if bidsColumns == "" || projectsRowColumns == "" || usersRowColumns == "" {
		t.Fatal("column constants must not be empty")
	}
	for _, c := range []string{bidsColumns, projectsRowColumns, terminsColumns, addendumsColumns, materialOrdersColumns} {
		if len(c) < 10 || !containsComma(c) {
			t.Fatalf("column constant looks wrong: %q", c)
		}
	}
	if got := profileRowColumns("arsiteks"); got == "*" || got == "" {
		t.Fatalf("profileRowColumns(arsiteks) = %q", got)
	}
	if got := ratingsRowColumns("arsitek_id"); got == "" {
		t.Fatal("ratingsRowColumns empty")
	}
}

func containsComma(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			return true
		}
	}
	return false
}

func TestMailHTMLWraps(t *testing.T) {
	html := mailHTML("Receipt", []string{"a", "b"})
	if len(html) < 20 {
		t.Fatal("mailHTML too short")
	}
}

func TestNumericMinorExact(t *testing.T) {
	if v, ok := numericMinor("99999999999999"); !ok || v != 99999999999999*100 {
		t.Fatalf("numericMinor max = %d,%v", v, ok)
	}
	if v, ok := numericMinor("1e3"); !ok || v != 1000*100 {
		t.Fatalf("numericMinor exponent = %d,%v", v, ok)
	}
	if _, ok := numericMinor("not-a-number"); ok {
		t.Fatal("numericMinor accepted garbage")
	}
}

func TestS3EnvGate(t *testing.T) {
	// Without creds the SDK path must report unconfigured, never unsigned.
	os.Unsetenv("S3_ENDPOINT")
	if s3Configured() {
		t.Fatal("s3Configured with empty env")
	}
}
