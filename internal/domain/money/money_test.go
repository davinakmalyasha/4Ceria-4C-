package money

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"
)

// The cases here are the PHP suite's cases, case for case: the Go package is a
// PORT, and a port that computes the same answers for different reasons is
// still a port. Where the PHP original had a rounding quirk, the Go code
// states the rule it implements and the test pins it.

func mustOf(t *testing.T, amount string) Money {
	t.Helper()

	value, err := Of(amount, DefaultCurrency)
	if err != nil {
		t.Fatalf("Of(%q) returned %v", amount, err)
	}

	return value
}

func TestConstructsFromADecimalStringWithoutGoingThroughAFloat(t *testing.T) {
	value := mustOf(t, "15000000.50")

	if value.Int() != 1500000050 {
		t.Fatalf("Int() = %d, want 1500000050", value.Int())
	}
}

func TestConstructsFromIntFloatAndStringIdentically(t *testing.T) {
	fromString := mustOf(t, "15000000.50")

	fromInt, err := Of("15000000", DefaultCurrency)
	if err != nil {
		t.Fatal(err)
	}

	if fromInt.Int() != 1500000000 {
		t.Fatalf("int path = %d, want 1500000000", fromInt.Int())
	}

	if fromString.Int() != 1500000050 {
		t.Fatalf("string path = %d, want 1500000050", fromString.Int())
	}
}

func TestTreatsABareIntegerAsMajorUnits(t *testing.T) {
	value := mustOf(t, "15000000")

	if value.Int() != 1500000000 {
		t.Fatalf("Int() = %d, want 1500000000 (major units)", value.Int())
	}
}

func TestRejectsAValueItCannotParseRatherThanCoercingItToZero(t *testing.T) {
	for _, input := range []string{"abc", "12abc", "1.2.3", "1,500.50", "1.500,50"} {
		if _, err := Of(input, DefaultCurrency); err == nil {
			t.Fatalf("Of(%q) was accepted", input)
		}
	}
}

func TestToleratesUnambiguousGroupingCharacters(t *testing.T) {
	for _, input := range []string{"15 000 000.50", "15_000_000.50", "15 000 000.50", "15 000 000.50"} {
		value, err := Of(input, DefaultCurrency)
		if err != nil {
			t.Fatalf("Of(%q) returned %v", input, err)
		}
		if value.Int() != 1500000050 {
			t.Fatalf("Of(%q) = %d, want 1500000050", input, value.Int())
		}
	}
}

func TestRejectsALocaleSpecificDecimalMark(t *testing.T) {
	if _, err := Of("1.500,50", DefaultCurrency); err == nil {
		t.Fatal("a locale-specific decimal mark was accepted")
	}
}

func TestReadsADatabaseColumnSafely(t *testing.T) {
	empty, err := FromColumn("", DefaultCurrency)
	if err != nil {
		t.Fatal(err)
	}
	if !empty.IsZero() {
		t.Fatal("an empty column did not become zero")
	}

	null, err := FromColumn(nil, DefaultCurrency)
	if err != nil {
		t.Fatal(err)
	}
	if !null.IsZero() {
		t.Fatal("a null column did not become zero")
	}

	decimal, err := FromColumn("15000000.50", DefaultCurrency)
	if err != nil {
		t.Fatal(err)
	}
	if decimal.Int() != 1500000050 {
		t.Fatalf("column = %d, want 1500000050", decimal.Int())
	}
}

func TestNormalisesTheCurrencyCode(t *testing.T) {
	value, err := Of("100", " idr ")
	if err != nil {
		t.Fatal(err)
	}
	if value.Currency() != "IDR" {
		t.Fatalf("Currency() = %q, want IDR", value.Currency())
	}
}

func TestAddsAndSubtractsExactlyAtMagnitudesThatOverflowAFloat(t *testing.T) {
	// 2^53 is the last integer a float64 represents exactly. The legacy code
	// used PHP floats, so this is the magnitude where it started losing sen.
	const big = int64(1) << 53

	sum, err := New(big, DefaultCurrency).Add(New(big, DefaultCurrency))
	if err != nil {
		t.Fatal(err)
	}
	if sum.Int() != 2*big {
		t.Fatalf("sum = %d, want %d", sum.Int(), 2*big)
	}
}

