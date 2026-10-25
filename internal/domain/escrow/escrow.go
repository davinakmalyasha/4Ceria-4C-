// Package escrow is the port of App\Services\ProjectFinancialService — the one
// writer of the project ledger.
//
// THE MODEL, IN ONE PARAGRAPH
// ---------------------------
// A project's escrow has a CEILING (`projects.budget`) and an OUTFLOW (the sum
// of the ledger's disbursement rows). `available = ceiling - outflow`. Only a
// `deposit` raises the ceiling and only an `adjustment_down` lowers it. The four
// disbursement types spend the ceiling WITHOUT moving it; counting them twice —
// once in the sum and once against the column — is the bug that made a project
// read "Rp 150 M left" while the server refused every payment (MONEY.md §2).
//
// WHY THE LISTS ARE METHODS AND NOT VARIABLES
// -------------------------------------------
// The PHP original exposed them as `public const` arrays, which is immutable in
// PHP. A Go `var []TxType` is appendable by any importer, and the whole point of
// these three lists is that they are agreed everywhere. Here they are unexported
// and read through predicates, so no caller can widen them by accident.
//
// THE THREE LISTS ANSWER THREE DIFFERENT QUESTIONS, and conflating them is how
// the balance went wrong four times:
//
//	Disbursement         What LEFT the escrow?
//	CeilingNeutral       What spent the escrow WITHOUT moving the ceiling?
//	ProfessionalEarning  What REACHED a professional?
//
// The first two happen to have the same members today. They are still separate
// predicates, because a future type may spend the ceiling and not count as a
// disbursement — and a reader who sees one function for both will "simplify"
// them the first time that happens.
package escrow

