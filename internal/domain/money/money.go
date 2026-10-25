// Package money is the port of App\Support\Money.
//
// An immutable monetary amount held in INTEGER MINOR UNITS.
//
// WHY INTEGER MINOR UNITS
// -----------------------
// Every money path in the legacy application used to be a PHP float, against
// columns declared `decimal(24,2)`. A `decimal(24,2)` column can hold values
// up to ~1.7e22; a float64 tops out at ~9e15 AND carries only 15-17
// significant decimal digits. So a Rp 1e12 project at sen precision sits
// right at the float64's exact-integer limit, and the schema was quietly lying
// about what the code could represent.
//
// The specific failure that motivated this: refund caps compared
// `net-of-refunds` against `gross-refunded`, and every tolerance in the escrow
// was a magic `+ 0.01` epsilon on a float. None of those comparisons are
// reproducible at the values real projects reach.
//
// Integer minor units is the same approach Stripe, Shopify and Laravel Cashier
// take. It is exact, it is testable, and it makes the money arithmetic a pure
// function of integers.
//
// WHY STORAGE STAYS decimal(24,2)
// ------------------------------
// The value object converts at the model-cast boundary. The column keeps its
// declared precision, which means existing rows need no rewrite, a non-IDR
// currency is a `currency` column away rather than a data migration, and
// anyone reading the database in a SQL client sees human-readable numbers
// rather than integer sen.
//
// PARITY WITH THE PHP ORIGINAL
// ----------------------------
// This is a PORT, and the rounding rules are where a port usually drifts.
// Every one of them is stated here because each is a place where the obvious
// Go idiom is NOT the PHP behaviour:
//
//   - Percentage(): PHP's original was `intdiv($minor * bp + 5000, 10000)`,
//     which is correct for positive amounts and BIASED for negative ones,
//     because `intdiv` truncates toward zero and the `+ 5000` offset can then
//     round the wrong way entirely. Here the MAGNITUDE is rounded half away
//     from zero and the sign restored, which makes the operation symmetric:
//     `(-x).Percentage(p) == -(x.Percentage(p))` for every p.
//
//   - Percentage(): the sign is applied AFTER rounding the magnitude. Applying
//     it before would make a negative half-way case round toward zero.
//
//   - normaliseDecimal(): the fraction beyond the currency's scale is
//     TRUNCATED, not rounded. A value a caller may reconcile against a bank
//     must not be silently changed.
//
//   - MultiplyBy(): PHP's `round()` is half AWAY FROM ZERO, which is also
//     Go's `math.Round` — but Go's `math.Round` is half away from zero too, so
//     this one matches. It is stated because `math.RoundToEven` does not, and
//     that is the other plausible choice.
//
//   - DivideBy(): truncates toward zero, like PHP's `intdiv`.
//
//   - allocate(): the leftover minor units go to the LARGEST remainder first
//     when there are too FEW, and are taken back from the SMALLEST remainder
//     first when there are too MANY (a refund being split, so the rounding
//     error is unwound where it was introduced). Ties break on the key, so the
//     result never depends on the order the caller passed the weights in.
package money

import (
	"errors"
	"fmt"
	"math/big"
	"sort"
	"strconv"
	"strings"
)

// Scale is the number of minor units per major unit for the default scale.
const Scale = 2

// DefaultCurrency is the currency the application is denominated in.
const DefaultCurrency = "IDR"

// scales holds the number of minor units per major unit, by currency.
//
// Currencies where the "decimal" part is not in use are expressed in minor
// units anyway, so the arithmetic stays uniform.
var scales = map[string]int{
	"IDR": 2,
	"USD": 2,
	"EUR": 2,
	"SGD": 2,
	"MYR": 2,
	"AUD": 2,
	"JPY": 0,
	"KRW": 0,
	"VND": 0,
}

// Money is an immutable amount.
//
// The zero value is NOT a valid amount: use Zero, Of or OfMinor.
type Money struct {
	minor    int64
	currency string
}

// ErrCurrencyMismatch is returned when two currencies are combined.
//
// There is no implicit FX. Re-expressing an amount in another currency
// requires a rate, and inventing one silently would be worse than refusing.
var ErrCurrencyMismatch = errors.New("cannot combine amounts in different currencies")

// ErrInvalidAmount is returned for a value that cannot be parsed.
var ErrInvalidAmount = errors.New("not a valid monetary amount")

