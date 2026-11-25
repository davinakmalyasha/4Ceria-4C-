package money

import (
	"errors"
	"math"
	"testing"
)

// Edge cases for the zero-coverage helpers: OfMinor, String, Subtract, Abs,
// the four ordered comparisons, and the thin branches of FromColumn,
// WithCurrency, scaleFor and toBasisPoints. All arithmetic stays in integer
// minor units; no floats enter the ledger.

func TestOfMinorBuildsFromMinorUnits(t *testing.T) {
	cases := []struct {
		name     string
		minor    int64
		currency string
		wantInt  int64
		wantCur  string
	}{
		{"zero IDR", 0, "IDR", 0, "IDR"},
		{"positive", 1500000050, "IDR", 1500000050, "IDR"},
		{"negative refund direction", -500, "IDR", -500, "IDR"},
		{"normalises currency", 100, " idr ", 100, "IDR"},
		{"zero-scale JPY keeps units", 1500, "JPY", 1500, "JPY"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := OfMinor(tc.minor, tc.currency)
			if got.Int() != tc.wantInt {
				t.Fatalf("Int() = %d, want %d", got.Int(), tc.wantInt)
			}
			if got.Currency() != tc.wantCur {
				t.Fatalf("Currency() = %q, want %q", got.Currency(), tc.wantCur)
			}
		})
	}
}

func TestStringMatchesDecimal(t *testing.T) {
	for _, input := range []string{"0.00", "15000000.50", "-15000000.50", "0.01", "-0.01"} {
		value := mustOf(t, input)
		if value.String() != value.Decimal() {
			t.Fatalf("String() = %q, Decimal() = %q", value.String(), value.Decimal())
		}
	}
	if got := New(1500, "JPY").String(); got != "1500" {
		t.Fatalf("JPY String() = %q, want 1500", got)
	}
}

func TestSubtractEdgeCases(t *testing.T) {
	cases := []struct {
		name string
		a    string
		b    string
		want int64
	}{
		{"exact", "100.00", "40.00", 6000},
		{"zero minus zero", "0.00", "0.00", 0},
		{"negative result", "10.00", "25.50", -1550},
		{"subtract negative refunds back", "10.00", "-5.00", 1500},
		{"sen precision", "0.03", "0.01", 2},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := mustOf(t, tc.a).Subtract(mustOf(t, tc.b))
			if err != nil {
				t.Fatal(err)
			}
			if got.Int() != tc.want {
				t.Fatalf("%s - %s = %d, want %d", tc.a, tc.b, got.Int(), tc.want)
			}
		})
	}
}

func TestSubtractRefusesMixedCurrencies(t *testing.T) {
	if _, err := mustOf(t, "100").Subtract(New(100, "USD")); !errors.Is(err, ErrCurrencyMismatch) {
		t.Fatalf("Subtract across currencies = %v, want ErrCurrencyMismatch", err)
	}
}

func TestAbsKeepsSignSymmetric(t *testing.T) {
	positive := New(1500000050, DefaultCurrency)
	if got := positive.Abs(); got.Int() != positive.Int() {
		t.Fatalf("Abs of positive changed %d to %d", positive.Int(), got.Int())
	}
	negative := New(-1500000050, DefaultCurrency)
	if got := negative.Abs(); got.Int() != 1500000050 {
		t.Fatalf("Abs(-1500000050) = %d, want 1500000050", got.Int())
	}
	if got := Zero(DefaultCurrency).Abs(); !got.IsZero() {
		t.Fatalf("Abs(0) = %d, want 0", got.Int())
	}
}

func TestCompareTable(t *testing.T) {
	ten := New(10, DefaultCurrency)
	twenty := New(20, DefaultCurrency)

	cases := []struct {
		name string
		a, b Money
		want int
	}{
		{"less", ten, twenty, -1},
		{"equal", ten, New(10, DefaultCurrency), 0},
		{"greater", twenty, ten, 1},
		{"negative less than zero", New(-1, DefaultCurrency), Zero(DefaultCurrency), -1},
		{"zero equals zero", Zero(DefaultCurrency), Zero(DefaultCurrency), 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.a.Compare(tc.b)
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Fatalf("Compare = %d, want %d", got, tc.want)
			}
		})
	}

	if _, err := ten.Compare(New(10, "USD")); !errors.Is(err, ErrCurrencyMismatch) {
		t.Fatalf("Compare across currencies = %v", err)
	}
}

