package escrow

import (
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// TestTheFeeIsOffByDefault is MONEY.md I34.
//
// It is not an implementation detail: the product copy tells the client the
// platform charges nothing today, and the copy must stay literally true.
func TestTheFeeIsOffByDefault(t *testing.T) {
	service := NewService(&memoryStore{})

	if service.feePercent != "0" {
		t.Fatalf("the default fee percentage is %q, want 0", service.feePercent)
	}

	fee, err := FeeOn(money.MustOf("40000000", money.DefaultCurrency), "0")
	if err != nil {
		t.Fatal(err)
	}

	if !fee.IsZero() {
		t.Fatalf("fee = %s, want zero", fee.Decimal())
	}
}

func TestFeeOnOnePercent(t *testing.T) {
	// Rp 40 000 000.00 at 1 % => Rp 400 000.00.
	fee, err := FeeOn(money.MustOf("40000000", money.DefaultCurrency), "1")
	if err != nil {
		t.Fatal(err)
	}

	if fee.Int() != 40_000_000 {
		t.Fatalf("fee = %s, want 400000.00", fee.Decimal())
	}
}

func TestFeeOnTruncates(t *testing.T) {
	// 100 000 001 minor units at 1 % = 1 000 000.01 => truncated to 1 000 000.
	fee, err := FeeOn(minor(100_000_001), "1")
	if err != nil {
		t.Fatal(err)
	}

	if fee.Int() != 1_000_000 {
		t.Fatalf("fee = %d, want 1000000", fee.Int())
	}
}

// TestTheFeeIsClamped is MONEY.md I35.
func TestTheFeeIsClamped(t *testing.T) {
	gross := money.MustOf("1000000", money.DefaultCurrency)

	over, err := FeeOn(gross, "150")
	if err != nil {
		t.Fatal(err)
	}

	if over.Int() != gross.Int() {
		t.Fatalf("a 150 %% fee is %s, want the gross (%s)", over.Decimal(), gross.Decimal())
	}

	under, err := FeeOn(gross, "-5")
	if err != nil {
		t.Fatal(err)
	}

	if !under.IsZero() {
		t.Fatalf("a negative fee is %s, want zero", under.Decimal())
	}
}

func TestFeeOnANonPositiveGrossIsZero(t *testing.T) {
	for _, units := range []int64{0, -1000} {
		fee, err := FeeOn(minor(units), "1")
		if err != nil {
			t.Fatal(err)
		}

		if !fee.IsZero() {
			t.Errorf("gross %d: fee = %d, want zero", units, fee.Int())
		}
	}
}

// TestFeeTitleMatchesTheLegacyFormat pins the human string in the ledger.
//
// The legacy code formats the percentage with `number_format($p, 2, ',', '.')`
// and then strips the trailing zeros, which yields an Indonesian decimal comma.
// The ledger is audited by humans, so the port keeps the string.
func TestFeeTitleMatchesTheLegacyFormat(t *testing.T) {
	cases := map[string]string{
		"0":     "0",
		"1":     "1",
		"1.5":   "1,5",
		"0.25":  "0,25",
		"1.05":  "1,05",
		"10.10": "10,1",
		"100":   "100",
	}

	for percent, want := range cases {
		title := FeeTitle(percent, "Architect base fee")
		wantTitle := "Platform fee (" + want + "%): Architect base fee"

		if title != wantTitle {
			t.Errorf("FeeTitle(%q) = %q, want %q", percent, title, wantTitle)
		}
	}
}