// ErrInvalidPercentage is returned for a percentage that cannot be
// represented.
var ErrInvalidPercentage = errors.New("not a valid percentage")

// ErrZeroDivisor is returned by DivideBy.
var ErrZeroDivisor = errors.New("money cannot be divided by zero")

// ErrInvalidWeights is returned by Allocate.
var ErrInvalidWeights = errors.New("weights must be non-empty and sum to a positive number")

// ErrAmountOverflow is returned when a result is beyond the representable
// range of an int64 minor-unit amount.
//
// The legacy PHP implementation has the same limit, and it fails LOUDLY: PHP's
// integer overflow becomes a float, and `intdiv(float, int)` throws a
// TypeError. The Go port must not be quieter than that — a wrong number is
// worse than a crash — so it refuses too.
var ErrAmountOverflow = errors.New("the amount is beyond the representable range")

// New builds an amount from an integer count of MINOR units, with no
// interpretation.
//
// Use this when the value came from a database column that is already in
// minor units, or from Int().
func New(minor int64, currency string) Money {
	return Money{minor: minor, currency: normaliseCurrency(currency)}
}

// Zero returns an amount of nothing.
func Zero(currency string) Money {
	return Money{minor: 0, currency: normaliseCurrency(currency)}
}

// Of builds an amount from a MAJOR-unit value.
//
// Accepts an integer count of major units, a float, or a decimal string.
// "15000000", 15000000, 15000000.50 and "15000000.50" all mean
// Rp 15,000,000.50.
//
// Floats are accepted but truncated to the currency's scale, because a float
// cannot be trusted beyond ~15 significant digits. Callers that have an exact
// decimal should pass it as a string.
func Of(amount string, currency string) (Money, error) {
	currency = normaliseCurrency(currency)
	scale := scaleFor(currency)

	normalised, err := normaliseDecimal(amount, scale)
	if err != nil {
		return Money{}, err
	}

	minor, err := strconv.ParseInt(normalised, 10, 64)
	if err != nil {
		return Money{}, fmt.Errorf("%w: %q", ErrInvalidAmount, amount)
	}

	return Money{minor: minor, currency: currency}, nil
}

// MustOf is Of, for the cases where the amount is a compile-time constant.
//
// It PANICS on an invalid amount, which is the right behaviour for a literal:
// a malformed constant is a programming error, not a runtime condition.
func MustOf(amount string, currency string) Money {
	value, err := Of(amount, currency)
	if err != nil {
		panic(err)
	}
	return value
}

// OfMinor builds an amount from an integer count of minor units.
func OfMinor(minor int64, currency string) Money {
	return New(minor, currency)
}

// FromColumn reads a value straight off a decimal column.
//
// It handles the shapes that actually appear in the schema: a numeric string, a
// float, an int, and — for legacy rows — an empty string or null, which must
// become zero rather than blowing up a money path.
func FromColumn(value any, currency string) (Money, error) {
	switch typed := value.(type) {
	case Money:
		return typed, nil
	case nil:
		return Zero(currency), nil
	case string:
		if strings.TrimSpace(typed) == "" {
			return Zero(currency), nil
		}
		return Of(typed, currency)
	case int:
		return Of(strconv.Itoa(typed), currency)
	case int32:
		return Of(strconv.FormatInt(int64(typed), 10), currency)
	case int64:
		return Of(strconv.FormatInt(typed, 10), currency)
	case float32:
		return Of(strconv.FormatFloat(float64(typed), 'f', -1, 32), currency)
	case float64:
		return Of(strconv.FormatFloat(typed, 'f', -1, 64), currency)
	default:
		return Money{}, fmt.Errorf("%w: unsupported column type %T", ErrInvalidAmount, value)
	}
}

// Currency is the currency code.
func (m Money) Currency() string { return m.currency }

// Int is the integer count of minor units.
func (m Money) Int() int64 { return m.minor }

// Decimal is the fixed-point decimal string, e.g. "15000000.50".
func (m Money) Decimal() string {
	scale := m.scale()

	if scale == 0 {
		return strconv.FormatInt(m.minor, 10)
	}

	divisor := int64(pow10(scale))
	sign := ""
	abs := m.minor
	if abs < 0 {
		sign = "-"
		abs = -abs
	}

	fraction := abs % divisor

	return fmt.Sprintf("%s%d.%0*d", sign, abs/divisor, scale, fraction)
}