func TestOrderedComparisons(t *testing.T) {
	ten := New(10, DefaultCurrency)
	twenty := New(20, DefaultCurrency)
	tenAgain := New(10, DefaultCurrency)

	// IsGreaterThan / IsGreaterThanOrEqual
	if ok, _ := twenty.IsGreaterThan(ten); !ok {
		t.Fatal("20 > 10 must hold")
	}
	if ok, _ := ten.IsGreaterThan(twenty); ok {
		t.Fatal("10 > 20 must not hold")
	}
	if ok, _ := ten.IsGreaterThan(tenAgain); ok {
		t.Fatal("10 > 10 must not hold")
	}
	if ok, _ := twenty.IsGreaterThanOrEqual(ten); !ok {
		t.Fatal("20 >= 10 must hold")
	}
	if ok, _ := ten.IsGreaterThanOrEqual(tenAgain); !ok {
		t.Fatal("10 >= 10 must hold")
	}
	if ok, _ := ten.IsGreaterThanOrEqual(twenty); ok {
		t.Fatal("10 >= 20 must not hold")
	}

	// IsLessThan / IsLessThanOrEqual
	if ok, _ := ten.IsLessThan(twenty); !ok {
		t.Fatal("10 < 20 must hold")
	}
	if ok, _ := twenty.IsLessThan(ten); ok {
		t.Fatal("20 < 10 must not hold")
	}
	if ok, _ := ten.IsLessThan(tenAgain); ok {
		t.Fatal("10 < 10 must not hold")
	}
	if ok, _ := ten.IsLessThanOrEqual(tenAgain); !ok {
		t.Fatal("10 <= 10 must hold")
	}
	if ok, _ := twenty.IsLessThanOrEqual(ten); ok {
		t.Fatal("20 <= 10 must not hold")
	}

	// Currency mismatch propagates through every ordered comparison.
	for _, fn := range []func() (bool, error){
		func() (bool, error) { return ten.IsGreaterThan(New(1, "USD")) },
		func() (bool, error) { return ten.IsGreaterThanOrEqual(New(1, "USD")) },
		func() (bool, error) { return ten.IsLessThan(New(1, "USD")) },
		func() (bool, error) { return ten.IsLessThanOrEqual(New(1, "USD")) },
		func() (bool, error) { return ten.Equals(New(1, "USD")) },
	} {
		if _, err := fn(); !errors.Is(err, ErrCurrencyMismatch) {
			t.Fatalf("cross-currency comparison = %v, want ErrCurrencyMismatch", err)
		}
	}
}

func TestFromColumnCoversEveryColumnShape(t *testing.T) {
	// Money passthrough.
	passthrough := New(1234, DefaultCurrency)
	if got, err := FromColumn(passthrough, DefaultCurrency); err != nil || got.Int() != 1234 {
		t.Fatalf("Money passthrough = (%d, %v)", got.Int(), err)
	}

	// Whitespace-only string is zero, like an empty column.
	for _, input := range []string{"", "   ", "\t "} {
		got, err := FromColumn(input, DefaultCurrency)
		if err != nil {
			t.Fatalf("FromColumn(%q) = %v", input, err)
		}
		if !got.IsZero() {
			t.Fatalf("FromColumn(%q) = %d, want zero", input, got.Int())
		}
	}

	// Integer shapes.
	if got, err := FromColumn(int(15000000), DefaultCurrency); err != nil || got.Int() != 1500000000 {
		t.Fatalf("int column = (%d, %v)", got.Int(), err)
	}
	if got, err := FromColumn(int32(-5), DefaultCurrency); err != nil || got.Int() != -500 {
		t.Fatalf("int32 column = (%d, %v)", got.Int(), err)
	}
	if got, err := FromColumn(int64(7), DefaultCurrency); err != nil || got.Int() != 700 {
		t.Fatalf("int64 column = (%d, %v)", got.Int(), err)
	}

	// Float shapes mirror the stored text exactly at two decimals.
	if got, err := FromColumn(float64(15000000.50), DefaultCurrency); err != nil || got.Int() != 1500000050 {
		t.Fatalf("float64 column = (%d, %v)", got.Int(), err)
	}
	if got, err := FromColumn(float32(1.5), DefaultCurrency); err != nil || got.Int() != 150 {
		t.Fatalf("float32 column = (%d, %v)", got.Int(), err)
	}

	// Unsupported column type refuses loudly, never as zero.
	if _, err := FromColumn(true, DefaultCurrency); !errors.Is(err, ErrInvalidAmount) {
		t.Fatalf("bool column = %v, want ErrInvalidAmount", err)
	}
	if _, err := FromColumn([]byte("100"), DefaultCurrency); !errors.Is(err, ErrInvalidAmount) {
		t.Fatalf("[]byte column = %v, want ErrInvalidAmount", err)
	}

	// Invalid text still refuses.
	if _, err := FromColumn("abc", DefaultCurrency); !errors.Is(err, ErrInvalidAmount) {
		t.Fatalf("bad text = %v, want ErrInvalidAmount", err)
	}
}

