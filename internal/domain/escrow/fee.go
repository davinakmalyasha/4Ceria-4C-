package escrow

import (
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// FeePercent converts a configured platform-fee percentage into basis points,
// clamped to [0 %, 100 %].
//
// The clamp is on the PERCENTAGE, not on the result, because that is what the
// legacy code does — and the difference is visible at the boundary: 100.6 %
// clamps to exactly 100 %, i.e. 10 000 basis points, not 10 060.
//
// THE FEE IS OFF BY DEFAULT (`0`), and that is a promise in the product copy:
// "4Ceria does not currently charge a platform fee." The service implements the
// mechanism so that enabling it later is a configuration change, not a rewrite.
func FeePercent(percent string) (int64, error) {
	bp, err := basisPoints(percent)
	if err != nil {
		return 0, err
	}

	if bp < 0 {
		return 0, nil
	}

	if bp > 10000 {
		return 10000, nil
	}

	return bp, nil
}

// FeeOn is the platform fee for a gross amount, or zero when disabled.
//
// It is computed with the same truncating division as retention, for the same
// reason: `retention + net == gross` and `payment + fee == what the client
// actually paid` must both be exact.
func FeeOn(gross money.Money, percent string) (money.Money, error) {
	bp, err := FeePercent(percent)
	if err != nil {
		return money.Money{}, err
	}

	if bp == 0 || !gross.IsPositive() {
		return money.Zero(gross.Currency()), nil
	}

	return moneyOf(gross, bp)
}

// FeeTitle is the ledger title of a platform-fee row.
//
// The percentage is formatted the way the legacy `number_format($p, 2, ',', '.')`
// + `rtrim` pair formats it: two decimals, a COMMA as the decimal mark, and
// trailing zeros removed ("1", "1,5", "0,25"). The ledger is a human-audited
// record, so the port reproduces the string rather than "fixing" it to a dot.
func FeeTitle(percent string, subject string) string {
	bp, err := FeePercent(percent)
	if err != nil {
		return "Platform fee: " + subject
	}

	return "Platform fee (" + formatBasisPointsAsPercentage(bp) + "%): " + subject
}

// formatBasisPointsAsPercentage renders 150 basis points as "1,5".
func formatBasisPointsAsPercentage(bp int64) string {
	whole := bp / 100
	fraction := bp % 100

	if fraction == 0 {
		return itoa(whole)
	}

	twoDigits := itoa(fraction/10) + itoa(fraction%10)

	// rtrim($value, '0'), then rtrim(..., ',').
	twoDigits = strings.TrimRight(twoDigits, "0")

	return itoa(whole) + "," + twoDigits
}

func itoa(value int64) string {
	if value == 0 {
		return "0"
	}

	negative := value < 0
	if negative {
		value = -value
	}

	var digits [20]byte
	i := len(digits)
	for value > 0 {
		i--
		digits[i] = byte('0' + value%10)
		value /= 10
	}

	if negative {
		i--
		digits[i] = '-'
	}

	return string(digits[i:])
}