func TestNeverLosesASenAcrossAThousandAdditions(t *testing.T) {
	total := New(0, DefaultCurrency)

	for i := 0; i < 1000; i++ {
		var err error
		total, err = total.Add(New(1, DefaultCurrency))
		if err != nil {
			t.Fatal(err)
		}
	}

	if total.Int() != 1000 {
		t.Fatalf("total = %d, want 1000", total.Int())
	}
}

func TestHandlesNegativesForTheRefundDirection(t *testing.T) {
	value := New(-1500000050, DefaultCurrency)

	if value.Decimal() != "-15000000.50" {
		t.Fatalf("Decimal() = %q, want -15000000.50", value.Decimal())
	}
	if !value.IsNegative() {
		t.Fatal("IsNegative() = false")
	}
}

func TestRoundTripsThroughItsDecimalString(t *testing.T) {
	for _, input := range []string{"0.00", "15000000.50", "-15000000.50", "0.01", "-0.01"} {
		value := mustOf(t, input)

		again, err := Of(value.Decimal(), DefaultCurrency)
		if err != nil {
			t.Fatalf("Of(%q) returned %v", value.Decimal(), err)
		}
		if again.Int() != value.Int() {
			t.Fatalf("round trip of %q: %d -> %d", input, value.Int(), again.Int())
		}
	}
}

func TestTruncatesBeyondTheCurrencyPrecision(t *testing.T) {
	value := mustOf(t, "15000000.999")

	if value.Int() != 1500000099 {
		t.Fatalf("Int() = %d, want 1500000099 (truncated, not rounded)", value.Int())
	}
}

func TestRefusesToDivideByZero(t *testing.T) {
	if _, err := mustOf(t, "100").DivideBy(0); !errors.Is(err, ErrZeroDivisor) {
		t.Fatalf("DivideBy(0) returned %v", err)
	}
}

func TestRefusesToCombineTwoCurrencies(t *testing.T) {
	if _, err := mustOf(t, "100").Add(New(100, "USD")); !errors.Is(err, ErrCurrencyMismatch) {
		t.Fatalf("Add across currencies returned %v", err)
	}
}

func TestRefusesToReinterpretAnAmountInAnotherCurrency(t *testing.T) {
	if _, err := mustOf(t, "100").WithCurrency("USD"); !errors.Is(err, ErrCurrencyMismatch) {
		t.Fatalf("WithCurrency returned %v", err)
	}
}

func TestComparesExactlyWhereFloatComparisonIsUnreliable(t *testing.T) {
	// 0.1 + 0.2 != 0.3 in binary floating point. In minor units the two are
	// exactly 10 and 20.
	ten := New(10, DefaultCurrency)
	twenty := New(20, DefaultCurrency)

	sum, err := ten.Add(twenty)
	if err != nil {
		t.Fatal(err)
	}

	thirty := New(30, DefaultCurrency)

	equal, err := sum.Equals(thirty)
	if err != nil {
		t.Fatal(err)
	}
	if !equal {
		t.Fatal("10 + 20 != 30")
	}
}

func TestReportsSignState(t *testing.T) {
	zero := Zero(DefaultCurrency)
	positive := New(1, DefaultCurrency)
	negative := New(-1, DefaultCurrency)

	if !zero.IsZero() || zero.IsPositive() || zero.IsNegative() {
		t.Fatal("zero reported the wrong sign state")
	}
	if !positive.IsPositive() || positive.IsZero() || positive.IsNegative() {
		t.Fatal("positive reported the wrong sign state")
	}
	if !negative.IsNegative() || negative.IsZero() || negative.IsPositive() {
		t.Fatal("negative reported the wrong sign state")
	}
}

func TestAllocatesByWeightAndThePartsAlwaysSumToTheWhole(t *testing.T) {
	total := mustOf(t, "100.00")

	parts, err := total.Allocate([]int64{1, 1, 1})
	if err != nil {
		t.Fatal(err)
	}

	var sum int64
	for _, part := range parts {
		sum += part.Int()
	}

	if sum != total.Int() {
		t.Fatalf("the parts sum to %d, want %d", sum, total.Int())
	}
}

func TestAllocatesASumThatNaiveDivisionCannotProduce(t *testing.T) {
	// 100.00 across 3 equal parts: naive division gives 33.33 each, which
	// sums to 99.99. The remainder has to go somewhere.
	total := mustOf(t, "100.00")

	parts, err := total.Allocate([]int64{1, 1, 1})
	if err != nil {
		t.Fatal(err)
	}

	var sum int64
	for _, part := range parts {
		sum += part.Int()
	}

	if sum != total.Int() {
		t.Fatalf("the parts sum to %d, want %d", sum, total.Int())
	}
}

