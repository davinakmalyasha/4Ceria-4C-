package escrow

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// Store is the persistence the service needs. It is an INTERFACE rather than a
// concrete *pgxpool because the invariants this package exists to protect —
// idempotency, the ceiling move, the affordability refusal — must be testable
// without a database, and because the writer is the SQL function
// `escrow.record_movement()`, not Go.
//
// The production adapter calls that function in ONE round trip. Reimplementing
// the write path in Go would put a second writer in the system, which is
// exactly what the SECURITY DEFINER function and its revoked INSERT privilege
// exist to prevent (ADR-0020).
type Store interface {
	// RecordMovement calls escrow.record_movement() and reports what it did.
	// `Written=false` is an IDEMPOTENT SUCCESS, never an error.
	RecordMovement(ctx context.Context, m Movement) (Outcome, error)

	// Ceiling is `projects.budget`, the escrow's upper bound.
	Ceiling(ctx context.Context, projectID int64) (money.Money, error)

	// Disbursed is the sum of the four disbursement types. Refund rows are
	// negative and are part of the sum.
	Disbursed(ctx context.Context, projectID int64) (money.Money, error)

	// DisbursedByOwner is Disbursed grouped by project owner, for the
	// public-facing "total spent with this professional".
	DisbursedByOwner(ctx context.Context, ownerIDs []int64) (map[int64]money.Money, error)

	// CommittedUnpaid is what the parties promised but have not paid:
	// approved-unpaid addenda and unlocked payment stages. It is INFORMATIONAL
	// and does not reduce Available.
	CommittedUnpaid(ctx context.Context, projectID int64) (money.Money, error)
}

// FreezeGate is DisputeService::assertNoOpenDispute.
//
// It is a separate interface because the dispute module owns it, and because a
// payment path that silently skipped it is the defect MONEY.md I38 records.
type FreezeGate interface {
	AssertNoOpenDispute(ctx context.Context, projectID int64) error
}

// Service is the one writer of the ledger.
type Service struct {
	store      Store
	freeze     FreezeGate
	feePercent string
	currency   string
	logger     *slog.Logger
}

// Option configures a Service.
type Option func(*Service)

// WithFreezeGate installs the dispute freeze check. Without it, RecordPayment
// does NOT check the freeze, and a caller that skips it reopens I38.
func WithFreezeGate(gate FreezeGate) Option {
	return func(s *Service) { s.freeze = gate }
}

// WithPlatformFeePercent sets the fee percentage. Default "0" — off.
func WithPlatformFeePercent(percent string) Option {
	return func(s *Service) { s.feePercent = percent }
}

// WithCurrency sets the currency of the figures the service synthesises itself
// (a zero fee, a zero retention). Stored figures carry their own.
func WithCurrency(currency string) Option {
	return func(s *Service) { s.currency = currency }
}

// WithLogger sets where a fee that could not be recorded is reported.
func WithLogger(logger *slog.Logger) Option {
	return func(s *Service) { s.logger = logger }
}

// NewService builds the escrow service.
func NewService(store Store, opts ...Option) *Service {
	service := &Service{
		store:      store,
		feePercent: "0",
		currency:   money.DefaultCurrency,
		logger:     slog.Default(),
	}

	for _, opt := range opts {
		opt(service)
	}

	return service
}

// Record writes ONE movement. It is the only writer of the ledger.
//
//	error                     => nothing was written; the transaction rolled back
//	Result.Duplicate == true  => already recorded: an idempotent success with no
//	                             ceiling move and no platform fee
//
// CALLERS MUST INSPECT Result.Written before treating a payment as made. A
// discarded result is how a bid ends up `paid` with no ledger row behind it
// (AGENTS.md trap #12).
func (s *Service) Record(ctx context.Context, movement Movement) (Result, error) {
	if err := Validate(movement); err != nil {
		return Result{}, err
	}

	outcome, err := s.store.RecordMovement(ctx, movement)
	if err != nil {
		return Result{}, err
	}

	return Result{
		Written:   outcome.Written,
		Duplicate: outcome.Duplicate,
		TxID:      outcome.LedgerID,
		Ceiling:   outcome.Ceiling,
		Available: outcome.Available,
		Fee:       money.Zero(s.currency),
	}, nil
}

