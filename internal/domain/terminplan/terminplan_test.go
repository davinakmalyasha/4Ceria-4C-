package terminplan

import (
	"strings"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// idr builds an IDR amount from a major-unit literal. The test panics on a
// malformed literal for the same reason MustOf exists: a bad constant is a
// programming error, not a runtime condition.
func idr(amount string) money.Money {
	return money.MustOf(amount, "IDR")
}

func TestAssertKnownRole(t *testing.T) {
	for _, role := range []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep", "project_manager"} {
		if err := AssertKnownRole(role); err != nil {
			t.Errorf("AssertKnownRole(%q) = %v, want nil", role, err)
		}
	}

	for _, role := range []string{"", "user", "admin", "plumber", "Arsitek"} {
		err := AssertKnownRole(role)
		if err == nil {
			t.Errorf("AssertKnownRole(%q) = nil, want an error", role)
			continue
		}

		if !strings.Contains(err.Error(), "licensed roles") {
			t.Errorf("AssertKnownRole(%q) = %q, want the licensed-roles sentence", role, err)
		}
	}

	// The message names the registry in order.
	err := AssertKnownRole("user")
	if err == nil || !strings.Contains(err.Error(), "arsitek, kontraktor, notaris, interior, structural, mep, project_manager") {
		t.Errorf("AssertKnownRole(user) = %v, want the full role list", err)
	}
}

func TestContractValue(t *testing.T) {
	calc := idr("8000000.00")
	price := idr("5.00")

	// calculated_total wins — a percentage bid's price IS the percentage.
	if got := ContractValue(&calc, &price); got == nil || got.Decimal() != "8000000.00" {
		t.Errorf("ContractValue(calc, price) = %v, want 8000000.00", got)
	}

	if got := ContractValue(nil, &price); got == nil || got.Decimal() != "5.00" {
		t.Errorf("ContractValue(nil, price) = %v, want 5.00", got)
	}

	if got := ContractValue(nil, nil); got != nil {
		t.Errorf("ContractValue(nil, nil) = %v, want nil (no accepted bid)", got)
	}
}

func TestAssertPercentagesWithinWhole(t *testing.T) {
	cases := []struct {
		name        string
		percentages []float64
		wantErr     bool
		wantMessage string
	}{
		{"exact", []float64{50, 50}, false, ""},
		{"single hundred", []float64{100}, false, ""},
		{"within tolerance high", []float64{100.005}, false, ""},
		{"within tolerance low", []float64{99.995}, false, ""},
		{"incomplete plan is legitimate", []float64{30, 30}, false, ""},
		{"empty plan is legitimate", nil, false, ""},
		{"over by more than tolerance", []float64{100.02}, true, "more than 100%"},
		{"well over", []float64{60, 50}, true, "more than 100%"},
		{"under by more than tolerance", []float64{99.98}, false, ""},
	}

	for _, tc := range cases {
		err := AssertPercentagesWithinWhole(tc.percentages)
		if (err != nil) != tc.wantErr {
			t.Errorf("%s: AssertPercentagesWithinWhole(%v) = %v, wantErr %v", tc.name, tc.percentages, err, tc.wantErr)
			continue
		}

		if tc.wantErr && !strings.Contains(err.Error(), tc.wantMessage) {
			t.Errorf("%s: error %q does not contain %q", tc.name, err, tc.wantMessage)
		}
	}
}

func TestAssertTotalWithinContractValue(t *testing.T) {
	contract := idr("8000000.00")

	cases := []struct {
		name    string
		total   string
		wantErr bool
	}{
		{"exact", "8000000.00", false},
		{"under", "7999000.00", false},
		{"tolerance boundary", "8001000.00", false},
		{"one minor over tolerance", "8001000.01", true},
		{"well over", "9000000.00", true},
	}

	for _, tc := range cases {
		err := AssertTotalWithinContractValue(&contract, idr(tc.total))
		if (err != nil) != tc.wantErr {
			t.Errorf("%s: total %s = %v, wantErr %v", tc.name, tc.total, err, tc.wantErr)
		}
	}

	// No accepted contract yet: nothing to bound against.
	if err := AssertTotalWithinContractValue(nil, idr("999999999.00")); err != nil {
		t.Errorf("nil contract = %v, want nil", err)
	}

	zero := idr("0.00")
	if err := AssertTotalWithinContractValue(&zero, idr("999999999.00")); err != nil {
		t.Errorf("zero contract = %v, want nil", err)
	}

	// The message carries both figures in decimal form.
	err := AssertTotalWithinContractValue(&contract, idr("9000000.00"))
	if err == nil || !strings.Contains(err.Error(), "9000000.00") || !strings.Contains(err.Error(), "8000000.00") {
		t.Errorf("over-limit error = %v, want both figures", err)
	}
}