// String is the fixed-point decimal string.
func (m Money) String() string { return m.Decimal() }

// Float is the amount as a float, for PRESENTATION ONLY.
//
// Never feed the result back into arithmetic — that is the whole problem this
// package exists to remove. JSON responses use Decimal().
func (m Money) Float() float64 {
	value, _ := strconv.ParseFloat(m.Decimal(), 64)
	return value
}

// MarshalJSON is the JSON representation: a decimal STRING plus the currency.
//
// A JSON float would reintroduce the precision loss on the client side, which
// is exactly the bug that made the SPA's escrow display wrong. The currency
// rides along so a client never has to guess.
func (m Money) MarshalJSON() ([]byte, error) {
	return []byte(fmt.Sprintf(`{"amount":%s,"currency":%s}`,
		strconv.Quote(m.Decimal()),
		strconv.Quote(m.currency),
	)), nil
}

// Add returns the sum.
func (m Money) Add(other Money) (Money, error) {
	if err := m.assertSameCurrency(other); err != nil {
		return Money{}, err
	}
	return Money{minor: m.minor + other.minor, currency: m.currency}, nil
}

// Subtract returns the difference.
func (m Money) Subtract(other Money) (Money, error) {
	if err := m.assertSameCurrency(other); err != nil {
		return Money{}, err
	}
	return Money{minor: m.minor - other.minor, currency: m.currency}, nil
}

// Negate represents an outbound movement.
func (m Money) Negate() Money {
	return Money{minor: -m.minor, currency: m.currency}
}

// Abs is the magnitude.
func (m Money) Abs() Money {
	if m.minor < 0 {
		return Money{minor: -m.minor, currency: m.currency}
	}
	return m
}

// MultiplyBy multiplies by a scalar.
//
// A non-integer factor is rounded half away from zero to the nearest minor
// unit, which is the only defensible reading — and it is done once, here,
// rather than implicitly at every call site.
func (m Money) MultiplyBy(factor float64) (Money, error) {
	// The product is computed exactly, in 128 bits.
	//
	// `float64(m.minor) * factor` carries only 15-16 significant digits, so
	// above about 2^53 minor units it silently rounds a money amount — the
	// exact defect this package exists to remove, reintroduced through the
	// back door.
	// 256 bits of mantissa: an int64 minor amount times a float64 factor
	// needs at most 117 bits to be exact, and `big.Float`'s default 64 would
	// not be.
	prec := uint(256)

	scaled := new(big.Float).SetPrec(prec).SetInt64(m.minor)
	scaled.Mul(scaled, new(big.Float).SetPrec(prec).SetFloat64(factor))

	// Half away from zero, which is PHP's `round()`.
	//
	// `Int` TRUNCATES toward zero, so the half is added to the MAGNITUDE and
	// the sign is restored afterwards. Adding the half to a negative value
	// would move the rounding decision the wrong way.
	magnitude := new(big.Float).SetPrec(prec).Abs(scaled)
	magnitude.Add(magnitude, new(big.Float).SetPrec(prec).SetFloat64(0.5))

	rounded, _ := magnitude.Int(nil)

	if scaled.Sign() < 0 {
		rounded.Neg(rounded)
	}

	if !rounded.IsInt64() {
		return Money{}, fmt.Errorf(
			"%w: %s multiplied by %v is beyond the representable range of an int64 minor-unit amount",
			ErrAmountOverflow,
			m.Decimal(),
			factor,
		)
	}

	return Money{minor: rounded.Int64(), currency: m.currency}, nil
}

// DivideBy divides by an exact divisor.
//
// It returns an error on zero rather than producing an infinity the ledger
// would then try to store.
func (m Money) DivideBy(divisor int64) (Money, error) {
	if divisor == 0 {
		return Money{}, ErrZeroDivisor
	}
	return Money{minor: m.minor / divisor, currency: m.currency}, nil
}

// Compare returns -1, 0 or 1.
func (m Money) Compare(other Money) (int, error) {
	if err := m.assertSameCurrency(other); err != nil {
		return 0, err
	}
	switch {
	case m.minor < other.minor:
		return -1, nil
	case m.minor > other.minor:
		return 1, nil
	default:
		return 0, nil
	}
}

// Equals reports exact equality.
func (m Money) Equals(other Money) (bool, error) {
	result, err := m.Compare(other)
	return result == 0, err
}

