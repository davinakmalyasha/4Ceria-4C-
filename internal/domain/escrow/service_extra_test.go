package escrow

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

// FreezeGate fail-closed, insufficient funds, idempotent duplicates and
// actor recording — beyond the I38 pattern already in service_test.go.

func TestFreezeGateBlocksPaymentFeeAndRetentionButNotRefundOrDeposit(t *testing.T) {
	frozen := &fakeGate{open: true, disputeID: 42}

	blocked := []Movement{
		{ProjectID: 1, Type: TxPayment, Amount: minor(10_000_000), Title: "Pay", Ref: Ref{Type: RefBidArsitek, ID: 9}},
		{ProjectID: 1, Type: TxPlatformFee, Amount: minor(100_000), Title: "Fee", Ref: Ref{Type: RefBidArsitek, ID: 9}},
		{ProjectID: 1, Type: TxRetentionRelease, Amount: minor(50_000), Title: "Retention", Ref: Ref{Type: RefPaymentTermin, ID: 3}},
	}

	for _, movement := range blocked {
		t.Run("frozen blocks "+string(movement.Type), func(t *testing.T) {
			store := fundedStore(100_000_000)
			service := newServiceWith(t, store, WithFreezeGate(frozen))
			if _, err := service.Record(context.Background(), movement); err == nil {
				t.Fatalf("Record(%s) was accepted while frozen", movement.Type)
			}
			if len(store.entries) != 0 {
				t.Fatalf("a %s row was written while frozen", movement.Type)
			}
		})
	}

	// Refund bypasses the freeze per I38 (it IS the arbitration outcome).
	t.Run("frozen allows refund", func(t *testing.T) {
		store := fundedStore(100_000_000)
		unfrozen := newServiceWith(t, store)
		if _, err := unfrozen.Record(context.Background(), paymentMovement(40_000_000)); err != nil {
			t.Fatal(err)
		}
		service := newServiceWith(t, store, WithFreezeGate(frozen))
		refund := Movement{
			ProjectID: 1, Type: TxRefund, Amount: minor(-10_000_000),
			Title: "Dispute #42 refund", Ref: Ref{Type: RefDispute, ID: 42},
			Reverses: Ref{Type: RefBidArsitek, ID: 9},
		}
		if _, err := service.Record(context.Background(), refund); err != nil {
			t.Fatalf("refund refused while frozen: %v", err)
		}
	})

	// Deposit bypasses the freeze (adding funds never harms arbitration).
	t.Run("frozen allows deposit", func(t *testing.T) {
		store := fundedStore(100_000_000)
		service := newServiceWith(t, store, WithFreezeGate(frozen))
		if _, err := service.Record(context.Background(), Movement{
			ProjectID: 1, Type: TxDeposit, Amount: minor(5_000_000), Title: "Top up",
		}); err != nil {
			t.Fatalf("deposit refused while frozen: %v", err)
		}
	})

	// adjustment_down is structural, not a disbursement: no freeze check.
	t.Run("adjustment down does not consult the gate", func(t *testing.T) {
		store := fundedStore(100_000_000)
		gate := &fakeGate{open: true, disputeID: 42}
		service := newServiceWith(t, store, WithFreezeGate(gate))
		if _, err := service.Record(context.Background(), Movement{
			ProjectID: 1, Type: TxAdjustmentDown, Amount: minor(1_000_000), Title: "Budget cut",
		}); err != nil {
			t.Fatalf("adjustment_down refused while frozen: %v", err)
		}
	})
}

func TestMissingFreezeGateRefusesEveryDisbursement(t *testing.T) {
	types := []Movement{
		{ProjectID: 1, Type: TxPayment, Amount: minor(1_000), Title: "Pay", Ref: Ref{Type: RefBidArsitek, ID: 9}},
		{ProjectID: 1, Type: TxPlatformFee, Amount: minor(100), Title: "Fee", Ref: Ref{Type: RefBidArsitek, ID: 9}},
		{ProjectID: 1, Type: TxRetentionRelease, Amount: minor(100), Title: "Ret", Ref: Ref{Type: RefPaymentTermin, ID: 3}},
	}

	for _, movement := range types {
		store := fundedStore(100_000_000)
		service := NewService(store)
		service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))
		if _, err := service.Record(context.Background(), movement); err == nil {
			t.Fatalf("Record(%s) accepted with no freeze gate", movement.Type)
		}
	}

	// Refund and deposit stay open with no gate: fail-closed must not
	// deadlock resolution or funding.
	for _, movement := range []Movement{
		{ProjectID: 1, Type: TxRefund, Amount: minor(-1_000), Title: "Refund",
			Ref: Ref{Type: RefDispute, ID: 1}, Reverses: Ref{Type: RefBidArsitek, ID: 9}},
		{ProjectID: 1, Type: TxDeposit, Amount: minor(1_000), Title: "Deposit"},
	} {
		store := fundedStore(100_000_000)
		service := NewService(store)
		service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))
		if _, err := service.Record(context.Background(), movement); err != nil {
			t.Fatalf("Record(%s) with no gate refused: %v", movement.Type, err)
		}
	}
}