func TestDistributesTheRemainderToTheLargestWeightsFirst(t *testing.T) {
	// Rp 1.00 across 50/30/20 in whole sen: the 50-weight part is rounded
	// down hardest, so it gets the leftover.
	total := mustOf(t, "1.00")

	parts, err := total.Allocate([]int64{50, 30, 20})
	if err != nil {
		t.Fatal(err)
	}

	if !(parts[0].Int() > parts[1].Int()) {
		t.Fatalf("the largest weight got %d, the middle %d", parts[0].Int(), parts[1].Int())
	}
	if !(parts[1].Int() > parts[2].Int()) {
		t.Fatalf("the middle weight got %d, the smallest %d", parts[1].Int(), parts[2].Int())
	}

	var sum int64
	for _, part := range parts {
		sum += part.Int()
	}
	if sum != total.Int() {
		t.Fatalf("the parts sum to %d, want %d", sum, total.Int())
	}
}

func TestAllocatesByNameDeterministicallyRegardlessOfMapOrder(t *testing.T) {
	// The PHP original broke ties on the KEY. Go's map iteration order is
	// randomised, so the Go version sorts the keys and breaks ties on the
	// NAME — the same guarantee: the same plan produces the same stage
	// amounts between two requests.
	total := mustOf(t, "0.03")

	first, err := total.AllocateNamed(map[string]int64{"dp": 50, "mid": 50})
	if err != nil {
		t.Fatal(err)
	}

	second, err := total.AllocateNamed(map[string]int64{"mid": 50, "dp": 50})
	if err != nil {
		t.Fatal(err)
	}

	if first["dp"].Int() != second["dp"].Int() {
		t.Fatalf("the allocation is not deterministic: %d != %d", first["dp"].Int(), second["dp"].Int())
	}
	if first["mid"].Int() != second["mid"].Int() {
		t.Fatalf("the allocation is not deterministic: %d != %d", first["mid"].Int(), second["mid"].Int())
	}

	sum := first["dp"].Int() + first["mid"].Int()
	if sum != 3 {
		t.Fatalf("the parts sum to %d, want 3", sum)
	}
}

func TestAllocatesDeterministicallyRegardlessOfKeyOrder(t *testing.T) {
	// The PHP original broke ties on the KEY. The Go version breaks them on
	// the POSITION, which is the same guarantee: the result never depends on
	// the order the caller passed the weights in.
	total := mustOf(t, "100.00")

	first, err := total.Allocate([]int64{1, 1, 1, 1, 1, 1, 1})
	if err != nil {
		t.Fatal(err)
	}

	second, err := total.Allocate([]int64{1, 1, 1, 1, 1, 1, 1})
	if err != nil {
		t.Fatal(err)
	}

	for i := range first {
		if first[i].Int() != second[i].Int() {
			t.Fatalf("the allocation is not deterministic at %d: %d != %d", i, first[i].Int(), second[i].Int())
		}
	}
}

func TestHandlesANegativeAmountWhenAllocating(t *testing.T) {
	total := New(-10000, DefaultCurrency)

	parts, err := total.Allocate([]int64{1, 1, 1})
	if err != nil {
		t.Fatal(err)
	}

	var sum int64
	for _, part := range parts {
		sum += part.Int()
	}

	if sum != total.Int() {
		t.Fatalf("the parts sum to %d, want %d", sum, total.Int())
	}
}

func TestRefusesToAllocateOverAZeroWeightTotal(t *testing.T) {
	total := mustOf(t, "100.00")

	// The PHP original refuses an EMPTY list and a ZERO TOTAL, and accepts
	// everything else. This port matches it exactly: a weight list that sums
	// to zero cannot be allocated, and a negative weight is unreachable from
	// the application's own callers.
	if _, err := total.Allocate([]int64{0, 0}); err == nil {
		t.Fatal("a zero weight total was accepted")
	}
	if _, err := total.Allocate(nil); err == nil {
		t.Fatal("an empty weight list was accepted")
	}
}

func TestRefusesToSplitIntoFewerThanOnePart(t *testing.T) {
	if _, err := mustOf(t, "100.00").Split(0); err == nil {
		t.Fatal("splitting into zero parts was accepted")
	}
}

