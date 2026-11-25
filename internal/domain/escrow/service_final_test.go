package escrow

// Final branch closure: itoa negatives, basisPoints sign/empty/overflow,
// isDigits empty, SplitRetention moneyOf error, ForTermin half-written path,
// Record validate error, recordFee FeeOn + fee-record errors, Available and
// Summary store-error edges. Money stays integer minor units, no floats.

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

func TestFinalItoaSignBranches(t *testing.T) {
	if got := itoa(0); got != "0" {
		t.Fatalf("itoa(0) = %q", got)
	}
	if got := itoa(42); got != "42" {
		t.Fatalf("itoa(42) = %q", got)
	}
	if got := itoa(-7); got != "-7" {
		t.Fatalf("itoa(-7) = %q", got)
	}
	if got := itoa(-123456); got != "-123456" {
		t.Fatalf("itoa(-123456) = %q", got)
	}
	// Negative basis points render through the same helper (production clamps
	// them to zero before formatting; this pins the helper's raw spelling).
	if got := formatBasisPointsAsPercentage(-150); got != "-1,-5" {
		t.Fatalf("format(-150bp) = %q, want -1,-5", got)
	}
	if got := formatBasisPointsAsPercentage(0); got != "0" {
		t.Fatalf("format(0bp) = %q", got)
	}
	if got := formatBasisPointsAsPercentage(100); got != "1" {
		t.Fatalf("format(100bp) = %q", got)
	}
}

func TestFinalBasisPointsSignEmptyOverflow(t *testing.T) {
	// Explicit plus sign strips and parses.
	if got, err := basisPoints("+5"); err != nil || got != 500 {
		t.Fatalf("basisPoints(+5) = (%d, %v)", got, err)
	}
	if got, err := basisPoints("+.5"); err != nil || got != 50 {
		t.Fatalf("basisPoints(+.5) = (%d, %v)", got, err)
	}
	// Bare fraction borrows a zero whole.
	if got, err := basisPoints(".5"); err != nil || got != 50 {
		t.Fatalf("basisPoints(.5) = (%d, %v)", got, err)
	}
	// Empty whole and fraction refuse.
	for _, input := range []string{".", "+", "-", ""} {
		if input == "" {
			// Empty is the configured-off zero, not an error.
			if got, err := basisPoints(""); err != nil || got != 0 {
				t.Fatalf("basisPoints(empty) = (%d, %v)", got, err)
			}
			continue
		}
		if _, err := basisPoints(input); err == nil {
			t.Fatalf("basisPoints(%q) accepted garbage", input)
		}
	}
	// Overflow guard trips before the multiply.
	huge := "99999999999999999999"
	if _, err := basisPoints(huge); err == nil {
		t.Fatalf("basisPoints(huge) accepted an unrepresentable percentage")
	}
}

func TestFinalIsDigitsEmpty(t *testing.T) {
	if isDigits("") {
		t.Fatal("isDigits(empty) must be false")
	}
	if isDigits("12a") {
		t.Fatal("isDigits(12a) must be false")
	}
	if !isDigits("007") {
		t.Fatal("isDigits(007) must hold")
	}
}

func TestFinalSplitRetentionMoneyOfError(t *testing.T) {
	huge := money.New(math.MaxInt64, money.DefaultCurrency)
	if _, err := SplitRetention(huge, "100"); err == nil {
		t.Fatal("SplitRetention(huge, 100%) accepted an overflowing retention")
	} else if !errors.Is(err, money.ErrAmountOverflow) {
		t.Fatalf("err = %v, want ErrAmountOverflow", err)
	}
}

func TestFinalMoneyOfOverflow(t *testing.T) {
	huge := money.New(math.MaxInt64, money.DefaultCurrency)
	if _, err := moneyOf(huge, 10000); err == nil {
		t.Fatal("moneyOf(huge) accepted an overflow")
	} else if !errors.Is(err, money.ErrAmountOverflow) {
		t.Fatalf("err = %v, want ErrAmountOverflow", err)
	}
	// Zero basis points stay exact.
	fee, err := moneyOf(minor(1000), 0)
	if err != nil {
		t.Fatal(err)
	}
	if !fee.IsZero() {
		t.Fatalf("moneyOf zero bp = %d, want 0", fee.Int())
	}
}

func TestFinalForTerminHalfWrittenNetDerivation(t *testing.T) {
	// Half-written split derives net as gross minus retention.
	split, err := ForTermin(minor(100_000_000), minor(0), minor(5_000_000))
	if err != nil {
		t.Fatal(err)
	}
	if split.Net.Int() != 95_000_000 || split.Retention.Int() != 5_000_000 {
		t.Fatalf("half-written = net %d ret %d", split.Net.Int(), split.Retention.Int())
	}
}

func TestFinalRecordRefusesInvalidMovement(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)
	if _, err := service.Record(context.Background(), Movement{
		ProjectID: 0, Type: TxPayment, Amount: minor(1000), Title: "Bad",
		Ref: Ref{Type: RefBidArsitek, ID: 9},
	}); !errors.Is(err, ErrInvalidMovement) {
		t.Fatalf("Record(invalid) = %v, want ErrInvalidMovement", err)
	}
	if len(store.entries) != 0 {
		t.Fatal("invalid movement wrote a row")
	}
}

func TestFinalRecordPaymentLogsBadFeePercent(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithPlatformFeePercent("not-a-percent"))
	service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))

	result, err := service.RecordPayment(context.Background(), paymentMovement(10_000_000))
	if err != nil {
		t.Fatalf("payment with bad fee percent refused: %v", err)
	}
	if !result.Written {
		t.Fatal("payment was not written")
	}
	if !result.Fee.IsZero() {
		t.Fatalf("bad-percent fee = %d, want zero (payment stands)", result.Fee.Int())
	}
}

