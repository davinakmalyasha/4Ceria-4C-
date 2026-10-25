package escrow

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// memoryStore mirrors `escrow.record_movement()` in Go so the service can be
// tested without a database. It enforces the SAME rules as the SQL function —
// the affordability check, the dedupe guard, the ceiling membership test — and
// it is deliberately a re-statement rather than a mock: a mock that answers
// "yes" to everything would test the service against nothing.
type memoryStore struct {
	ceiling   map[int64]int64
	owners    map[int64]int64
	committed map[int64]int64
	entries   []ledgerEntry
	nextID    int64
}

type ledgerEntry struct {
	project  int64
	txType   TxType
	amount   int64
	title    string
	ref      Ref
	reverses Reversal
	actor    Actor
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		ceiling:   map[int64]int64{},
		owners:    map[int64]int64{},
		committed: map[int64]int64{},
	}
}

func (s *memoryStore) RecordMovement(_ context.Context, movement Movement) (Outcome, error) {
	ceiling, ok := s.ceiling[movement.ProjectID]
	if !ok {
		return Outcome{}, ErrProjectNotFound
	}

	disbursed := s.disbursedFor(movement.ProjectID)
	available := ceiling - disbursed

	if movement.Type != TxDeposit && available < movement.Amount.Int() {
		return Outcome{}, errors.New("insufficient escrow")
	}

	if !movement.Ref.IsZero() {
		for _, entry := range s.entries {
			if entry.project == movement.ProjectID &&
				entry.txType == movement.Type &&
				entry.ref == movement.Ref {
				return Outcome{
					Written:   false,
					Duplicate: true,
					Ceiling:   minor(ceiling),
					Available: minor(available),
				}, nil
			}
		}
	}

	s.nextID++

	s.entries = append(s.entries, ledgerEntry{
		project:  movement.ProjectID,
		txType:   movement.Type,
		amount:   movement.Amount.Int(),
		title:    movement.Title,
		ref:      movement.Ref,
		reverses: movement.Reverses,
		actor:    movement.Actor,
	})

	if !movement.Type.IsCeilingNeutral() {
		if movement.Type == TxAdjustmentDown {
			s.ceiling[movement.ProjectID] -= movement.Amount.Int()
		} else {
			s.ceiling[movement.ProjectID] += movement.Amount.Int()
		}
	}

	ceiling = s.ceiling[movement.ProjectID]
	available = ceiling - s.disbursedFor(movement.ProjectID)

	return Outcome{
		LedgerID:  s.nextID,
		Written:   true,
		Ceiling:   minor(ceiling),
		Available: minor(available),
	}, nil
}

func (s *memoryStore) disbursedFor(projectID int64) int64 {
	var total int64

	for _, entry := range s.entries {
		if entry.project == projectID && entry.txType.IsDisbursement() {
			total += entry.amount
		}
	}

	return total
}

func (s *memoryStore) Ceiling(_ context.Context, projectID int64) (money.Money, error) {
	ceiling, ok := s.ceiling[projectID]
	if !ok {
		return money.Money{}, ErrProjectNotFound
	}

	return minor(ceiling), nil
}

func (s *memoryStore) Disbursed(_ context.Context, projectID int64) (money.Money, error) {
	if _, ok := s.ceiling[projectID]; !ok {
		return money.Money{}, ErrProjectNotFound
	}

	return minor(s.disbursedFor(projectID)), nil
}

func (s *memoryStore) DisbursedByOwner(_ context.Context, ownerIDs []int64) (map[int64]money.Money, error) {
	wanted := map[int64]bool{}
	for _, ownerID := range ownerIDs {
		wanted[ownerID] = true
	}

	result := map[int64]money.Money{}

	for _, entry := range s.entries {
		ownerID, ok := s.owners[entry.project]
		if !ok || !wanted[ownerID] || !entry.txType.IsProfessionalEarning() {
			continue
		}

		current := result[ownerID]
		result[ownerID] = minor(current.Int() + entry.amount)
	}

	return result, nil
}

func (s *memoryStore) CommittedUnpaid(_ context.Context, projectID int64) (money.Money, error) {
	return minor(s.committed[projectID]), nil
}

// entriesOf counts the ledger rows of a type.
func (s *memoryStore) entriesOf(txType TxType) []ledgerEntry {
	var found []ledgerEntry

	for _, entry := range s.entries {
		if entry.txType == txType {
			found = append(found, entry)
		}
	}

	return found
}

