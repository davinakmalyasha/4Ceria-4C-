package escrow

import (
	"fmt"
	"strings"
)

// basisPoints converts a configured percentage into integer basis points, the
// way the legacy code does: `(int) round($percent * 100)`.
//
// The rounding is HALF AWAY FROM ZERO at the third decimal, which is what PHP's
// `round()` does. It is stated because the alternative (`math.Round` and
// `math.RoundToEven`) differ only in that case, and a retention percentage is
// exactly where a half-basis-point difference becomes a disputed rupiah.
//
// A percentage is read as a STRING rather than a float: `5.5` is 550 basis
// points, and a float parse of a config value is one more place the two engines
// could disagree.
func basisPoints(percent string) (int64, error) {
	trimmed := strings.TrimSpace(percent)
	if trimmed == "" {
		return 0, nil
	}

	sign := int64(1)
	if strings.HasPrefix(trimmed, "+") {
		trimmed = trimmed[1:]
	} else if strings.HasPrefix(trimmed, "-") {
		sign = -1
		trimmed = trimmed[1:]
	}

	whole := trimmed
	fraction := ""

	if dot := strings.IndexByte(trimmed, '.'); dot >= 0 {
		whole = trimmed[:dot]
		fraction = trimmed[dot+1:]
	}

	if whole == "" && fraction == "" {
		return 0, fmt.Errorf("not a percentage: %q", percent)
	}

	if (whole != "" && !isDigits(whole)) || (fraction != "" && !isDigits(fraction)) {
		return 0, fmt.Errorf("not a percentage: %q", percent)
	}

	if whole == "" {
		whole = "0"
	}

	// Round at the second decimal: 5.555 % is 556 basis points.
	roundUp := len(fraction) > 2 && fraction[2] >= '5'
	if len(fraction) > 2 {
		fraction = fraction[:2]
	}
	for len(fraction) < 2 {
		fraction += "0"
	}

	var value int64
	for _, r := range whole {
		digit := int64(r - '0')
		if value > (1<<62)/10 {
			return 0, fmt.Errorf("not a percentage: %q", percent)
		}
		value = value*10 + digit
	}

	fractionValue := int64(fraction[0]-'0')*10 + int64(fraction[1]-'0')

	total := value*100 + fractionValue
	if roundUp {
		total++
	}

	return sign * total, nil
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