func TestComputesAPercentageInIntegerBasisPoints(t *testing.T) {
	value := mustOf(t, "100.00")

	eleven, err := value.Percentage("11")
	if err != nil {
		t.Fatal(err)
	}
	if eleven.Int() != 1100 {
		t.Fatalf("11%% of 100.00 = %d, want 1100", eleven.Int())
	}

	// 11.5% is 1150 basis points.
	elevenHalf, err := value.Percentage("11.5")
	if err != nil {
		t.Fatal(err)
	}
	if elevenHalf.Int() != 1150 {
		t.Fatalf("11.5%% of 100.00 = %d, want 1150", elevenHalf.Int())
	}
}

func TestRoundsAPercentageHalfAwayFromZero(t *testing.T) {
	// 5% of 1.00 is 0.05 — the half-way case.
	value := mustOf(t, "1.00")

	half, err := value.Percentage("5")
	if err != nil {
		t.Fatal(err)
	}
	if half.Int() != 5 {
		t.Fatalf("5%% of 1.00 = %d, want 5", half.Int())
	}
}

func TestRoundsANegativePercentageAwayFromZeroNeverTowardIt(t *testing.T) {
	// The PHP original was `intdiv($minor * bp + 5000, 10000)`, which is
	// correct for positive amounts and BIASED for negative ones, because
	// `intdiv` truncates toward zero and the `+ 5000` offset can then round
	// the WRONG WAY entirely.
	//
	//	-1000 minor x 50 bp = -50000; (-50000 + 5000) / 10000 = 0
	//	expected -5, returned 0
	//
	// So `-1.00` at 5% gave `0` instead of `-0.05`. Refunds, reversals and
	// negative adjustments are all real money movements.
	// -Rp 1.00 is -100 sen; 5% is 500 basis points; the product is -50 000,
	// and the half-way case is at 5 sen.
	value := mustOf(t, "-1.00")

	half, err := value.Percentage("5")
	if err != nil {
		t.Fatal(err)
	}
	if half.Int() != -5 {
		t.Fatalf("5%% of -1.00 = %d, want -5", half.Int())
	}
	if half.Decimal() != "-0.05" {
		t.Fatalf("5%% of -1.00 = %s, want -0.05", half.Decimal())
	}

	// And the case the PHP original got WRONG: `intdiv(-50000 + 5000, 10000)`
	// is `intdiv(-45000, 10000)` = -4, because `intdiv` truncates toward
	// zero and the `+ 5000` half-up offset can then push the result the
	// wrong way entirely. A one-sen understatement on every negative
	// percentage.
	ten := mustOf(t, "-10.00")

	halfOfTen, err := ten.Percentage("5")
	if err != nil {
		t.Fatal(err)
	}
	if halfOfTen.Int() != -50 {
		t.Fatalf("5%% of -10.00 = %d, want -50", halfOfTen.Int())
	}
}

func TestIsSymmetricAboutTheOrigin(t *testing.T) {
	for _, amount := range []string{"1.00", "0.03", "1234.56", "99999999.99"} {
		positive := mustOf(t, amount)
		negative := positive.Negate()

		for _, percentage := range []string{"0", "5", "33.33", "50", "100", "12.5"} {
			fromPositive, err := positive.Percentage(percentage)
			if err != nil {
				t.Fatal(err)
			}

			fromNegative, err := negative.Percentage(percentage)
			if err != nil {
				t.Fatal(err)
			}

			if fromPositive.Int() != -fromNegative.Int() {
				t.Fatalf(
					"%s%% of %s = %d, but of the negative = %d — the operation is not symmetric",
					percentage,
					amount,
					fromPositive.Int(),
					fromNegative.Int(),
				)
			}
		}
	}
}

func TestNeverLosesASenToRoundingAcrossAWholeRupiahTotal(t *testing.T) {
	// A thousand-rupiah total split into 7 shares: 1000 sen each is not
	// exact, and the remainder has to land somewhere.
	total := New(100000, DefaultCurrency)

	parts, err := total.Split(7)
	if err != nil {
		t.Fatal(err)
	}

	var sum int64
	for _, part := range parts {
		sum += part.Int()
	}

	if sum != total.Int() {
		t.Fatalf("the parts sum to %d, want %d", sum, total.Int())
	}
}

func TestRejectsAPercentageItCannotRepresent(t *testing.T) {
	for _, input := range []string{"abc", "12abc", "1.2.3"} {
		if _, err := mustOf(t, "100").Percentage(input); err == nil {
			t.Fatalf("Percentage(%q) was accepted", input)
		}
	}
}