import (
	"errors"
	"fmt"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// TxType is a ledger movement type: the closed set of six the schema's
// `transaction_type` enum accepts (MONEY.md §4.2).
type TxType string

const (
	// TxDeposit raises the ceiling. It is never limited by the current balance.
	TxDeposit TxType = "deposit"

	// TxAdjustmentDown lowers the ceiling.
	TxAdjustmentDown TxType = "adjustment_down"

	// TxPayment is a disbursement to a professional.
	TxPayment TxType = "payment"

	// TxRefund is arbitration returning money to the client. It is the ONLY
	// negative movement, and it REVERSES a payment.
	TxRefund TxType = "refund"

	// TxPlatformFee is the platform's own revenue, itemised beside a payment.
	TxPlatformFee TxType = "platform_fee"

	// TxRetentionRelease pays out a stage's withheld retention after the
	// warranty expires.
	TxRetentionRelease TxType = "retention_release"
)

// disbursementTypes is what LEFT the escrow. `refund` rows are NEGATIVE and are
// part of the same sum: excluding them leaves refunded money permanently
// consumed, which is how a dispute could be resolved and the balance never move.
//
// `deposit` and `adjustment_down` are deliberately absent: they move the
// CEILING, and `available` is derived from the ceiling, so counting them as
// disbursements subtracts the same movement twice.
var disbursementTypes = map[TxType]struct{}{
	TxPayment:          {},
	TxRefund:           {},
	TxPlatformFee:      {},
	TxRetentionRelease: {},
}

// ceilingNeutralTypes spend the escrow without moving `projects.budget`.
//
// THIS IS THE LIST THAT PREVENTS THE DOUBLE CHARGE. The legacy test was
// `$type !== 'payment'`, which sent `platform_fee` and `retention_release` down
// the ceiling-decrement branch — and because both are also disbursements, the
// same rupiah was subtracted twice. A 1 % fee on a Rp 100 M project dropped the
// reported ceiling to Rp 99 M and the available balance to Rp 98 M.
var ceilingNeutralTypes = map[TxType]struct{}{
	TxPayment:          {},
	TxRefund:           {},
	TxPlatformFee:      {},
	TxRetentionRelease: {},
}

// professionalEarningsTypes is money that reached a PROFESSIONAL, for the
// public-facing figure `client_history.total_spent`.
//
// It is deliberately NARROWER than the disbursements: the platform fee is the
// platform's revenue, not the professional's income, and counting it would
// inflate a page anyone can read to flatter nobody. `retention_release` IS
// included — it is the professional's own withheld money finally reaching them.
var professionalEarningsTypes = map[TxType]struct{}{
	TxPayment:          {},
	TxRefund:           {},
	TxRetentionRelease: {},
}

// AllTypes returns the six types, in the legacy enum's order.
func AllTypes() []TxType {
	return []TxType{
		TxDeposit, TxAdjustmentDown, TxPayment,
		TxRefund, TxPlatformFee, TxRetentionRelease,
	}
}

// IsValid reports whether the type is one of the six.
func (t TxType) IsValid() bool {
	_, ok := disbursementTypes[t]
	if ok {
		return true
	}
	return t == TxDeposit || t == TxAdjustmentDown
}

// IsDisbursement reports whether the type counts as money leaving the escrow.
func (t TxType) IsDisbursement() bool {
	_, ok := disbursementTypes[t]
	return ok
}

// IsCeilingNeutral reports whether the type spends the escrow without moving
// the ceiling column.
func (t TxType) IsCeilingNeutral() bool {
	_, ok := ceilingNeutralTypes[t]
	return ok
}

// IsProfessionalEarning reports whether the type counts as income to a
// professional.
func (t TxType) IsProfessionalEarning() bool {
	_, ok := professionalEarningsTypes[t]
	return ok
}

// IsStructural reports whether the type MOVES the ceiling: `deposit` and
// `adjustment_down`, and nothing else.
func (t TxType) IsStructural() bool {
	return t == TxDeposit || t == TxAdjustmentDown
}

// ReferenceType names the thing a ledger row is ABOUT.
//
// It replaces the legacy `reference_model` VARCHAR, whose two spellings of the
// same model — `ProjectAddendum` and `App\Models\ProjectAddendum` — put the same
// Rp 5 500 000 payment in the ledger twice and understated a live escrow by
// exactly that amount. A registry key cannot be spelled two ways (ADR-0013).
type ReferenceType string

const (
	RefBidArsitek        ReferenceType = "bid.arsitek"
	RefBidKontraktor     ReferenceType = "bid.kontraktor"
	RefBidNotaris        ReferenceType = "bid.notaris"
	RefBidInterior       ReferenceType = "bid.interior"
	RefBidProjectManager ReferenceType = "bid.project_manager"
	RefBidStructural     ReferenceType = "bid.structural"
	RefBidMep            ReferenceType = "bid.mep"
	RefPaymentTermin     ReferenceType = "payment_termin"
	RefAddendum          ReferenceType = "addendum"
	RefMaterialOrder     ReferenceType = "material_order"
	RefMaterialQuote     ReferenceType = "material_quote"
	RefExternalVendor    ReferenceType = "external_vendor"
	RefDispute           ReferenceType = "dispute"
	RefChangeOrder       ReferenceType = "change_order"
)

// AllReferenceTypes returns the registry's fourteen keys.
func AllReferenceTypes() []ReferenceType {
	return []ReferenceType{
		RefBidArsitek, RefBidKontraktor, RefBidNotaris, RefBidInterior,
		RefBidProjectManager, RefBidStructural, RefBidMep,
		RefPaymentTermin, RefAddendum, RefMaterialOrder, RefMaterialQuote,
		RefExternalVendor, RefDispute, RefChangeOrder,
	}
}

// IsValid reports whether the key is in the registry.
func (r ReferenceType) IsValid() bool {
	for _, known := range AllReferenceTypes() {
		if r == known {
			return true
		}
	}
	return false
}

// Ref identifies what a movement is about: a registry key and the id in that
// key's `target_table`.
type Ref struct {
	Type ReferenceType
	ID   int64
}

// IsZero reports whether the movement names nothing. Structural movements
// (deposit, adjustment_down) must name nothing; every other movement must name
// something.
func (r Ref) IsZero() bool { return r.Type == "" && r.ID == 0 }

// Reversal is the thing a refund reverses — a payment.
//
// It is the same shape as Ref and a distinct name, because the two answer
// different questions: a refund's REF is the DISPUTE, and its REVERSAL is the
// PAYMENT. One payment can be refunded across several disputes, and one dispute
// gets at most one refund (MONEY.md §4.4).
type Reversal = Ref

// Actor is who moved the money.
//
// A nil UserID is a real answer, not missing data: a scheduled settlement, a
// reconciliation repair and a system-generated opening balance have no human
// actor, and a fabricated id would be worse than an honest absence.
type Actor struct {
	UserID *int64
	Role   string
}

// IsSystem reports whether no human caused the movement.
func (a Actor) IsSystem() bool { return a.UserID == nil }

// Movement is one ledger row to write.
type Movement struct {
	ProjectID int64
	Type      TxType
	Amount    money.Money
	Title     string

	// Ref is what the movement is ABOUT. Zero for structural movements.
	Ref Ref

	// Reverses is what a refund gives back. Zero for everything else.
	Reverses Reversal

	Actor Actor
}

// Outcome is what the store reports about one movement.
//
// Written=false means the unique guard rejected the row: an IDEMPOTENT SUCCESS
// with NO ceiling move and NO platform fee. Duplicate is the Go service's
// reading of that, and exists so a caller cannot mistake "already recorded" for
// "not recorded".
type Outcome struct {
	LedgerID  int64
	Written   bool
	Duplicate bool
	Ceiling   money.Money
	Available money.Money
}

// Result is what Record and RecordPayment return.
//
// CALLERS MUST INSPECT Written. Discarding the result is how a bid ends up
// `paid` with no ledger row behind it (AGENTS.md trap #12) — the defect that
// ProjectBudgetController's specialist-addendum branch shipped.
type Result struct {
	Written   bool
	Duplicate bool
	TxID      int64
	Ceiling   money.Money
	Available money.Money

	// Fee is the platform fee recorded BESIDE this payment. Zero when the fee
	// is disabled, when the payment was already recorded, or when recording the
	// fee failed (which does not fail the payment).
	Fee money.Money
}

// Summary is the canonical financial state of a project.
type Summary struct {
	Ceiling   money.Money
	Paid      money.Money
	Committed money.Money
	Available money.Money
	Allocated money.Money

	// PercentUsed is paid/ceiling as a percentage, or 0 when the ceiling is 0.
	PercentUsed float64
}

var (
	// ErrInsufficientFunds is returned when the escrow cannot cover a movement.
	// The HTTP layer renders it as the legacy 422.
	ErrInsufficientFunds = errors.New("the escrow cannot cover this movement")

	// ErrInvalidMovement is returned before anything is written.
	ErrInvalidMovement = errors.New("invalid ledger movement")

	// ErrProjectNotFound is returned for a project id the store does not know.
	ErrProjectNotFound = errors.New("project not found")

	// ErrFrozen is returned by the freeze gate while a dispute is open. The
	// gate's message carries the dispute id and title, as the legacy 422 does.
	ErrFrozen = errors.New("payments are frozen by an open dispute")

	// ErrNotAPayment is returned by RecordPayment for a movement that is not a
	// payment. RecordPayment exists to attach the platform fee, and a fee on a
	// deposit would be nonsense.
	ErrNotAPayment = errors.New("record payment requires a payment movement")
)

// Validate refuses a movement that would put a row in the ledger the schema
// would reject, BEFORE the database has to.
//
// The database still enforces all of this — pbt_amount_sign, pbt_reference_required,
// pbt_structural_no_reference, pbt_refund_reverses — and it must, because a
// privilege is what makes "never write a ledger row directly" true (ADR-0020).
// This is the readable error, not the only check.
func Validate(m Movement) error {
	if m.ProjectID <= 0 {
		return fmt.Errorf("%w: a movement needs a project", ErrInvalidMovement)
	}

	if !m.Type.IsValid() {
		return fmt.Errorf("%w: %q is not one of the six transaction types", ErrInvalidMovement, m.Type)
	}

	if m.Amount.IsZero() {
		return fmt.Errorf("%w: a movement needs a non-zero amount", ErrInvalidMovement)
	}

	if m.Title == "" {
		return fmt.Errorf("%w: a movement needs a title — the ledger is the audit trail", ErrInvalidMovement)
	}

	if m.Type == TxRefund {
		if !m.Amount.IsNegative() {
			return fmt.Errorf("%w: a refund is NEGATIVE; %s would inflate the ledger", ErrInvalidMovement, m.Amount.Decimal())
		}
		if m.Reverses.IsZero() {
			return fmt.Errorf("%w: a refund must name the payment it reverses", ErrInvalidMovement)
		}
	} else {
		if m.Amount.IsNegative() {
			return fmt.Errorf("%w: only a refund may be negative; %s is not a refund", ErrInvalidMovement, m.Amount.Decimal())
		}
		if !m.Reverses.IsZero() {
			return fmt.Errorf("%w: only a refund reverses something", ErrInvalidMovement)
		}
	}

	// A structural movement names NOTHING. Letting a deposit carry a reference
	// would put it into the dedupe key, and a project could then receive exactly
	// ONE deposit ever (MONEY.md §4.4).
	if m.Type.IsStructural() {
		if !m.Ref.IsZero() {
			return fmt.Errorf("%w: a %s must not name a reference", ErrInvalidMovement, m.Type)
		}
		return nil
	}

	// ...and everything else MUST name what it is about.
	if m.Ref.IsZero() {
		return fmt.Errorf("%w: a %s must name the reference it is about", ErrInvalidMovement, m.Type)
	}

	if !m.Ref.Type.IsValid() {
		return fmt.Errorf("%w: %q is not in the reference registry", ErrInvalidMovement, m.Ref.Type)
	}

	if m.Ref.ID <= 0 {
		return fmt.Errorf("%w: a reference needs an id", ErrInvalidMovement)
	}

	if m.Reverses.Type != "" && !m.Reverses.Type.IsValid() {
		return fmt.Errorf("%w: %q is not in the reference registry", ErrInvalidMovement, m.Reverses.Type)
	}

	return nil
}
