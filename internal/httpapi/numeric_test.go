package httpapi

import (
	"math/big"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

// TestNumericTextKeepsTwoDecimals pins the Eloquent contract: a decimal
// column encodes as a two-place string, including exact zero.
//
// pgx decodes a stored 0.00 as {Int 0, Exp 0} — the scale PostgreSQL holds
// is lost in the binary transfer — while Eloquent reads MySQL's "0.00"
// string verbatim. Without the zero branch the port emits "0" where the
// oracle emits "0.00" (found live: a fresh professional's rate_harga).
func TestNumericTextKeepsTwoDecimals(t *testing.T) {
	zero := pgtype.Numeric{Int: big.NewInt(0), Exp: 0, Valid: true}
	if got := numericText(zero); got != "0.00" {
		t.Errorf("numericText(0) = %v, want 0.00", got)
	}

	scaled := pgtype.Numeric{Int: big.NewInt(150000), Exp: -2, Valid: true}
	if got := numericText(scaled); got != "1500.00" {
		t.Errorf("numericText(150000e-2) = %v, want 1500.00", got)
	}

	if got := numericText(pgtype.Numeric{Valid: false}); got != nil {
		t.Errorf("numericText(invalid) = %v, want nil", got)
	}
}