type fakeGate struct {
	open      bool
	disputeID int64
}

func (g *fakeGate) AssertNoOpenDispute(context.Context, int64) error {
	if !g.open {
		return nil
	}

	return errors.New("Payments are frozen: dispute #" + itoa(g.disputeID) + " is open on this project.")
}

func newServiceWith(t *testing.T, store *memoryStore, opts ...Option) *Service {
	t.Helper()

	service := NewService(store, opts...)
	service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))

	return service
}

// testWriter swallows log output; the test asserts on behaviour, not on prose.
type testWriter struct{ t *testing.T }

func (w testWriter) Write(p []byte) (int, error) { return len(p), nil }

func fundedStore(ceiling int64) *memoryStore {
	store := newMemoryStore()
	store.ceiling[1] = ceiling
	store.owners[1] = 7

	return store
}

func TestADepositRaisesTheCeilingAndTheBalance(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	result, err := service.Record(context.Background(), Movement{
		ProjectID: 1,
		Type:      TxDeposit,
		Amount:    minor(50_000_000),
		Title:     "Add funds",
	})
	if err != nil {
		t.Fatal(err)
	}

	if !result.Written {
		t.Fatal("the deposit was not written")
	}

	if result.Ceiling.Int() != 150_000_000 {
		t.Fatalf("ceiling = %d, want 150000000", result.Ceiling.Int())
	}

	if result.Available.Int() != 150_000_000 {
		t.Fatalf("available = %d, want 150000000", result.Available.Int())
	}
}