func TestWithCurrency(t *testing.T) {
	value := mustOf(t, "100.00")
	same, err := value.WithCurrency("idr")
	if err != nil {
		t.Fatal(err)
	}
	if same.Int() != value.Int() || same.Currency() != "IDR" {
		t.Fatalf("same-currency WithCurrency = %+v", same)
	}

	if _, err := value.WithCurrency("USD"); !errors.Is(err, ErrCurrencyMismatch) {
		t.Fatalf("cross-currency WithCurrency = %v, want ErrCurrencyMismatch", err)
	}
}

func TestZeroScaleCurrencyStaysInteger(t *testing.T) {
	// JPY/VND/KRW carry no fraction: Of truncates, Decimal has no dot.
	for _, currency := range []string{"JPY", "KRW", "VND"} {
		value, err := Of("1500.99", currency)
		if err != nil {
			t.Fatalf("Of JPY-style (%s) = %v", currency, err)
		}
		if value.Int() != 1500 {
			t.Fatalf("%s Int() = %d, want 1500", currency, value.Int())
		}
		if value.Decimal() != "1500" {
			t.Fatalf("%s Decimal() = %q", currency, value.Decimal())
		}
	}

	// Unknown currency falls back to Scale (2).
	value, err := Of("10.50", "XXX")
	if err != nil {
		t.Fatal(err)
	}
	if value.Int() != 1050 || value.Decimal() != "10.50" {
		t.Fatalf("unknown currency = (%d, %q)", value.Int(), value.Decimal())
	}
}

func TestPercentageEdgeCases(t *testing.T) {
	value := mustOf(t, "100.00")

	// Zero and negative percentages.
	zero, err := value.Percentage("0")
	if err != nil {
		t.Fatal(err)
	}
	if !zero.IsZero() {
		t.Fatalf("0%% of 100 = %d, want 0", zero.Int())
	}

	negative, err := value.Percentage("-5")
	if err != nil {
		t.Fatal(err)
	}
	if negative.Int() != -500 {
		t.Fatalf("-5%% of 100 = %d, want -500", negative.Int())
	}

	// Comma decimal mark is accepted for percentages (config values).
	comma, err := value.Percentage("11,5")
	if err != nil {
		t.Fatal(err)
	}
	if comma.Int() != 1150 {
		t.Fatalf("11,5%% of 100 = %d, want 1150", comma.Int())
	}

	// Sign-prefixed and empty-fraction forms.
	for input, want := range map[string]int64{"+5": 500, ".5": 50, "5.": 500} {
		got, err := value.Percentage(input)
		if err != nil {
			t.Fatalf("Percentage(%q) = %v", input, err)
		}
		if got.Int() != want {
			t.Fatalf("Percentage(%q) = %d, want %d", input, got.Int(), want)
		}
	}

	// Empty percentage refuses (no silent zero rate).
	if _, err := value.Percentage(""); !errors.Is(err, ErrInvalidPercentage) {
		t.Fatalf("empty percentage = %v, want ErrInvalidPercentage", err)
	}
	if _, err := value.Percentage("  "); !errors.Is(err, ErrInvalidPercentage) {
		t.Fatalf("blank percentage = %v, want ErrInvalidPercentage", err)
	}
}

func TestMustOfPanicsOnLiteral(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("MustOf(invalid) did not panic")
		}
	}()
	MustOf("not-a-number", DefaultCurrency)
}

func TestOverflowBoundaries(t *testing.T) {
	maxMinor := int64(math.MaxInt64)

	// The largest representable amount formats and round-trips.
	huge := New(maxMinor, DefaultCurrency)
	if _, err := Of(huge.Decimal(), DefaultCurrency); err != nil {
		t.Fatalf("max int64 did not round-trip: %v", err)
	}

	// Anything beyond int64 from a decimal refuses instead of wrapping.
	if _, err := Of("92233720368547758.09", DefaultCurrency); !errors.Is(err, ErrInvalidAmount) {
		t.Fatalf("beyond-int64 decimal = %v, want ErrInvalidAmount", err)
	}

	// MultiplyBy at the ceiling overflows loudly.
	if _, err := huge.MultiplyBy(2); !errors.Is(err, ErrAmountOverflow) {
		t.Fatalf("huge * 2 = %v, want ErrAmountOverflow", err)
	}
}
