package terminplan

import (
	"errors"
	"reflect"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// Closure for KnownRoles: the termin plan re-exports the registry in order
// rather than restating the list.
func TestCoverKnownRoles(t *testing.T) {
	got := KnownRoles()
	want := identity.Roles()

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("KnownRoles() = %v, want the identity registry %v", got, want)
	}

	found := false
	for _, role := range got {
		if role == identity.RoleProjectManager {
			found = true
		}
	}
	if !found {
		t.Fatalf("KnownRoles() = %v, want project_manager among them", got)
	}
}

// Closure for FormatWhole: whole-Rupiah figures render dotted-thousands.
func TestCoverFormatWhole(t *testing.T) {
	cases := map[string]string{
		"8000000.00": "8.000.000",
		"999.00":     "999",
		"1000.00":    "1.000",
	}

	for decimal, want := range cases {
		if got := FormatWhole(idr(decimal)); got != want {
			t.Errorf("FormatWhole(%s) = %q, want %q", decimal, got, want)
		}
	}
}

// Closure for AssertPlanComplete's accumulation-error branch: a stage
// denominated in another currency cannot join an IDR total.
func TestCoverPlanCompleteRefusesMixedCurrencies(t *testing.T) {
	contract := idr("8000000.00")
	stages := []Stage{
		{Percentage: 50, Amount: idr("4000000.00")},
		{Percentage: 50, Amount: money.MustOf("4000000", "USD")},
	}

	err := AssertPlanComplete(&contract, stages)
	if err == nil {
		t.Fatal("a plan mixing IDR and USD was accepted")
	}
	if !errors.Is(err, money.ErrCurrencyMismatch) {
		t.Fatalf("mixed-currency plan = %v, want ErrCurrencyMismatch", err)
	}
}

// Closure for absMoney's negative branch: an incoming amount a touch BELOW
// the stored one (within the half-sen noise band) takes the labs path and
// still passes.
func TestCoverNoInFlightDriftBelowStored(t *testing.T) {
	stored := []Stage{
		{ID: 1, Label: "DP", Status: "verifying", Percentage: 30, Amount: idr("2400000.00")},
	}

	// 30 minor units under the stored amount: negative diff, inside tolerance.
	under := []Stage{{ID: 1, Percentage: 30, Amount: idr("2399999.70")}}
	if err := AssertNoInFlightDrift(stored, under); err != nil {
		t.Fatalf("30-minor negative drift = %v, want nil (noise band)", err)
	}
}

// NOTE (coverage): AssertTotalWithinContractValue's IsGreaterThan error
// return is provably unreachable and is intentionally left uncovered. The
// limit is built with the total's own currency
// (OfMinor(..., total.Currency())), so the comparison never sees a mismatch —
// the only error IsGreaterThan can return.
