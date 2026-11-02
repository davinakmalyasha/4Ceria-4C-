// Package terminplan is the port of App\Services\TerminPlanService — the
// integrity guards for payment plans (`project_payment_termins`).
//
// WHY THIS EXISTS, IN ONE PARAGRAPH
// ---------------------------------
// The legacy plan writers only checked the caller's role, so any
// professional could mint a termin on any project with an arbitrary amount
// and set themselves as `recipient_id` — then self-verify it through the
// payment verification path. This package centralises the invariants so
// every write path (the termin controller, signContract, clientSignContract)
// shares them: a stage names a licensed role, a plan never exceeds the
// negotiated contract value, percentages split exactly 100, and stages
// already in flight cannot be re-planned.
//
// WHAT IS PURE AND WHAT IS NOT
// ----------------------------
// Everything here is pure: the guards take the contract value and the
// stages as arguments and return an error. Reading the accepted bid
// (`contractValueFor`) and the stored stages stays in the HTTP layer, which
// owns the queries — the same split the escrow package uses (Store is an
// interface there because the ledger has one writer; here there is nothing
// to write, so there is no interface at all).
//
// MONEY IS EXACT
// -------------
// All amount comparisons run in minor units (integers, never floats) via
// the money package — the previous PHP version compared floats against a
// `+ 1000` tolerance, where the boundary was whatever the double rounding
// produced. Percentages stay floats with the 0.01 tolerance the oracle
// uses, because percentages are a display-side split, not money.
package terminplan