func TestAssertPlanComplete(t *testing.T) {
	contract := idr("8000000.00")
	stages := func() []Stage {
		return []Stage{
			{Percentage: 50, Amount: idr("4000000.00")},
			{Percentage: 50, Amount: idr("4000000.00")},
		}
	}

	if err := AssertPlanComplete(&contract, stages()); err != nil {
		t.Errorf("complete plan = %v, want nil", err)
	}

	if err := AssertPlanComplete(&contract, nil); err == nil || !strings.Contains(err.Error(), "no payment schedule") {
		t.Errorf("empty plan = %v, want the no-schedule error", err)
	}

	short := stages()
	short[1].Percentage = 40
	if err := AssertPlanComplete(&contract, short); err == nil || !strings.Contains(err.Error(), "must total 100%") {
		t.Errorf("90%% plan = %v, want the 100%% error", err)
	}

	light := stages()
	light[1].Amount = idr("3999000.00")
	if err := AssertPlanComplete(&contract, light); err != nil {
		t.Errorf("1000 short = %v, want nil (tolerance is Rp 1000)", err)
	}

	lighter := stages()
	lighter[1].Amount = idr("3998999.00")
	err := AssertPlanComplete(&contract, lighter)
	if err == nil {
		t.Fatalf("1001 short = nil, want the mismatch error")
	}

	// number_format($x, 0, ',', '.'): thousands separated by dots.
	if !strings.Contains(err.Error(), "7.998.999") || !strings.Contains(err.Error(), "8.000.000") {
		t.Errorf("mismatch error = %q, want dotted-thousands figures", err)
	}

	// No contract: the percentage check still binds.
	if err := AssertPlanComplete(nil, stages()); err != nil {
		t.Errorf("complete plan without contract = %v, want nil", err)
	}
}

func TestAssertNoInFlightDrift(t *testing.T) {
	stored := []Stage{
		{ID: 1, Label: "DP", Status: "verifying", Percentage: 30, Amount: idr("2400000.00")},
		{ID: 2, Label: "Final", Status: "pending", Percentage: 70, Amount: idr("5600000.00")},
	}

	// Untouched resubmission passes.
	same := []Stage{
		{ID: 1, Percentage: 30, Amount: idr("2400000.00")},
		{ID: 2, Percentage: 70, Amount: idr("5600000.00")},
	}
	if err := AssertNoInFlightDrift(stored, same); err != nil {
		t.Errorf("unchanged = %v, want nil", err)
	}

	// A stage with no id, or an unknown id, is unchecked.
	fresh := []Stage{{Percentage: 10, Amount: idr("800000.00")}}
	if err := AssertNoInFlightDrift(stored, fresh); err != nil {
		t.Errorf("new stage = %v, want nil", err)
	}

	// Half a Rupiah of drift is noise; more is a changed deal.
	noise := []Stage{{ID: 1, Percentage: 30, Amount: idr("2400000.49")}}
	if err := AssertNoInFlightDrift(stored, noise); err != nil {
		t.Errorf("0.49 drift = %v, want nil", err)
	}

	changed := []Stage{{ID: 1, Percentage: 30, Amount: idr("2400000.51")}}
	err := AssertNoInFlightDrift(stored, changed)
	if err == nil || !strings.Contains(err.Error(), `"DP"`) || !strings.Contains(err.Error(), "verifying") {
		t.Errorf("0.51 drift = %v, want the stage/state sentence", err)
	}

	repct := []Stage{{ID: 1, Percentage: 30.02, Amount: idr("2400000.00")}}
	err = AssertNoInFlightDrift(stored, repct)
	if err == nil || !strings.Contains(err.Error(), "percentage") {
		t.Errorf("0.02 pct drift = %v, want the percentage sentence", err)
	}

	// A non-in-flight stage (pending) is not in the existing set when the
	// caller passes only verifying/paid rows — nothing to check.
	if err := AssertNoInFlightDrift(stored[:1], []Stage{{ID: 2, Percentage: 70, Amount: idr("1.00")}}); err != nil {
		t.Errorf("unknown id = %v, want nil", err)
	}
}

func TestFormatID(t *testing.T) {
	cases := map[string]string{
		"8000000.00":   "8.000.000",
		"1000.00":      "1.000",
		"999.00":       "999",
		"123456789.00": "123.456.789",
		"25000000.00":  "25.000.000",
		"68000000.00":  "68.000.000",
		"850000000.00": "850.000.000",
		"101680345.00": "101.680.345",
	}

	for decimal, want := range cases {
		if got := formatID(idr(decimal)); got != want {
			t.Errorf("formatID(%s) = %q, want %q", decimal, got, want)
		}
	}
}