func TestFinalRecordPaymentLogsUnwritableFee(t *testing.T) {
	// Ceiling exactly covers the payment, so the 1% fee overdraws and its
	// record fails. The payment stands; the shortfall is logged, not charged.
	store := fundedStore(10_000_000)
	service := newServiceWith(t, store, WithPlatformFeePercent("1"))
	service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))

	result, err := service.RecordPayment(context.Background(), paymentMovement(10_000_000))
	if err != nil {
		t.Fatalf("payment refused when fee unwritable: %v", err)
	}
	if !result.Written {
		t.Fatal("payment was not written")
	}
	if !result.Fee.IsZero() {
		t.Fatalf("unwritable fee = %d, want zero", result.Fee.Int())
	}
	// Only the payment row exists; the fee row was refused.
	if got := len(store.entriesOf(TxPlatformFee)); got != 0 {
		t.Fatalf("fee rows = %d, want 0 (refused fee writes nothing)", got)
	}
}

func TestFinalRecordPaymentDuplicateFeeIsZero(t *testing.T) {
	// A fee row already exists for the payment's reference: the fee guard
	// reports duplicate, so the payment stands with a zero fee.
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithPlatformFeePercent("1"))
	service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))

	payment := paymentMovement(10_000_000)
	fee, err := FeeOn(payment.Amount, "1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Record(context.Background(), Movement{
		ProjectID: payment.ProjectID, Type: TxPlatformFee, Amount: fee,
		Title: FeeTitle("1", payment.Title), Ref: payment.Ref, Actor: payment.Actor,
	}); err != nil {
		t.Fatal(err)
	}

	result, err := service.RecordPayment(context.Background(), payment)
	if err != nil {
		t.Fatalf("payment with duplicate fee refused: %v", err)
	}
	if !result.Written {
		t.Fatal("payment was not written")
	}
	if !result.Fee.IsZero() {
		t.Fatalf("duplicate fee = %d, want zero (charged once)", result.Fee.Int())
	}
}

// finalFailStore fails one read while succeeding the others, to cover the
// Available/Summary store-error edges without a database.
type finalFailStore struct {
	inner       *memoryStore
	failCeiling bool
	failPaid    bool
	failCommit  bool
	paidCur     string
	commitCur   string
}

func (s *finalFailStore) RecordMovement(ctx context.Context, m Movement) (Outcome, error) {
	return s.inner.RecordMovement(ctx, m)
}
func (s *finalFailStore) Ceiling(ctx context.Context, projectID int64) (money.Money, error) {
	if s.failCeiling {
		return money.Money{}, errors.New("ceiling unavailable")
	}
	return s.inner.Ceiling(ctx, projectID)
}
func (s *finalFailStore) Disbursed(ctx context.Context, projectID int64) (money.Money, error) {
	if s.failPaid {
		return money.Money{}, errors.New("paid unavailable")
	}
	if s.paidCur != "" {
		return money.New(10, s.paidCur), nil
	}
	return s.inner.Disbursed(ctx, projectID)
}
func (s *finalFailStore) DisbursedByOwner(ctx context.Context, ownerIDs []int64) (map[int64]money.Money, error) {
	return s.inner.DisbursedByOwner(ctx, ownerIDs)
}
func (s *finalFailStore) CommittedUnpaid(ctx context.Context, projectID int64) (money.Money, error) {
	if s.failCommit {
		return money.Money{}, errors.New("committed unavailable")
	}
	if s.commitCur != "" {
		return money.New(5, s.commitCur), nil
	}
	return s.inner.CommittedUnpaid(ctx, projectID)
}

func finalService(t *testing.T, inner *memoryStore, fail *finalFailStore) *Service {
	t.Helper()
	service := NewService(fail, WithFreezeGate(&fakeGate{}))
	service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))
	return service
}

func TestFinalAvailableStoreErrors(t *testing.T) {
	inner := fundedStore(100_000_000)

	ceilingFail := &finalFailStore{inner: inner, failCeiling: true}
	if _, err := finalService(t, inner, ceilingFail).Available(context.Background(), 1); err == nil {
		t.Fatal("Available accepted a ceiling error")
	}

	paidFail := &finalFailStore{inner: inner, failPaid: true}
	if _, err := finalService(t, inner, paidFail).Available(context.Background(), 1); err == nil {
		t.Fatal("Available accepted a disbursed error")
	}
}

func TestFinalSummaryStoreErrors(t *testing.T) {
	inner := fundedStore(100_000_000)

	paidFail := &finalFailStore{inner: inner, failPaid: true}
	if _, err := finalService(t, inner, paidFail).Summary(context.Background(), 1); err == nil {
		t.Fatal("Summary accepted a disbursed error")
	}

	commitFail := &finalFailStore{inner: inner, failCommit: true}
	if _, err := finalService(t, inner, commitFail).Summary(context.Background(), 1); err == nil {
		t.Fatal("Summary accepted a committed error")
	}

	// paid in USD against an IDR ceiling fails the ceiling-minus-paid step.
	mismatchPaid := &finalFailStore{inner: inner, paidCur: "USD"}
	if _, err := finalService(t, inner, mismatchPaid).Summary(context.Background(), 1); err == nil {
		t.Fatal("Summary accepted a currency-mismatched paid total")
	}

	// paid and committed in different currencies fail the allocated step.
	mismatchCommit := &finalFailStore{inner: inner, commitCur: "USD"}
	if _, err := finalService(t, inner, mismatchCommit).Summary(context.Background(), 1); err == nil {
		t.Fatal("Summary accepted a currency-mismatched committed total")
	}
}