// TestAPaymentSpendsTheCeilingWithoutMovingIt is MONEY.md I2's whole point.
func TestAPaymentSpendsTheCeilingWithoutMovingIt(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	result, err := service.Record(context.Background(), paymentMovement(40_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if result.Ceiling.Int() != 100_000_000 {
		t.Fatalf("ceiling = %d, want 100000000 (a payment must not move it)", result.Ceiling.Int())
	}

	if result.Available.Int() != 60_000_000 {
		t.Fatalf("available = %d, want 60000000", result.Available.Int())
	}
}

func TestAPaymentBeyondTheAvailableBalanceIsRefused(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	_, err := service.Record(context.Background(), paymentMovement(100_000_001))
	if err == nil {
		t.Fatal("an overdraw was accepted")
	}

	if len(store.entries) != 0 {
		t.Fatalf("%d ledger rows were written for a refused movement", len(store.entries))
	}
}

func TestExactlyTheAvailableBalanceIsAccepted(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	result, err := service.Record(context.Background(), paymentMovement(100_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if result.Available.Int() != 0 {
		t.Fatalf("available = %d, want 0", result.Available.Int())
	}
}

// TestADuplicatePaymentIsAnIdempotentSuccess is MONEY.md I14.
func TestADuplicatePaymentIsAnIdempotentSuccess(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	if _, err := service.Record(context.Background(), paymentMovement(40_000_000)); err != nil {
		t.Fatal(err)
	}

	second, err := service.Record(context.Background(), paymentMovement(40_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if second.Written {
		t.Fatal("the duplicate reported Written")
	}

	if !second.Duplicate {
		t.Fatal("the duplicate did not report Duplicate")
	}

	if len(store.entries) != 1 {
		t.Fatalf("%d ledger rows, want 1", len(store.entries))
	}

	if second.Available.Int() != 60_000_000 {
		t.Fatalf("available = %d, want 60000000 — the duplicate moved money", second.Available.Int())
	}
}

// TestTheFeeIsASeparateRowSharingTheReference is MONEY.md I33.
func TestTheFeeIsASeparateRowSharingTheReference(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithPlatformFeePercent("1"))

	result, err := service.RecordPayment(context.Background(), paymentMovement(40_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if result.Fee.Int() != 400_000 {
		t.Fatalf("fee = %d, want 400000", result.Fee.Int())
	}

	fees := store.entriesOf(TxPlatformFee)
	if len(fees) != 1 {
		t.Fatalf("%d fee rows, want 1", len(fees))
	}

	if fees[0].ref != (Ref{Type: RefBidArsitek, ID: 9}) {
		t.Fatalf("the fee's reference is %+v, want the payment's", fees[0].ref)
	}

	if fees[0].title != "Platform fee (1%): Architect base fee" {
		t.Fatalf("the fee title is %q", fees[0].title)
	}

	// The payment and the fee both spend the escrow, and the ceiling has not
	// moved: 100 - 40 - 0.4 = 59.6.
	if result.Ceiling.Int() != 100_000_000 {
		t.Fatalf("ceiling = %d, want 100000000", result.Ceiling.Int())
	}

	if result.Available.Int() != 59_600_000 {
		t.Fatalf("available = %d, want 59600000", result.Available.Int())
	}
}

// TestTheFeeIsChargedOncePerPayment is MONEY.md I36's dedupe.
func TestTheFeeIsChargedOncePerPayment(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithPlatformFeePercent("1"))

	if _, err := service.RecordPayment(context.Background(), paymentMovement(40_000_000)); err != nil {
		t.Fatal(err)
	}

	second, err := service.RecordPayment(context.Background(), paymentMovement(40_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if second.Fee.Int() != 0 {
		t.Fatalf("the duplicate charged a fee of %d", second.Fee.Int())
	}

	if len(store.entriesOf(TxPlatformFee)) != 1 {
		t.Fatalf("%d fee rows, want 1", len(store.entriesOf(TxPlatformFee)))
	}
}

func TestTheFeeIsOffByDefaultAndWritesNothing(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	result, err := service.RecordPayment(context.Background(), paymentMovement(40_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if !result.Fee.IsZero() {
		t.Fatalf("fee = %d, want zero", result.Fee.Int())
	}

	if len(store.entriesOf(TxPlatformFee)) != 0 {
		t.Fatal("a fee row was written while the fee is off")
	}
}

// TestAFeeThatCannotBeRecordedDoesNotFailThePayment is MONEY.md I37.
func TestAFeeThatCannotBeRecordedDoesNotFailThePayment(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithPlatformFeePercent("100"))

	// The payment takes 60 %, and a 100 % fee on it does not fit in the 40 %
	// that remains.
	result, err := service.RecordPayment(context.Background(), paymentMovement(60_000_000))
	if err != nil {
		t.Fatalf("the payment failed because of the fee: %v", err)
	}

	if !result.Written {
		t.Fatal("the payment was not written")
	}

	if !result.Fee.IsZero() {
		t.Fatalf("fee = %d, want zero (it could not be recorded)", result.Fee.Int())
	}

	if len(store.entriesOf(TxPlatformFee)) != 0 {
		t.Fatal("a fee row was written that the escrow could not cover")
	}
}

// TestTheFreezeGateBlocksAPayment is MONEY.md I38.
func TestTheFreezeGateBlocksAPayment(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithFreezeGate(&fakeGate{open: true, disputeID: 42}))

	_, err := service.RecordPayment(context.Background(), paymentMovement(40_000_000))
	if err == nil {
		t.Fatal("a payment was accepted while a dispute is open")
	}

	if len(store.entries) != 0 {
		t.Fatal("a ledger row was written while the freeze was on")
	}
}

// TestTheFreezeGateDoesNotBlockARefund is deliberate: the refund IS the
// resolution, so a gate that refused it would make arbitration impossible.
func TestTheFreezeGateDoesNotBlockARefund(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithFreezeGate(&fakeGate{open: true, disputeID: 42}))

	paymentResult, err := service.Record(context.Background(), paymentMovement(40_000_000))
	if err != nil {
		t.Fatal(err)
	}

	if !paymentResult.Written {
		t.Fatal("the payment was not written")
	}

	refund := Movement{
		ProjectID: 1,
		Type:      TxRefund,
		Amount:    minor(-40_000_000),
		Title:     "Dispute #42 refund",
		Ref:       Ref{Type: RefDispute, ID: 42},
		Reverses:  Ref{Type: RefBidArsitek, ID: 9},
	}

	result, err := service.Record(context.Background(), refund)
	if err != nil {
		t.Fatalf("the refund was refused while the dispute it resolves is open: %v", err)
	}

	if !result.Written {
		t.Fatal("the refund was not written")
	}

	if result.Available.Int() != 100_000_000 {
		t.Fatalf("available = %d, want the full ceiling again", result.Available.Int())
	}
}

// TestARefundRestoresTheAvailableBalance is MONEY.md I4: a negative refund
// row is part of the disbursement sum, so the balance comes back.
func TestARefundRestoresTheAvailableBalance(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	if _, err := service.Record(context.Background(), paymentMovement(40_000_000)); err != nil {
		t.Fatal(err)
	}

	available, err := service.Available(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}

	if available.Int() != 60_000_000 {
		t.Fatalf("available = %d, want 60000000", available.Int())
	}

	refund := Movement{
		ProjectID: 1,
		Type:      TxRefund,
		Amount:    minor(-25_000_000),
		Title:     "Partial refund",
		Ref:       Ref{Type: RefDispute, ID: 42},
		Reverses:  Ref{Type: RefBidArsitek, ID: 9},
	}

	if _, err := service.Record(context.Background(), refund); err != nil {
		t.Fatal(err)
	}

	available, err = service.Available(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}

	if available.Int() != 85_000_000 {
		t.Fatalf("available = %d, want 85000000", available.Int())
	}
}

func TestRecordPaymentRefusesSomethingThatIsNotAPayment(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	_, err := service.RecordPayment(context.Background(), Movement{
		ProjectID: 1,
		Type:      TxDeposit,
		Amount:    minor(1_000_000),
		Title:     "A deposit",
	})

	if !errors.Is(err, ErrNotAPayment) {
		t.Fatalf("err = %v, want ErrNotAPayment", err)
	}
}

// TestSummary is MONEY.md I10: `committed` is informational and does NOT
// reduce `available`.
func TestSummary(t *testing.T) {
	store := fundedStore(100_000_000)
	store.committed[1] = 10_000_000
	service := newServiceWith(t, store)

	if _, err := service.Record(context.Background(), paymentMovement(40_000_000)); err != nil {
		t.Fatal(err)
	}

	summary, err := service.Summary(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}

	if summary.Ceiling.Int() != 100_000_000 {
		t.Errorf("ceiling = %d", summary.Ceiling.Int())
	}

	if summary.Paid.Int() != 40_000_000 {
		t.Errorf("paid = %d", summary.Paid.Int())
	}

	if summary.Available.Int() != 60_000_000 {
		t.Errorf("available = %d, want 60000000 — committed must NOT reduce it", summary.Available.Int())
	}

	if summary.Committed.Int() != 10_000_000 {
		t.Errorf("committed = %d", summary.Committed.Int())
	}

	if summary.Allocated.Int() != 50_000_000 {
		t.Errorf("allocated = %d, want 50000000", summary.Allocated.Int())
	}

	if summary.PercentUsed != 40 {
		t.Errorf("percent used = %v, want 40", summary.PercentUsed)
	}
}

func TestSummaryOfAnEmptyEscrowDoesNotDivideByZero(t *testing.T) {
	store := fundedStore(0)
	service := newServiceWith(t, store)

	summary, err := service.Summary(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}

	if summary.PercentUsed != 0 {
		t.Fatalf("percent used = %v, want 0", summary.PercentUsed)
	}
}

// TestPaidTotalByOwnerExcludesThePlatformFee is MONEY.md I3 on a PUBLIC figure.
func TestPaidTotalByOwnerExcludesThePlatformFee(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store, WithPlatformFeePercent("1"))

	if _, err := service.RecordPayment(context.Background(), paymentMovement(40_000_000)); err != nil {
		t.Fatal(err)
	}

	totals, err := service.PaidTotalByOwner(context.Background(), []int64{7})
	if err != nil {
		t.Fatal(err)
	}

	if totals[7].Int() != 40_000_000 {
		t.Fatalf("total spent = %d, want 40000000 — the platform fee is not the professional's income",
			totals[7].Int())
	}
}

func TestPaidTotalByOwnerWithNoOwnersDoesNotQuery(t *testing.T) {
	service := newServiceWith(t, &memoryStore{})

	totals, err := service.PaidTotalByOwner(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(totals) != 0 {
		t.Fatalf("%d owners returned", len(totals))
	}
}

func TestAnUnknownProjectIsReported(t *testing.T) {
	service := newServiceWith(t, &memoryStore{})

	_, err := service.Record(context.Background(), paymentMovement(1_000))
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("err = %v, want ErrProjectNotFound", err)
	}
}

func paymentMovement(units int64) Movement {
	return Movement{
		ProjectID: 1,
		Type:      TxPayment,
		Amount:    minor(units),
		Title:     "Architect base fee",
		Ref:       Ref{Type: RefBidArsitek, ID: 9},
	}
}
