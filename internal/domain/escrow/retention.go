package escrow

import (
	"fmt"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// Split is a gross stage amount divided into the part held back until the
// warranty expires and the part payable now.
//
// RETENTION IS NOT A DISCOUNT. The professional is owed the full gross;
// retention changes only WHEN part of it becomes disbursable. So
// Retention+Net == Gross, always, exactly — not within a tolerance.
type Split struct {
	Retention money.Money
	Net       money.Money
}

// SplitRetention divides a gross stage amount, at the configured percentage.
//
// PARITY NOTES (each one is a place the obvious Go code differs from PHP):
//
//   - The percentage is rounded to basis points with half-away-from-zero
//     rounding, matching `(int) round($percent * 100)`.
//   - The retention is TRUNCATED toward zero (`intdiv`), not rounded. A
//     retained amount must never exceed the configured percentage, because
//     over-retaining delays money the professional was promised.
//   - The net is computed as gross MINUS retention, not as gross TIMES
//     (1 - p). That makes the two halves re-sum to the gross by construction;
//     the multiply-and-subtract form leaves a gap of up to one sen.
//   - A non-positive percentage, or a non-positive gross, is NO retention.
func SplitRetention(gross money.Money, percent string) (Split, error) {
	bp, err := basisPoints(percent)
	if err != nil {
		return Split{}, err
	}

	if bp <= 0 || !gross.IsPositive() {
		return Split{
			Retention: money.Zero(gross.Currency()),
			Net:       gross,
		}, nil
	}

	retention, err := moneyOf(gross, bp)
	if err != nil {
		return Split{}, err
	}

	net, err := gross.Subtract(retention)
	if err != nil {
		return Split{}, err
	}

	return Split{Retention: retention, Net: net}, nil
}

// ForTermin reads a PERSISTED split off a payment stage.
//
// It never recomputes from `amount`: the stage was split once, when it was
// created, at the rate the parties agreed to. A later configuration change must
// not move an agreed net.
//
// Three cases, and the second one is the interesting one:
//
//   - A normal split is returned as stored.
//   - Legacy rows (before the columns existed) have both halves zero; they are
//     paid GROSS. Paying 0 for a stage the client approved would be far worse
//     than paying what was contracted.
//   - A HALF-WRITTEN split — net zero, retention positive — is CORRUPTION, not
//     legacy. Paying the gross would overpay and quietly erase the retention;
//     the honest answer is to hold back the recorded retention and let
//     `money:reconcile` flag the stage.
func ForTermin(gross, net, retention money.Money) (Split, error) {
	// The three figures come from three columns of ONE row, so a mismatch is
	// corruption rather than a conversion the caller forgot.
	if net.Currency() != gross.Currency() {
		return Split{}, currencyMismatch(gross, net)
	}

	if retention.Currency() != gross.Currency() {
		return Split{}, currencyMismatch(gross, retention)
	}

	if !net.IsPositive() && retention.IsPositive() {
		held, err := gross.Subtract(retention)
		if err != nil {
			return Split{}, err
		}

		return Split{Retention: retention, Net: held}, nil
	}

	if !net.IsPositive() && !retention.IsPositive() {
		return Split{Retention: money.Zero(gross.Currency()), Net: gross}, nil
	}

	return Split{Retention: retention, Net: net}, nil
}

// moneyOf computes `gross * bp / 10000` exactly as the legacy code does: an
// exact integer multiply, then a TRUNCATING division.
//
// `money.Money.Percentage` is NOT used here, and that is the whole point of
// this helper: Percentage rounds HALF AWAY FROM ZERO, while retention truncates.
// For a gross of Rp 1 000 000.03 at 5 %, the two differ by a sen on the ceiling
// but not here — and a sen that appears on one side of the split and not the
// other is exactly what `retention + net == amount` exists to catch.
func moneyOf(gross money.Money, bp int64) (money.Money, error) {
	scaled, err := gross.MultiplyBy(float64(bp))
	if err != nil {
		return money.Money{}, err
	}

	return scaled.DivideBy(10000)
}

// currencyMismatch reports two columns of one row disagreeing about the
// currency, which no exchange rate can explain.
func currencyMismatch(gross, other money.Money) error {
	return fmt.Errorf(
		"escrow: the stored split is %s %s against a gross of %s %s — one row cannot hold two currencies",
		other.Currency(), other.Decimal(), gross.Currency(), gross.Decimal(),
	)
}