import (
	"fmt"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// The tolerances, in the oracle's units: percentages in points, amounts in
// whole Rupiah.
const (
	// PercentageTolerance is TerminPlanService::PERCENTAGE_TOLERANCE.
	PercentageTolerance = 0.01
	// AmountTolerance is TerminPlanService::AMOUNT_TOLERANCE, in Rupiah.
	AmountTolerance = 1000
)

// Stage is one payment stage as submitted or as stored.
type Stage struct {
	// ID is the stored row id. Zero for a stage that has no row yet.
	ID int64
	// Label names the stage in drift errors.
	Label string
	// Status is the stored lifecycle state (pending, verifying, paid, void).
	Status string
	// Percentage is the stage's share of the contract value.
	Percentage float64
	// Amount is the stage's Rupiah figure.
	Amount money.Money
}

// KnownRoles is every role a payment stage may belong to, in the registry's
// order. It is TerminPlanService::knownRoles: config/bids.php, not a second
// list — a restated list is how the seven tables drifted apart.
func KnownRoles() []identity.Role {
	return identity.Roles()
}

// AssertKnownRole is assertKnownRole: a stage must name a licensed role.
//
// `'user'` and `'admin'` are rejected on purpose: an owner pays against a
// role's schedule, they do not have a payment schedule of their own. The
// bulk-replace path used to default the role to the caller's own
// `role_type`, writing invisible `role_type = 'user'` stages that matched
// no contract value, no bid matrix and no payment report.
func AssertKnownRole(role string) error {
	for _, known := range identity.Roles() {
		if role == string(known) {
			return nil
		}
	}

	names := make([]string, 0, len(identity.Roles()))
	for _, known := range identity.Roles() {
		names = append(names, string(known))
	}

	received := "null"
	if role != "" {
		received = "'" + role + "'"
	}

	return fmt.Errorf(
		"A payment stage must be addressed to one of the licensed roles (%s). Received: %s. The owner pays against a role's schedule; they do not have their own.",
		strings.Join(names, ", "), received,
	)
}

// ContractValue is contractValueFor's core: the negotiated value for a
// role, taken from the accepted bid as `calculated_total ?? price`.
//
// Percentage bids must use `calculated_total`, never the raw `price` — the
// price of a percentage bid IS the percentage (see BidCalculationService).
// Either side may be absent (nil = SQL NULL); nil in, nil out. A nil result
// means no accepted bid exists yet, and every bound below is a no-op.
func ContractValue(calculatedTotal, price *money.Money) *money.Money {
	if calculatedTotal != nil {
		return calculatedTotal
	}

	return price
}

// AssertTotalWithinContractValue is assertTotalWithinContractValue: the
// planned total may never exceed the negotiated value plus Rp 1,000.
//
// A nil or non-positive contract means no accepted contract yet, and the
// bound is a no-op. The comparison is exact in minor units: limit =
// contract + 1000 Rupiah, total > limit fails.
func AssertTotalWithinContractValue(contract *money.Money, total money.Money) error {
	if contract == nil || contract.Int() <= 0 {
		return nil
	}

	tolerance := money.MustOf("1000", contract.Currency())
	limit := money.OfMinor(contract.Int()+tolerance.Int(), total.Currency())

	greater, err := total.IsGreaterThan(limit)
	if err != nil {
		return err
	}

	if greater {
		return fmt.Errorf(
			"payment plan exceeds the negotiated contract value for this role. Planned: Rp %s of Rp %s",
			total.Decimal(), contract.Decimal(),
		)
	}

	return nil
}

// AssertPercentagesWithinWhole is assertPercentagesWithinWhole: the stages
// are a SPLIT of the agreed fee, so they cannot total more than 100%.
//
// An incomplete plan is legitimate while a professional builds it stage by
// stage, so anything at or under 100 (within tolerance) passes — requiring
// exactly 100 is assertPlanComplete's job, enforced only where a plan
// becomes binding.
func AssertPercentagesWithinWhole(percentages []float64) error {
	var total float64
	for _, percentage := range percentages {
		total += percentage
	}

	if abs(total-100) <= PercentageTolerance {
		return nil
	}

	if total > 100 {
		return fmt.Errorf(
			"payment schedule cannot total more than 100%% (received %s%%). Percentages are a split of the agreed fee, not an increment",
			formatFloat(total),
		)
	}

	return nil
}

// AssertPlanComplete is assertPlanComplete: a BINDING plan sums to exactly
// 100% and its amounts to the contract value.
//
// Enforced only where a plan becomes binding (signContract,
// clientSignContract) — never while the professional is still building it.
func AssertPlanComplete(contract *money.Money, stages []Stage) error {
	if len(stages) == 0 {
		return fmt.Errorf("no payment schedule exists for this role")
	}

	var percentage float64
	for _, stage := range stages {
		percentage += stage.Percentage
	}

	if abs(percentage-100) > PercentageTolerance {
		return fmt.Errorf(
			"payment schedule must total 100%% (currently %s%%)",
			formatFloat(percentage),
		)
	}

	if contract != nil && contract.Int() > 0 {
		total := money.OfMinor(0, contract.Currency())
		for _, stage := range stages {
			added, err := total.Add(stage.Amount)
			if err != nil {
				return err
			}
			total = added
		}

		diff := total.Int() - contract.Int()
		if diff < 0 {
			diff = -diff
		}

		tolerance := money.MustOf("1000", contract.Currency())
		if diff > tolerance.Int() {
			return fmt.Errorf(
				"payment schedule total (Rp %s) does not match the negotiated contract value (Rp %s)",
				formatID(total), formatID(*contract),
			)
		}
	}

	return nil
}

// AssertNoInFlightDrift is assertNoInFlightDrift: stages already verifying
// or paid may not be re-planned — the payee could otherwise change the
// amount AFTER the owner uploaded a proof for a different figure, and the
// ledger would book a number the proof does not support.
//
// `existing` carries the stored in-flight stages (id, label, status,
// amount, percentage); `incoming` carries the submission. A submitted
// stage with no id, or an id that is not in flight, is unchecked.
func AssertNoInFlightDrift(existing []Stage, incoming []Stage) error {
	byID := map[int64]Stage{}
	for _, stage := range existing {
		byID[stage.ID] = stage
	}

	for _, stage := range incoming {
		if stage.ID == 0 {
			continue
		}

		stored, ok := byID[stage.ID]
		if !ok {
			continue
		}

		half := money.MustOf("0.5", stored.Amount.Currency())
		if absMoney(stage.Amount.Int()-stored.Amount.Int()) > half.Int() {
			return fmt.Errorf(
				"payment stage %q is already %s and its amount can no longer be changed",
				stored.Label, stored.Status,
			)
		}

		if abs(stage.Percentage-stored.Percentage) > PercentageTolerance {
			return fmt.Errorf(
				"payment stage %q is already %s and its percentage can no longer be changed",
				stored.Label, stored.Status,
			)
		}
	}

	return nil
}

// abs is fabs — the package has no other float need.
func abs(value float64) float64 {
	if value < 0 {
		return -value
	}

	return value
}

// absMoney is labs.
func absMoney(value int64) int64 {
	if value < 0 {
		return -value
	}

	return value
}

// formatFloat renders a float the way PHP interpolates one: "100.5", never
// "100.500000". The oracle's percentage messages embed the raw double.
func formatFloat(value float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.10f", value), "0"), ".")
}

// FormatWhole renders whole Rupiah the way number_format($x, 0, ',', '.')
// does: "8.000.000". Amounts reaching this message are whole by
// construction (the zero-amount stages are rejected before it).
func FormatWhole(amount money.Money) string {
	return formatID(amount)
}

// formatID renders whole Rupiah the way number_format($x, 0, ',', '.')
// does: "8.000.000". Amounts reaching this message are whole by
// construction (the zero-amount stages are rejected before it).
func formatID(amount money.Money) string {
	digits := amount.Decimal()
	if dot := strings.Index(digits, "."); dot >= 0 {
		digits = digits[:dot]
	}
	digits = strings.TrimPrefix(digits, "-")

	var out []byte
	for i, c := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, byte(c))
	}

	return string(out)
}