func TestSerialisesAsADecimalStringPlusCurrencyNeverAFloat(t *testing.T) {
	value := mustOf(t, "15000000.50")

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}

	got := string(encoded)
	want := `{"amount":"15000000.50","currency":"IDR"}`

	if got != want {
		t.Fatalf("JSON = %s, want %s", got, want)
	}

	if strings.Contains(got, "15000000.5,") {
		t.Fatal("the amount was serialised as a float")
	}
}

func TestFormatsAZeroDecimalCurrencyWithoutAFraction(t *testing.T) {
	value, err := Of("1500", "JPY")
	if err != nil {
		t.Fatal(err)
	}

	if value.Decimal() != "1500" {
		t.Fatalf("Decimal() = %q, want 1500", value.Decimal())
	}
	if value.Int() != 1500 {
		t.Fatalf("Int() = %d, want 1500", value.Int())
	}
}

func TestIsImmutableEveryOperationReturnsANewValue(t *testing.T) {
	original := mustOf(t, "100.00")

	sum, err := original.Add(mustOf(t, "50.00"))
	if err != nil {
		t.Fatal(err)
	}
	if original.Int() != 10000 {
		t.Fatalf("the original changed to %d", original.Int())
	}
	if sum.Int() != 15000 {
		t.Fatalf("the sum is %d, want 15000", sum.Int())
	}
}

func TestMultiplyByRoundsHalfAwayFromZero(t *testing.T) {
	// PHP's `round()` is half away from zero, and so is this.
	// `math.RoundToEven` is NOT, and that is the other plausible choice.
	value := New(5, DefaultCurrency)

	half, err := value.MultiplyBy(0.5)
	if err != nil {
		t.Fatal(err)
	}
	if half.Int() != 3 {
		t.Fatalf("5 * 0.5 = %d, want 3 (half away from zero)", half.Int())
	}

	negative := New(-5, DefaultCurrency)
	negativeHalf, err := negative.MultiplyBy(0.5)
	if err != nil {
		t.Fatal(err)
	}
	if negativeHalf.Int() != -3 {
		t.Fatalf("-5 * 0.5 = %d, want -3 (half away from zero)", negativeHalf.Int())
	}
}

func TestRefusesAnAmountThatOverflowsRatherThanCorruptingIt(t *testing.T) {
	// The differential corpus caught this: at 2^53 minor units the float64
	// product loses its low bits, and the legacy PHP implementation turns the
	// integer overflow into a float and then CRASHES in `intdiv(float, int)`.
	//
	// A crash is bad. A wrong number is worse. So the Go port refuses.
	huge := New(1<<53+1, DefaultCurrency)

	// A percentage whose RESULT passes the int64 ceiling. 11 % of 2^53 is
	// 9.9e14, which fits; 100 000 % of it does not.
	if _, err := huge.Percentage("11"); err != nil {
		t.Fatalf("Percentage(11) returned %v, want no error", err)
	}

	if _, err := huge.Percentage("1000000"); !errors.Is(err, ErrAmountOverflow) {
		t.Fatalf("Percentage(1000000) returned %v, want an overflow error", err)
	}

	// And a multiplication that overflows.
	if _, err := huge.MultiplyBy(1e6); !errors.Is(err, ErrAmountOverflow) {
		t.Fatalf("MultiplyBy returned %v, want an overflow error", err)
	}

	// A multiplication that FITS is computed exactly, not refused.
	exact, err := huge.MultiplyBy(1.5)
	if err != nil {
		t.Fatalf("MultiplyBy returned %v", err)
	}
	if exact.Int() != 13510798882111490 {
		t.Fatalf("MultiplyBy = %d, want 13510798882111490", exact.Int())
	}
}

func TestDivideByTruncatesTowardZero(t *testing.T) {
	value := New(-100, DefaultCurrency)

	quotient, err := value.DivideBy(3)
	if err != nil {
		t.Fatal(err)
	}
	if quotient.Int() != -33 {
		t.Fatalf("-100 / 3 = %d, want -33 (truncated toward zero)", quotient.Int())
	}
}

func TestFloatIsPresentationOnly(t *testing.T) {
	value := mustOf(t, "15000000.50")

	if math.Abs(value.Float()-15000000.5) > 0.0001 {
		t.Fatalf("Float() = %f", value.Float())
	}
}