// IsGreaterThan reports a strict comparison.
func (m Money) IsGreaterThan(other Money) (bool, error) {
	result, err := m.Compare(other)
	return result > 0, err
}

// IsGreaterThanOrEqual reports a comparison.
func (m Money) IsGreaterThanOrEqual(other Money) (bool, error) {
	result, err := m.Compare(other)
	return result >= 0, err
}

// IsLessThan reports a strict comparison.
func (m Money) IsLessThan(other Money) (bool, error) {
	result, err := m.Compare(other)
	return result < 0, err
}

// IsLessThanOrEqual reports a comparison.
func (m Money) IsLessThanOrEqual(other Money) (bool, error) {
	result, err := m.Compare(other)
	return result <= 0, err
}

// IsZero reports an amount of nothing.
func (m Money) IsZero() bool { return m.minor == 0 }

// IsPositive reports a positive amount.
func (m Money) IsPositive() bool { return m.minor > 0 }

// IsNegative reports a negative amount.
func (m Money) IsNegative() bool { return m.minor < 0 }

// Percentage returns a percentage of this amount, rounded HALF AWAY FROM ZERO.
//
// The sign is applied AFTER rounding the magnitude, which makes the behaviour
// symmetric: `(-x).Percentage(p) == -(x.Percentage(p))` for every p.
//
// The PHP original was `intdiv($minor * bp + 5000, 10000)`, which is correct
// for positive amounts and biased for negative ones: `intdiv` truncates toward
// zero, so the `+ 5000` offset only ever pushes the result up. On a negative
// amount it pushes the rounding decision the wrong way, and can round the
// WRONG WAY entirely once the product is small enough that the offset
// dominates:
//
//	-1000 minor x 50 bp = -50000; (-50000 + 5000) / 10000 = 0 (truncated)
//	expected -5, returned 0
//
// So `-1.00` at 5% gave `0` instead of `-0.05`. Refunds, reversals and
// negative adjustments are all real money movements, and this package is the
// single source of truth for all of them.
func (m Money) Percentage(percentage string) (Money, error) {
	basisPoints, err := toBasisPoints(percentage)
	if err != nil {
		return Money{}, err
	}

	// The product is computed in 128 bits.
	//
	// `minor * basisPoints` overflows an int64 once the amount passes about
	// Rp 9.2 TRILLION, and a wrapped product is a WRONG NUMBER rather than an
	// error: the differential corpus caught the Go port returning
	// `-8538824893494.46` for 11 % of Rp 90 trillion.
	//
	// The PHP original has the same defect, and it fails differently: PHP's
	// integer overflow becomes a float, and `intdiv(float, int)` then throws a
	// TypeError. So the legacy application CRASHES on a percentage of an
	// amount that large, and the Go port SILENTLY CORRUPTED it. A crash is bad
	// and corruption is worse.
	product := new(big.Int).Mul(big.NewInt(m.minor), big.NewInt(basisPoints))

	sign := int64(1)
	if product.Sign() < 0 {
		sign = -1
	}

	magnitude := new(big.Int).Abs(product)

	// Round the magnitude half away from zero, then restore the sign.
	quotient, remainder := new(big.Int).QuoRem(magnitude, big.NewInt(10000), new(big.Int))

	if remainder.Cmp(big.NewInt(5000)) >= 0 {
		quotient.Add(quotient, big.NewInt(1))
	}

	if !quotient.IsInt64() {
		return Money{}, fmt.Errorf(
			"%w: %s%% of %s is beyond the representable range of an int64 minor-unit amount",
			ErrAmountOverflow,
			percentage,
			m.Decimal(),
		)
	}

	return Money{minor: sign * quotient.Int64(), currency: m.currency}, nil
}

