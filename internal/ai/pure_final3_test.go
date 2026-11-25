package ai

// DB-free pure-helper closure: guard invalid-rune + word-boundary redaction,
// estimateBudget area/type/quality branches, idrText pgtype shapes.
// No *pgxpool.Pool, no network.

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestFinalSanitizeInvalidRune(t *testing.T) {
	if got := SanitizeInput("a\xffb c"); got != "a�b c" && got != "ab c" {
		// Invalid UTF-8 is skipped (RuneError continue); exact replacement
		// depends on the range loop decoding, so accept either cleaned form.
		t.Fatalf("sanitize invalid rune = %q", got)
	}
	if got := SanitizeInput("a\x00b"); got != "ab" {
		t.Fatalf("control strip = %q", got)
	}
}

func TestFinalRedactWordBoundary(t *testing.T) {
	// "sk-" inside a word is not a credential; the later standalone one is.
	got := RedactOutput("asksk-111 sk-2222222222222222 done")
	if strings.Contains(got, "sk-2222222222222222") {
		t.Fatalf("standalone token was not redacted: %q", got)
	}
	if !strings.Contains(got, "asksk-111") {
		t.Fatalf("in-word prefix was mangled: %q", got)
	}
	if got := RedactOutput("nothing secret here"); got != "nothing secret here" {
		t.Fatalf("clean text changed: %q", got)
	}
}

func TestFinalEstimateBudgetBranches(t *testing.T) {
	// Non-positive area defaults to 100 m2.
	d := estimateBudget(EstimateArgs{ProjectType: "new_build", AreaM2: 0})
	if d.LowIDR == "" || d.HighIDR == "" {
		t.Fatal("default area produced no range")
	}
	// Unknown type falls back to the new_build base.
	u := estimateBudget(EstimateArgs{ProjectType: "castle", AreaM2: 100})
	n := estimateBudget(EstimateArgs{ProjectType: "new_build", AreaM2: 100})
	if u.LowIDR != n.LowIDR || u.HighIDR != n.HighIDR {
		t.Fatalf("unknown type = %v, want new_build %v", u, n)
	}
	// Quality tiers move the range.
	s := estimateBudget(EstimateArgs{ProjectType: "renovation", AreaM2: 100, Quality: "standard"})
	p := estimateBudget(EstimateArgs{ProjectType: "renovation", AreaM2: 100, Quality: "premium"})
	m := estimateBudget(EstimateArgs{ProjectType: "renovation", AreaM2: 100, Quality: "middle"})
	if s.LowIDR == p.LowIDR {
		t.Fatal("standard and premium ranges match")
	}
	if m.LowIDR == "" {
		t.Fatal("middle range empty")
	}
	// Oversize area caps with a dedicated note.
	c := estimateBudget(EstimateArgs{ProjectType: "interior", AreaM2: 50000})
	if !strings.Contains(c.Note, "capped") {
		t.Fatalf("capped note missing: %q", c.Note)
	}
}

func TestFinalIdrTextPgShapes(t *testing.T) {
	if got := idrText(pgtype.Numeric{Valid: false}); got != "Rp 0" {
		t.Errorf("invalid numeric = %q", got)
	}
	num := pgtype.Numeric{Valid: true}
	_ = num.Scan("1500000.50")
	if got := idrText(num); !strings.Contains(got, "1.500.000") {
		t.Errorf("numeric = %q", got)
	}
	if got := idrText(pgtype.Int8{Int64: 5, Valid: true}); !strings.Contains(got, "5") {
		t.Errorf("int8 = %q", got)
	}
	if got := idrText(pgtype.Int8{Valid: false}); got != "Rp 0" {
		t.Errorf("invalid int8 = %q", got)
	}
	if got := idrText(pgtype.Float8{Float64: 2500000.9, Valid: true}); !strings.Contains(got, "2.500.000") {
		t.Errorf("float8 = %q", got)
	}
	if got := idrText(pgtype.Float8{Valid: false}); got != "Rp 0" {
		t.Errorf("invalid float8 = %q", got)
	}
	if got := idrText(int32(-5)); !strings.Contains(got, "5") {
		t.Errorf("int32 = %q", got)
	}
	if got := idrText(pgtype.Numeric{Valid: true}); got != "Rp 0" {
		t.Errorf("bare numeric = %q, want Rp 0", got)
	}
	if got := idrText([]int{1}); got != "Rp —" {
		t.Errorf("unknown shape = %q, want the explicit placeholder", got)
	}
}