func TestInsufficientFundsRefusesEverySpend(t *testing.T) {
	spends := []Movement{
		{ProjectID: 1, Type: TxPayment, Amount: minor(60_000_000), Title: "Pay", Ref: Ref{Type: RefBidArsitek, ID: 9}},
		{ProjectID: 1, Type: TxPlatformFee, Amount: minor(60_000_000), Title: "Fee", Ref: Ref{Type: RefBidArsitek, ID: 9}},
		{ProjectID: 1, Type: TxRetentionRelease, Amount: minor(60_000_000), Title: "Ret", Ref: Ref{Type: RefPaymentTermin, ID: 3}},
	}

	for _, movement := range spends {
		store := fundedStore(50_000_000)
		service := newServiceWith(t, store)
		if _, err := service.Record(context.Background(), movement); err == nil {
			t.Fatalf("Record(%s) overdrew the escrow", movement.Type)
		}
		if len(store.entries) != 0 {
			t.Fatalf("a %s row was written for a refused movement", movement.Type)
		}
	}
}

func TestIdempotentDuplicateAcrossReferences(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	first := paymentMovement(20_000_000)
	if _, err := service.Record(context.Background(), first); err != nil {
		t.Fatal(err)
	}

	// Same reference, same type: duplicate.
	second, err := service.Record(context.Background(), first)
	if err != nil {
		t.Fatal(err)
	}
	if !second.Duplicate || second.Written {
		t.Fatalf("same reference not reported as duplicate: %+v", second)
	}

	// Same reference, different type: a new row (payment vs fee share a
	// reference by design).
	fee := Movement{ProjectID: 1, Type: TxPlatformFee, Amount: minor(200_000),
		Title: "Platform fee (1%): Architect base fee", Ref: first.Ref}
	feeResult, err := service.Record(context.Background(), fee)
	if err != nil {
		t.Fatal(err)
	}
	if !feeResult.Written || feeResult.Duplicate {
		t.Fatalf("fee sharing the payment reference not written: %+v", feeResult)
	}

	// Different reference id: a new row.
	other := paymentMovement(20_000_000)
	other.Ref = Ref{Type: RefBidArsitek, ID: 10}
	otherResult, err := service.Record(context.Background(), other)
	if err != nil {
		t.Fatal(err)
	}
	if !otherResult.Written {
		t.Fatal("a distinct reference was reported as duplicate")
	}
}

func TestActorIsRecordedOnTheLedgerRow(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	userID := int64(77)
	movement := paymentMovement(10_000_000)
	movement.Actor = Actor{UserID: &userID, Role: "owner"}

	if _, err := service.Record(context.Background(), movement); err != nil {
		t.Fatal(err)
	}
	if len(store.entries) != 1 {
		t.Fatalf("%d rows, want 1", len(store.entries))
	}
	entry := store.entries[0]
	if entry.actor.UserID == nil || *entry.actor.UserID != 77 {
		t.Fatalf("actor user id not recorded: %+v", entry.actor)
	}
	if entry.actor.Role != "owner" {
		t.Fatalf("actor role = %q, want owner", entry.actor.Role)
	}
	if entry.actor.IsSystem() {
		t.Fatal("a human actor reported as system")
	}

	// A system movement records no human.
	system := Movement{ProjectID: 1, Type: TxDeposit, Amount: minor(1_000), Title: "Opening"}
	if _, err := service.Record(context.Background(), system); err != nil {
		t.Fatal(err)
	}
	if !store.entries[1].actor.IsSystem() {
		t.Fatalf("system movement has actor: %+v", store.entries[1].actor)
	}
}

func TestActorIsSystem(t *testing.T) {
	var nilActor Actor
	if !nilActor.IsSystem() {
		t.Fatal("nil UserID must be system")
	}
	userID := int64(1)
	human := Actor{UserID: &userID, Role: "owner"}
	if human.IsSystem() {
		t.Fatal("human actor reported as system")
	}
}

