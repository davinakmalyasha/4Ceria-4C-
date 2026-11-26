package money

import (
	"errors"
	"testing"
)

// Closure for normaliseDecimal's remaining branches: the empty-input and
// explicit-plus paths. All expectations stay in integer minor units.
func TestCoverNormaliseDecimalEdgeInputs(t *testing.T) {
	empty, err := Of("", DefaultCurrency)
	if err != nil {
		t.Fatalf("Of(%q) = %v, want zero without an error", "", err)
	}
	if !empty.IsZero() {
		t.Fatalf("Of(%q).Int() = %d, want 0", "", empty.Int())
	}

	blank, err := Of("   ", DefaultCurrency)
	if err != nil {
		t.Fatalf("Of(%q) = %v, want zero without an error", "   ", err)
	}
	if !blank.IsZero() {
		t.Fatalf("Of(%q).Int() = %d, want 0", "   ", blank.Int())
	}

	plus, err := Of("+15000000.50", DefaultCurrency)
	if err != nil {
		t.Fatalf("Of(%q) = %v, want no error", "+15000000.50", err)
	}
	if plus.Int() != 1500000050 {
		t.Fatalf("Of(%q).Int() = %d, want 1500000050", "+15000000.50", plus.Int())
	}
}

// Closure for toBasisPoints's fraction-truncation branch: a percentage with
// more than two decimals is cut to basis points, never rounded up.
func TestCoverPercentageTruncatesExtraDecimals(t *testing.T) {
	got, err := mustOf(t, "100.00").Percentage("5.125")
	if err != nil {
		t.Fatalf("Percentage(5.125) = %v, want no error", err)
	}
	if got.Int() != 512 {
		t.Fatalf("100.00 at 5.125%% = %d minor, want 512 (5.12, truncated)", got.Int())
	}
}

// Closure for toBasisPoints's whole-overflow branch: a digit string beyond
// int64 is refused as a percentage, not wrapped.
func TestCoverPercentageRefusesOverflowingWhole(t *testing.T) {
	if _, err := mustOf(t, "100.00").Percentage("99999999999999999999999"); !errors.Is(err, ErrInvalidPercentage) {
		t.Fatalf("Percentage(huge) = %v, want ErrInvalidPercentage", err)
	}
}

// Closure for isDigits's empty-input branch.
func TestCoverIsDigits(t *testing.T) {
	cases := map[string]bool{
		"":    false,
		"0":   true,
		"007": true,
		"12a": false,
		" 5":  false,
	}

	for input, want := range cases {
		if got := isDigits(input); got != want {
			t.Errorf("isDigits(%q) = %v, want %v", input, got, want)
		}
	}
}

// NOTE (coverage): toBasisPoints's fraction-ParseInt error return is
// provably unreachable and is intentionally left uncovered. By the time
// ParseInt runs, the fraction has passed isDigits, been truncated to at most
// two characters and padded back to exactly two ASCII digits, so the parse
// cannot fail. The branch stays as defence in depth.