// AllocateNamed splits the amount across NAMED weights.
//
// The termin plan needs the names — a stage is `dp`, `mid`, `final`, and the
// stage amounts are what the plan is made of.
//
// The tie-break is on the NAME, not on the position, because Go's map
// iteration order is randomised and the result must not depend on it. The PHP
// original broke ties on the key for the same reason.
func (m Money) AllocateNamed(weights map[string]int64) (map[string]Money, error) {
	if len(weights) == 0 {
		return nil, fmt.Errorf("%w: at least one weight is required", ErrInvalidWeights)
	}

	keys := make([]string, 0, len(weights))
	for key := range weights {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	ordered := make([]int64, len(keys))
	for i, key := range keys {
		ordered[i] = weights[key]
	}

	parts, err := m.Allocate(ordered)
	if err != nil {
		return nil, err
	}

	result := make(map[string]Money, len(keys))
	for i, key := range keys {
		result[key] = parts[i]
	}

	return result, nil
}

// Split divides the amount into N equal parts, distributing the remainder.
func (m Money) Split(parts int) ([]Money, error) {
	if parts < 1 {
		return nil, fmt.Errorf("%w: at least one part is required", ErrInvalidWeights)
	}

	weights := make([]int64, parts)
	for i := range weights {
		weights[i] = 1
	}

	return m.Allocate(weights)
}

// Allocate splits the amount across weights without losing or inventing a
// single sen.
//
// Plain proportional division loses money: 100 sen across 3 equal parts is
// 33.33 each, which sums to 99.99. This distributes the remainder one minor
// unit at a time, in descending weight order, so the parts always sum exactly
// to the original.
//
// Used for termin schedules, where the legacy `signContract` and the SPA both
// computed `Math.round(pct / 100 * total)` independently and therefore
// disagreed.
func (m Money) Allocate(weights []int64) ([]Money, error) {
	if len(weights) == 0 {
		return nil, fmt.Errorf("%w: at least one weight is required", ErrInvalidWeights)
	}

	var total int64
	for _, weight := range weights {
		total += weight
	}

	if total <= 0 {
		return nil, fmt.Errorf("%w: the weights must sum to a positive number", ErrInvalidWeights)
	}

	// Exact integer shares first, remainder accumulated for distribution.
	shares := make([]int64, len(weights))
	remainders := make([]int64, len(weights))

	var assigned int64
	for i, weight := range weights {
		exactNumerator := m.minor * weight
		share := exactNumerator / total
		shares[i] = share
		remainders[i] = exactNumerator - (share * total)
		assigned += share
	}

	left := m.minor - assigned

	if left != 0 {
		direction := int64(1)
		if left < 0 {
			direction = -1
		}
		count := left
		if count < 0 {
			count = -count
		}

		// Hand out the leftover one unit at a time. Positive leftover goes to
		// the LARGEST remainder first (those parts were rounded down hardest);
		// a negative leftover — a refund being split — is taken back from the
		// SMALLEST remainder first, so the rounding error is unwound where it
		// was introduced.
		order := make([]int, len(remainders))
		for i := range order {
			order[i] = i
		}

		sort.SliceStable(order, func(a, b int) bool {
			if remainders[order[a]] != remainders[order[b]] {
				if direction > 0 {
					return remainders[order[a]] > remainders[order[b]]
				}
				return remainders[order[a]] < remainders[order[b]]
			}
			// Ties break on the position, so the result never depends on the
			// order the caller happened to pass the weights in.
			return order[a] < order[b]
		})

		for i := int64(0); i < count; i++ {
			shares[order[int(i)%len(order)]] += direction
		}
	}

	result := make([]Money, len(shares))
	for i, share := range shares {
		result[i] = Money{minor: share, currency: m.currency}
	}

	return result, nil
}

// WithCurrency re-expresses the amount in another currency.
//
// No conversion happens here: a rate would be needed, and inventing one
// silently would be worse than refusing.
func (m Money) WithCurrency(currency string) (Money, error) {
	currency = normaliseCurrency(currency)

	if currency == m.currency {
		return m, nil
	}

	return Money{}, fmt.Errorf(
		"%w: refusing to reinterpret %s %s as %s — convert explicitly with a rate you have actually been given",
		ErrCurrencyMismatch,
		m.currency,
		m.Decimal(),
		currency,
	)
}

func (m Money) assertSameCurrency(other Money) error {
	if other.currency != m.currency {
		return fmt.Errorf(
			"%w: cannot combine %s %s with %s %s: no exchange rate is in scope",
			ErrCurrencyMismatch,
			m.currency,
			m.Decimal(),
			other.currency,
			other.Decimal(),
		)
	}

	return nil
}

func (m Money) scale() int { return scaleFor(m.currency) }

func scaleFor(currency string) int {
	if scale, ok := scales[currency]; ok {
		return scale
	}
	return Scale
}

func normaliseCurrency(currency string) string {
	return strings.ToUpper(strings.TrimSpace(currency))
}

func pow10(scale int) int {
	result := 1
	for i := 0; i < scale; i++ {
		result *= 10
	}
	return result
}

// normaliseDecimal converts a decimal string to a scaled integer, WITHOUT
// going through a float.
//
// A float cannot represent 0.1 exactly, so `(int) round(0.1 * 100)` is right
// only by luck. String manipulation is the only exact path.
//
// DELIBERATELY STRICT. Only a canonical `[-]digits[.digits]` is accepted. A
// parser that guesses whether "1,500" means fifteen hundred or one and a half,
// or whether "1.500.000,50" is Indonesian or German formatting, is a parser
// that will eventually guess wrong inside an escrow ledger. Localised input
// belongs at the edge of the system, converted once, by a caller that knows
// where it came from — not inferred here.
//
// Spaces (including NBSP and narrow NBSP, which browsers emit for thousands
// grouping) and underscores ARE tolerated, because they are unambiguous: they
// never appear in a canonical decimal.
func normaliseDecimal(amount string, scale int) (string, error) {
	amount = strings.TrimSpace(amount)

	if amount == "" {
		return "0", nil
	}

	amount = strings.NewReplacer(
		" ", "",
		" ", "",
		"_", "",
		" ", "",
	).Replace(amount)

	sign := ""
	if strings.HasPrefix(amount, "+") {
		amount = amount[1:]
	} else if strings.HasPrefix(amount, "-") {
		sign = "-"
		amount = amount[1:]
	}

	whole := amount
	fraction := ""

	if dot := strings.IndexByte(amount, '.'); dot >= 0 {
		whole = amount[:dot]
		fraction = amount[dot+1:]

		if strings.Contains(fraction, ".") {
			return "", fmt.Errorf(
				"%w: %q is not a valid monetary amount — expected a canonical decimal such as \"15000000.50\"; a thousands separator or a locale-specific decimal mark is rejected on purpose, because guessing which is which can silently move the wrong amount",
				ErrInvalidAmount,
				amount,
			)
		}
	}

	if whole == "" || !isDigits(whole) || (fraction != "" && !isDigits(fraction)) {
		return "", fmt.Errorf(
			"%w: %q is not a valid monetary amount — expected a canonical decimal such as \"15000000.50\"; a thousands separator or a locale-specific decimal mark is rejected on purpose, because guessing which is which can silently move the wrong amount",
			ErrInvalidAmount,
			amount,
		)
	}

	if scale == 0 {
		return sign + whole, nil
	}

	// Truncate anything beyond the currency's precision rather than silently
	// rounding a value the caller may reconcile against a bank.
	if len(fraction) > scale {
		fraction = fraction[:scale]
	}
	for len(fraction) < scale {
		fraction += "0"
	}

	return sign + whole + fraction, nil
}

// toBasisPoints converts a percentage into integer basis points, so 11% is
// 1100.
//
// It refuses a percentage that cannot be represented, rather than truncating
// 11.999% to something that silently under-taxes.
func toBasisPoints(percentage string) (int64, error) {
	normalised := strings.TrimSpace(percentage)

	normalised = strings.ReplaceAll(normalised, ",", ".")

	sign := ""
	if strings.HasPrefix(normalised, "+") {
		normalised = normalised[1:]
	} else if strings.HasPrefix(normalised, "-") {
		sign = "-"
		normalised = normalised[1:]
	}

	whole := normalised
	fraction := ""

	if dot := strings.IndexByte(normalised, '.'); dot >= 0 {
		whole = normalised[:dot]
		fraction = normalised[dot+1:]
	}

	if whole == "" && fraction == "" {
		return 0, fmt.Errorf("%w: %q", ErrInvalidPercentage, percentage)
	}

	if (whole != "" && !isDigits(whole)) || (fraction != "" && !isDigits(fraction)) {
		return 0, fmt.Errorf("%w: %q", ErrInvalidPercentage, percentage)
	}

	if whole == "" {
		whole = "0"
	}

	if len(fraction) > 2 {
		fraction = fraction[:2]
	}
	for len(fraction) < 2 {
		fraction += "0"
	}

	value, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: %q", ErrInvalidPercentage, percentage)
	}

	fractionValue, err := strconv.ParseInt(fraction, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: %q", ErrInvalidPercentage, percentage)
	}

	total := value*100 + fractionValue

	if sign == "-" {
		total = -total
	}

	return total, nil
}

func isDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