func TestCeilingPaidTotalAndAvailable(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store)

	ceiling, err := service.Ceiling(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if ceiling.Int() != 100_000_000 {
		t.Fatalf("ceiling = %d", ceiling.Int())
	}

	paid, err := service.PaidTotal(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if !paid.IsZero() {
		t.Fatalf("paid = %d, want 0", paid.Int())
	}

	if _, err := service.Record(context.Background(), paymentMovement(30_000_000)); err != nil {
		t.Fatal(err)
	}

	paid, err = service.PaidTotal(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if paid.Int() != 30_000_000 {
		t.Fatalf("paid = %d, want 30000000", paid.Int())
	}

	available, err := service.Available(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if available.Int() != 70_000_000 {
		t.Fatalf("available = %d, want 70000000", available.Int())
	}

	// Unknown project surfaces the store error on every read.
	for name, fn := range map[string]func() error{
		"ceiling": func() error { _, err := service.Ceiling(context.Background(), 99); return err },
		"paid":    func() error { _, err := service.PaidTotal(context.Background(), 99); return err },
		"avail":   func() error { _, err := service.Available(context.Background(), 99); return err },
		"summary": func() error { _, err := service.Summary(context.Background(), 99); return err },
	} {
		if err := fn(); !errors.Is(err, ErrProjectNotFound) {
			t.Fatalf("%s on unknown project = %v, want ErrProjectNotFound", name, err)
		}
	}
}

func TestAssertNoOpenDisputeGate(t *testing.T) {
	// No gate installed: the pre-check passes (Record itself still refuses
	// disbursements fail-closed).
	open := NewService(newMemoryStore())
	if err := open.AssertNoOpenDispute(context.Background(), 1); err != nil {
		t.Fatalf("nil gate refused: %v", err)
	}

	closed := newServiceWith(t, newMemoryStore(), WithFreezeGate(&fakeGate{}))
	if err := closed.AssertNoOpenDispute(context.Background(), 1); err != nil {
		t.Fatalf("closed gate refused: %v", err)
	}

	frozen := newServiceWith(t, newMemoryStore(), WithFreezeGate(&fakeGate{open: true, disputeID: 9}))
	if err := frozen.AssertNoOpenDispute(context.Background(), 1); err == nil {
		t.Fatal("open dispute passed the pre-check")
	}
}

func TestServiceOptionsCurrencyAndLogger(t *testing.T) {
	store := fundedStore(100_000_000)
	service := newServiceWith(t, store,
		WithCurrency("USD"),
		WithLogger(slog.Default()),
		WithPlatformFeePercent("1"),
	)

	// A duplicate payment reports a zero fee in the service currency.
	if _, err := service.Record(context.Background(), paymentMovement(10_000_000)); err != nil {
		t.Fatal(err)
	}
	second, err := service.RecordPayment(context.Background(), paymentMovement(10_000_000))
	if err != nil {
		t.Fatal(err)
	}
	if !second.Duplicate {
		t.Fatal("second payment not reported as duplicate")
	}
	if second.Fee.Currency() != "USD" {
		t.Fatalf("duplicate fee currency = %q, want USD", second.Fee.Currency())
	}
}

func TestFeeTitleFallsBackOnBadPercent(t *testing.T) {
	title := FeeTitle("not-a-percent", "Architect base fee")
	if title != "Platform fee: Architect base fee" {
		t.Fatalf("bad-percent title = %q", title)
	}
}

func TestFeeOnRefusesBadPercent(t *testing.T) {
	if _, err := FeeOn(minor(1000), "not-a-percent"); err == nil {
		t.Fatal("FeeOn accepted garbage percent")
	}
	// Zero and negative percents are valid config meaning "off".
	for _, percent := range []string{"0", "-3", ""} {
		fee, err := FeeOn(minor(1000), percent)
		if err != nil {
			t.Fatalf("FeeOn(%q) = %v", percent, err)
		}
		if !fee.IsZero() {
			t.Fatalf("FeeOn(%q) = %d, want zero", percent, fee.Int())
		}
	}
}

func TestValidateTable(t *testing.T) {
	valid := paymentMovement(1000)

	cases := []struct {
		name    string
		mutate  func(Movement) Movement
		wantErr bool
	}{
		{"valid", func(m Movement) Movement { return m }, false},
		{"zero project", func(m Movement) Movement { m.ProjectID = 0; return m }, true},
		{"negative project", func(m Movement) Movement { m.ProjectID = -1; return m }, true},
		{"unknown type", func(m Movement) Movement { m.Type = "bribe"; return m }, true},
		{"zero amount", func(m Movement) Movement { m.Amount = minor(0); return m }, true},
		{"empty title", func(m Movement) Movement { m.Title = ""; return m }, true},
		{"negative payment", func(m Movement) Movement { m.Amount = minor(-100); return m }, true},
		{"positive refund", func(m Movement) Movement {
			m.Type = TxRefund
			m.Amount = minor(100)
			m.Ref = Ref{Type: RefDispute, ID: 1}
			m.Reverses = Ref{Type: RefBidArsitek, ID: 9}
			return m
		}, true},
		{"refund without reverses", func(m Movement) Movement {
			m.Type = TxRefund
			m.Amount = minor(-100)
			m.Ref = Ref{Type: RefDispute, ID: 1}
			return m
		}, true},
		{"payment with reverses", func(m Movement) Movement {
			m.Reverses = Ref{Type: RefBidArsitek, ID: 9}
			return m
		}, true},
		{"deposit with reference", func(m Movement) Movement {
			m.Type = TxDeposit
			m.Ref = Ref{Type: RefBidArsitek, ID: 9}
			return m
		}, true},
		{"payment without reference", func(m Movement) Movement { m.Ref = Ref{}; return m }, true},
		{"unknown reference key", func(m Movement) Movement {
			m.Ref = Ref{Type: "bid.unknown", ID: 1}
			return m
		}, true},
		{"reference without id", func(m Movement) Movement {
			m.Ref = Ref{Type: RefBidArsitek, ID: 0}
			return m
		}, true},
		{"reverses unknown key", func(m Movement) Movement {
			m.Type = TxRefund
			m.Amount = minor(-100)
			m.Ref = Ref{Type: RefDispute, ID: 1}
			m.Reverses = Ref{Type: "bid.unknown", ID: 9}
			return m
		}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Validate(tc.mutate(valid))
			if tc.wantErr && err == nil {
				t.Fatal("invalid movement was accepted")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("valid movement refused: %v", err)
			}
			if err != nil && !errors.Is(err, ErrInvalidMovement) {
				t.Fatalf("err = %v, want ErrInvalidMovement", err)
			}
		})
	}
}

func TestFeePercentParsing(t *testing.T) {
	cases := []struct {
		input string
		want  int64
	}{
		{"", 0},
		{"0", 0},
		{"1", 100},
		{"5.555", 556},
		{"-5", 0},
		{"150", 10000},
		{"100.6", 10000},
		{"  7.75 ", 775},
	}
	for _, tc := range cases {
		got, err := FeePercent(tc.input)
		if err != nil {
			t.Fatalf("FeePercent(%q) = %v", tc.input, err)
		}
		if got != tc.want {
			t.Fatalf("FeePercent(%q) = %d, want %d", tc.input, got, tc.want)
		}
	}
	if _, err := FeePercent("five"); err == nil {
		t.Fatal("FeePercent accepted garbage")
	}
}

func TestSplitRetentionRefusesBadPercent(t *testing.T) {
	if _, err := SplitRetention(minor(1000), "five"); err == nil {
		t.Fatal("SplitRetention accepted garbage percent")
	}
}

func TestForTerminCurrencyMismatchOnRetention(t *testing.T) {
	_, err := ForTermin(
		money.MustOf("100", "IDR"),
		money.MustOf("95", "IDR"),
		money.MustOf("5", "USD"),
	)
	if err == nil {
		t.Fatal("retention in another currency was accepted")
	}
}

func TestSummaryCurrencyMismatchSurfaces(t *testing.T) {
	store := newMemoryStore()
	store.ceiling[1] = 100
	store.owners[1] = 7
	broken := &mismatchStore{inner: store}
	service := NewService(broken, WithFreezeGate(&fakeGate{}))
	service.logger = slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelError + 1}))
	if _, err := service.Summary(context.Background(), 1); err == nil {
		t.Fatal("summary with mismatched currencies was accepted")
	}
	if _, err := service.Available(context.Background(), 1); err == nil {
		t.Fatal("available with mismatched currencies was accepted")
	}
}

// mismatchStore returns a disbursement in another currency so the
// ceiling-minus-disbursed subtraction fails loudly rather than mixing.
type mismatchStore struct {
	inner *memoryStore
}

func (s *mismatchStore) RecordMovement(ctx context.Context, m Movement) (Outcome, error) {
	return s.inner.RecordMovement(ctx, m)
}
func (s *mismatchStore) Ceiling(ctx context.Context, projectID int64) (money.Money, error) {
	return money.New(100, "IDR"), nil
}
func (s *mismatchStore) Disbursed(ctx context.Context, projectID int64) (money.Money, error) {
	return money.New(10, "USD"), nil
}
func (s *mismatchStore) DisbursedByOwner(ctx context.Context, ownerIDs []int64) (map[int64]money.Money, error) {
	return map[int64]money.Money{}, nil
}
func (s *mismatchStore) CommittedUnpaid(ctx context.Context, projectID int64) (money.Money, error) {
	return money.Zero("IDR"), nil
}
