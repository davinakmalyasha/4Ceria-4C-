package escrow

import (
	"errors"
	"strings"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// TestTheThreeListsAreExactlyTheLegacyOnes pins MONEY.md I1, I2 and I3.
//
// The three lists are the escrow's vocabulary, and every historical balance
// defect in this codebase is a list that disagreed with another list.
func TestTheThreeListsAreExactlyTheLegacyOnes(t *testing.T) {
	wantDisbursement := map[TxType]bool{
		TxPayment: true, TxRefund: true, TxPlatformFee: true, TxRetentionRelease: true,
	}
	wantCeilingNeutral := map[TxType]bool{
		TxPayment: true, TxRefund: true, TxPlatformFee: true, TxRetentionRelease: true,
	}
	wantEarnings := map[TxType]bool{
		TxPayment: true, TxRefund: true, TxRetentionRelease: true,
	}

	for _, txType := range AllTypes() {
		if got, want := txType.IsDisbursement(), wantDisbursement[txType]; got != want {
			t.Errorf("%s.IsDisbursement() = %v, want %v", txType, got, want)
		}
		if got, want := txType.IsCeilingNeutral(), wantCeilingNeutral[txType]; got != want {
			t.Errorf("%s.IsCeilingNeutral() = %v, want %v", txType, got, want)
		}
		if got, want := txType.IsProfessionalEarning(), wantEarnings[txType]; got != want {
			t.Errorf("%s.IsProfessionalEarning() = %v, want %v", txType, got, want)
		}
	}
}

func TestOnlyDepositAndAdjustmentDownMoveTheCeiling(t *testing.T) {
	for _, txType := range AllTypes() {
		want := txType == TxDeposit || txType == TxAdjustmentDown
		if got := txType.IsStructural(); got != want {
			t.Errorf("%s.IsStructural() = %v, want %v", txType, got, want)
		}
	}
}

func TestAPlatformFeeIsNotAProfessionalEarning(t *testing.T) {
	if TxPlatformFee.IsProfessionalEarning() {
		t.Fatal("the platform fee counts as a professional's income; " +
			"it would inflate the public client_history.total_spent")
	}

	if !TxRetentionRelease.IsProfessionalEarning() {
		t.Fatal("the retention release is the professional's own withheld money")
	}
}

// TestAllTypesIsTheSixValueEnum is MONEY.md I19.
func TestAllTypesIsTheSixValueEnum(t *testing.T) {
	types := AllTypes()

	if len(types) != 6 {
		t.Fatalf("AllTypes() has %d values, want 6", len(types))
	}

	for _, txType := range types {
		if !txType.IsValid() {
			t.Errorf("%q is in AllTypes() but IsValid() says no", txType)
		}
	}

	if TxType("bogus").IsValid() {
		t.Error("a bogus type is valid")
	}
}

func TestTheReferenceRegistryHasFourteenKeys(t *testing.T) {
	references := AllReferenceTypes()

	if len(references) != 14 {
		t.Fatalf("AllReferenceTypes() has %d keys, want 14", len(references))
	}

	seen := map[ReferenceType]bool{}
	for _, reference := range references {
		if seen[reference] {
			t.Errorf("%q appears twice", reference)
		}
		seen[reference] = true

		if !reference.IsValid() {
			t.Errorf("%q is in the registry but IsValid() says no", reference)
		}
	}

	if ReferenceType("project_addendum").IsValid() {
		t.Error("the legacy plural table name is accepted as a registry key")
	}
}

func payment(amount string) Movement {
	return Movement{
		ProjectID: 1,
		Type:      TxPayment,
		Amount:    money.MustOf(amount, money.DefaultCurrency),
		Title:     "Architect base fee",
		Ref:       Ref{Type: RefBidArsitek, ID: 9},
	}
}

func TestValidateAcceptsAPayment(t *testing.T) {
	if err := Validate(payment("40000000")); err != nil {
		t.Fatalf("Validate() = %v", err)
	}
}

func TestValidateRefusesARefundThatIsNotNegative(t *testing.T) {
	movement := payment("1000")
	movement.Type = TxRefund
	movement.Reverses = Ref{Type: RefBidArsitek, ID: 9}

	err := Validate(movement)
	if !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}

	if !strings.Contains(err.Error(), "NEGATIVE") {
		t.Fatalf("the error does not say the refund must be negative: %v", err)
	}
}

func TestValidateRefusesARefundWithoutAReversal(t *testing.T) {
	movement := payment("1000")
	movement.Type = TxRefund
	movement.Amount = money.MustOf("-1000", money.DefaultCurrency)

	if err := Validate(movement); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}
}

func TestValidateRefusesADisbursementWithoutAReference(t *testing.T) {
	movement := payment("1000")
	movement.Ref = Ref{}

	if err := Validate(movement); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}
}

func TestValidateRefusesAStructuralMovementWithAReference(t *testing.T) {
	// A deposit that named a reference would enter the dedupe key, and the
	// project could then receive exactly one deposit ever (MONEY.md §4.4).
	movement := Movement{
		ProjectID: 1,
		Type:      TxDeposit,
		Amount:    money.MustOf("150000000", money.DefaultCurrency),
		Title:     "Opening budget",
		Ref:       Ref{Type: RefBidArsitek, ID: 9},
	}

	if err := Validate(movement); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}
}

func TestValidateRefusesAnUnknownReferenceKey(t *testing.T) {
	movement := payment("1000")
	movement.Ref = Ref{Type: "project_addendum", ID: 9}

	if err := Validate(movement); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}
}

func TestValidateRefusesAZeroAmount(t *testing.T) {
	movement := payment("0")

	if err := Validate(movement); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}
}

func TestValidateRefusesAMovementWithoutATitle(t *testing.T) {
	movement := payment("1000")
	movement.Title = ""

	if err := Validate(movement); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}
}

func TestValidateRefusesANegativeNonRefund(t *testing.T) {
	movement := payment("-1000")

	if err := Validate(movement); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Validate() = %v, want ErrInvalidMovement", err)
	}
}
