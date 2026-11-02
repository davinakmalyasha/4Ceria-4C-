package httpapi

import "testing"

// TestParseMinorMirrorsMoneyOf pins the exact minor-unit parsing: canonical
// decimals, truncation (never rounding) beyond two places, no thousands
// separators — `Money::normaliseDecimal` at scale 2.
func TestParseMinorMirrorsMoneyOf(t *testing.T) {
	cases := []struct {
		in    string
		want  int64
		valid bool
	}{
		{"0", 0, true},
		{"1", 100, true},
		{"4000000", 400000000, true},
		{"10000000.00", 1000000000, true},
		{"2500000.50", 250000050, true},
		{"0.01", 1, true},
		{"0.1", 10, true},
		{"  12.50  ", 1250, true},
		{"+7", 700, true},
		{"-3.25", -325, true},
		// Truncated, never rounded: 1.999 reads as 1.99.
		{"1.999", 199, true},
		{"0.009", 0, true},
		// Stripped, like the PHP regex input: separators vanish first.
		{"1,000", 0, false},
		{"1_000", 100000, true},
		{"1 000", 100000, true},
		{"abc", 0, false},
		{"", 0, false},
		{"12.34.56", 0, false},
		{".5", 0, false},
		{"12.", 1200, true},
	}

	for _, item := range cases {
		got, ok := parseMinor(item.in)
		if ok != item.valid || (ok && got != item.want) {
			t.Errorf("parseMinor(%q) = (%d, %v), want (%d, %v)", item.in, got, ok, item.want, item.valid)
		}
	}
}

// TestFormatMinorMirrorsToDecimal pins the ledger rendering: always two
// places, sign first.
func TestFormatMinorMirrorsToDecimal(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0.00"},
		{1, "0.01"},
		{100, "1.00"},
		{400000000, "4000000.00"},
		{1000000000, "10000000.00"},
		{-50025, "-500.25"},
		{-400000000, "-4000000.00"},
	}

	for _, item := range cases {
		if got := formatMinor(item.in); got != item.want {
			t.Errorf("formatMinor(%d) = %q, want %q", item.in, got, item.want)
		}
		if minor, ok := parseMinor(formatMinor(item.in)); !ok || minor != item.in {
			t.Errorf("round trip failed for %d: parseMinor(formatMinor()) = (%d, %v)", item.in, minor, ok)
		}
	}
}

// TestAmountStringRendersJSONNumbers pins the validation input: a JSON
// number renders canonically, so `4000000` and `"4000000"` parse to the
// same minor units Laravel's `numeric` rule compares.
func TestAmountStringRendersJSONNumbers(t *testing.T) {
	if got := amountString(float64(4000000)); got != "4000000" {
		t.Errorf("amountString(4000000.0) = %q", got)
	}
	if got := amountString("12.50"); got != "12.50" {
		t.Errorf("amountString(\"12.50\") = %q", got)
	}
	if got := amountString(true); got != "" {
		t.Errorf("amountString(true) = %q, want the empty (unparseable) string", got)
	}
}
