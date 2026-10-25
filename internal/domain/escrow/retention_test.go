package escrow

import (
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

func minor(units int64) money.Money {
	return money.New(units, money.DefaultCurrency)
}

// TestSplitRetentionAtFivePercent is MONEY.md I20: retention + net == gross.
func TestSplitRetentionAtFivePercent(t *testing.T) {
	// Rp 1 000 000.00 => retention Rp 50 000.00, net Rp 950 000.00.
	gross := money.MustOf("1000000", money.DefaultCurrency)

	split, err := SplitRetention(gross, "5")
	if err != nil {
		t.Fatal(err)
	}

	if split.Retention.Int() != 5_000_000 {
		t.Fatalf("retention = %s, want 50000.00", split.Retention.Decimal())
	}

	if split.Net.Int() != 95_000_000 {
		t.Fatalf("net = %s, want 950000.00", split.Net.Decimal())
	}

	assertSplitSumsToGross(t, split, gross)
}

// TestSplitRetentionPutsTheRemainderOnTheNet is MONEY.md I21.
//
// 5 % of Rp 1 000 000.03 is Rp 50 000.0015. The retained part truncates to
// Rp 50 000.00 and the NET takes the 0.15 sen — the rounding error is never
// rounded away, because that would break retention + net == gross.
func TestSplitRetentionPutsTheRemainderOnTheNet(t *testing.T) {
	gross := minor(100_000_003)

	split, err := SplitRetention(gross, "5")
	if err != nil {
		t.Fatal(err)
	}

	if split.Retention.Int() != 5_000_000 {
		t.Fatalf("retention = %d, want 5000000", split.Retention.Int())
	}

	if split.Net.Int() != 95_000_003 {
		t.Fatalf("net = %d, want 95000003", split.Net.Int())
	}

	assertSplitSumsToGross(t, split, gross)
}

// TestSplitRetentionTruncatesRatherThanRounds is the difference between the
// port and the obvious implementation.
//
// Rp 10.19 at 5 % is 0.5095 sen past the truncation point: truncation keeps
// 50 minor units, rounding would take 51. The legacy code divides with
// `intdiv`, so 50 is the answer that reconciles.
func TestSplitRetentionTruncatesRatherThanRounds(t *testing.T) {
	gross := minor(1019)

	split, err := SplitRetention(gross, "5")
	if err != nil {
		t.Fatal(err)
	}

	if split.Retention.Int() != 50 {
		t.Fatalf("retention = %d, want 50 (rounding would give 51)", split.Retention.Int())
	}

	assertSplitSumsToGross(t, split, gross)
}

func TestSplitRetentionAtAHalfPercentPoint(t *testing.T) {
	// 2.5 % is 250 basis points.
	gross := minor(100_000_000)

	split, err := SplitRetention(gross, "2.5")
	if err != nil {
		t.Fatal(err)
	}

	if split.Retention.Int() != 2_500_000 {
		t.Fatalf("retention = %d, want 2500000", split.Retention.Int())
	}

	assertSplitSumsToGross(t, split, gross)
}

func TestSplitRetentionRoundsThePercentageToBasisPoints(t *testing.T) {
	// 5.555 % rounds half away from zero to 556 basis points (5.56 %).
	gross := minor(1_000_000)

	split, err := SplitRetention(gross, "5.555")
	if err != nil {
		t.Fatal(err)
	}

	// 1 000 000 * 556 / 10000 = 55 600.
	if split.Retention.Int() != 55_600 {
		t.Fatalf("retention = %d, want 55600", split.Retention.Int())
	}
}

func TestZeroPercentageDoesNotRetain(t *testing.T) {
	gross := money.MustOf("1000000", money.DefaultCurrency)

	split, err := SplitRetention(gross, "0")
	if err != nil {
		t.Fatal(err)
	}

	if !split.Retention.IsZero() {
		t.Fatalf("retention = %s, want zero", split.Retention.Decimal())
	}

	if split.Net.Int() != gross.Int() {
		t.Fatal("the net is not the gross")
	}
}

func TestANegativePercentageIsClampedToNoRetention(t *testing.T) {
	gross := money.MustOf("1000000", money.DefaultCurrency)

	split, err := SplitRetention(gross, "-5")
	if err != nil {
		t.Fatal(err)
	}

	if !split.Retention.IsZero() {
		t.Fatalf("retention = %s, want zero", split.Retention.Decimal())
	}
}

func TestANonPositiveGrossIsNeverRetained(t *testing.T) {
	for _, units := range []int64{0, -1_000_000} {
		split, err := SplitRetention(minor(units), "5")
		if err != nil {
			t.Fatal(err)
		}

		if !split.Retention.IsZero() {
			t.Errorf("gross %d: retention = %s, want zero", units, split.Retention.Decimal())
		}

		if split.Net.Int() != units {
			t.Errorf("gross %d: net = %d, want %d", units, split.Net.Int(), units)
		}
	}
}

// TestForTerminReadsThePersistedSplit is MONEY.md I22.
func TestForTerminReadsThePersistedSplit(t *testing.T) {
	split, err := ForTermin(minor(100_000_000), minor(95_000_000), minor(5_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if split.Net.Int() != 95_000_000 || split.Retention.Int() != 5_000_000 {
		t.Fatalf("split = %d / %d, want 95000000 / 5000000", split.Net.Int(), split.Retention.Int())
	}
}

// TestForTerminLegacyRowsPayTheGross is MONEY.md I23.
func TestForTerminLegacyRowsPayTheGross(t *testing.T) {
	split, err := ForTermin(minor(100_000_000), minor(0), minor(0))
	if err != nil {
		t.Fatal(err)
	}

	if split.Net.Int() != 100_000_000 {
		t.Fatalf("net = %d, want the gross", split.Net.Int())
	}

	if !split.Retention.IsZero() {
		t.Fatal("a legacy row retained something")
	}
}

// TestForTerminHoldsBackAHalfWrittenSplit is MONEY.md I24 — the row that had no
// test in the legacy suite.
func TestForTerminHoldsBackAHalfWrittenSplit(t *testing.T) {
	split, err := ForTermin(minor(100_000_000), minor(0), minor(5_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if split.Retention.Int() != 5_000_000 {
		t.Fatalf("retention = %d, want 5000000 (the recorded retention is held back)", split.Retention.Int())
	}

	if split.Net.Int() != 95_000_000 {
		t.Fatalf("net = %d, want 95000000", split.Net.Int())
	}
}

func TestForTerminRefusesMismatchedCurrencies(t *testing.T) {
	_, err := ForTermin(
		money.MustOf("100", "IDR"),
		money.MustOf("0", "USD"),
		money.MustOf("5", "IDR"),
	)
	if err == nil {
		t.Fatal("a split across two currencies was accepted")
	}
}

func TestBasisPointsParsing(t *testing.T) {
	cases := map[string]int64{
		"":        0,
		"0":       0,
		"5":       500,
		"5.5":     550,
		"5.555":   556,
		"5.554":   555,
		"0.25":    25,
		"100":     10000,
		"-2.5":    -250,
		"  7.75 ": 775,
	}

	for input, want := range cases {
		got, err := basisPoints(input)
		if err != nil {
			t.Errorf("basisPoints(%q) returned %v", input, err)
			continue
		}

		if got != want {
			t.Errorf("basisPoints(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestBasisPointsRefusesGarbage(t *testing.T) {
	for _, input := range []string{"five", "5%", "5,5", "1.2.3", "--5"} {
		if _, err := basisPoints(input); err == nil {
			t.Errorf("basisPoints(%q) accepted garbage", input)
		}
	}
}

func assertSplitSumsToGross(t *testing.T, split Split, gross money.Money) {
	t.Helper()

	sum, err := split.Retention.Add(split.Net)
	if err != nil {
		t.Fatal(err)
	}

	if sum.Int() != gross.Int() {
		t.Fatalf("retention + net = %d, want the gross %d — the split lost a sen",
			sum.Int(), gross.Int())
	}
}