// RecordPayment writes a payment and, when enabled, ITEMISES THE PLATFORM FEE
// BESIDE IT.
//
// The fee is a SEPARATE ledger row of type `platform_fee` sharing the payment's
// reference — never folded into the payment figure. Folding it in would make
// the professional's obligation look larger than it is, and the two rows could
// no longer be reconciled against each other.
//
// A payment that was already recorded attracts no fee, and a fee that cannot be
// recorded does not fail the payment: the professional is paid, and the
// platform's own shortfall is logged rather than charged to them.
func (s *Service) RecordPayment(ctx context.Context, movement Movement) (Result, error) {
	if movement.Type != TxPayment {
		return Result{}, fmt.Errorf("%w: got %s", ErrNotAPayment, movement.Type)
	}

	if s.freeze != nil {
		if err := s.freeze.AssertNoOpenDispute(ctx, movement.ProjectID); err != nil {
			return Result{}, err
		}
	}

	result, err := s.Record(ctx, movement)
	if err != nil {
		return Result{}, err
	}

	if !result.Written || movement.Ref.IsZero() {
		return result, nil
	}

	fee, feeResult, err := s.recordFee(ctx, movement)
	if err != nil {
		// The payment stands. Reported so the shortfall is visible rather than
		// silent — a fee nobody can see is a fee nobody can reconcile.
		s.logger.WarnContext(ctx, "the platform fee was not recorded",
			"project_id", movement.ProjectID,
			"reference_type", movement.Ref.Type,
			"reference_id", movement.Ref.ID,
			"error", err,
		)

		return result, nil
	}

	result.Fee = fee

	if fee.IsPositive() {
		// The fee is a SECOND movement, so the balance the caller sees must be
		// the one AFTER it. Reporting the payment's own balance would tell them
		// they have 400 000 more than they do.
		result.Available = feeResult.Available
	}

	return result, nil
}

// recordFee writes the fee row that belongs beside a payment.
func (s *Service) recordFee(ctx context.Context, payment Movement) (money.Money, Result, error) {
	fee, err := FeeOn(payment.Amount, s.feePercent)
	if err != nil {
		return money.Money{}, Result{}, err
	}

	if !fee.IsPositive() {
		return money.Zero(s.currency), Result{}, nil
	}

	feeResult, err := s.Record(ctx, Movement{
		ProjectID: payment.ProjectID,
		Type:      TxPlatformFee,
		Amount:    fee,
		Title:     FeeTitle(s.feePercent, payment.Title),
		Ref:       payment.Ref,
		Actor:     payment.Actor,
	})
	if err != nil {
		return money.Money{}, Result{}, err
	}

	if !feeResult.Written {
		// The unique guard found an existing fee for this reference. That is a
		// success: the fee is charged once per payment.
		return money.Zero(s.currency), Result{}, nil
	}

	return fee, feeResult, nil
}

// AssertNoOpenDispute is the freeze gate, for a caller that needs to refuse
// before it does other work (uploading a proof, opening a payment form).
func (s *Service) AssertNoOpenDispute(ctx context.Context, projectID int64) error {
	if s.freeze == nil {
		return nil
	}

	return s.freeze.AssertNoOpenDispute(ctx, projectID)
}

// Ceiling is the escrow's upper bound.
func (s *Service) Ceiling(ctx context.Context, projectID int64) (money.Money, error) {
	return s.store.Ceiling(ctx, projectID)
}

// PaidTotal is what the ledger says has left the escrow, net of refunds.
func (s *Service) PaidTotal(ctx context.Context, projectID int64) (money.Money, error) {
	return s.store.Disbursed(ctx, projectID)
}

// Available is what may still be disbursed. Every write path must respect it.
func (s *Service) Available(ctx context.Context, projectID int64) (money.Money, error) {
	ceiling, err := s.store.Ceiling(ctx, projectID)
	if err != nil {
		return money.Money{}, err
	}

	disbursed, err := s.store.Disbursed(ctx, projectID)
	if err != nil {
		return money.Money{}, err
	}

	return ceiling.Subtract(disbursed)
}

// PaidTotalByOwner is the professional-earnings figure grouped by project
// owner, keyed by user id.
//
// It uses PROFESSIONAL_EARNINGS_TYPES, not the disbursements: a platform fee is
// the platform's revenue, and counting it would inflate a figure on a page
// anyone can read.
func (s *Service) PaidTotalByOwner(ctx context.Context, ownerIDs []int64) (map[int64]money.Money, error) {
	if len(ownerIDs) == 0 {
		return map[int64]money.Money{}, nil
	}

	return s.store.DisbursedByOwner(ctx, ownerIDs)
}

// Summary is the canonical project financial state. Every surface — the budget
// dashboard, the project brief, the owner summary — reads THIS rather than
// re-deriving its own numbers.
//
// The float `PercentUsed` is the one figure that stays a float, because it is a
// ratio rather than money; every amount is exact.
func (s *Service) Summary(ctx context.Context, projectID int64) (Summary, error) {
	ceiling, err := s.store.Ceiling(ctx, projectID)
	if err != nil {
		return Summary{}, err
	}

	paid, err := s.store.Disbursed(ctx, projectID)
	if err != nil {
		return Summary{}, err
	}

	committed, err := s.store.CommittedUnpaid(ctx, projectID)
	if err != nil {
		return Summary{}, err
	}

	available, err := ceiling.Subtract(paid)
	if err != nil {
		return Summary{}, err
	}

	allocated, err := paid.Add(committed)
	if err != nil {
		return Summary{}, err
	}

	percentUsed := 0.0
	if ceiling.IsPositive() {
		percentUsed = float64(paid.Int()) / float64(ceiling.Int()) * 100
	}

	return Summary{
		Ceiling:     ceiling,
		Paid:        paid,
		Committed:   committed,
		Available:   available,
		Allocated:   allocated,
		PercentUsed: percentUsed,
	}, nil
}
