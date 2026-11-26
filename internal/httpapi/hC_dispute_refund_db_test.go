package httpapi

import (
	"context"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hCMkTermin(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID int64, label, status string, amountMinor int64) int64 {
	t.Helper()
	amt := formatMinor(amountMinor)
	var id int64
	// retention 0, net = amount
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, role_type, label, percentage, amount, retention_amount, net_amount, status, refunded_amount) VALUES ($1,'arsitek',$2,10,$3,0,$3,$4,0) RETURNING id`, projectID, label, amt, status).Scan(&id); err != nil {
		t.Fatalf("seed termin: %v", err)
	}
	return id
}

func hCSetDisputeLink(t *testing.T, ctx context.Context, pool *pgxpool.Pool, disputeID int64, typeKey string, paymentID *int64, disputed string) {
	t.Helper()
	var typeID *int64
	if typeKey != "" {
		var tid int64
		if err := pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key=$1`, typeKey).Scan(&tid); err != nil {
			t.Fatalf("registry %s: %v", typeKey, err)
		}
		typeID = &tid
	}
	if disputed == "" {
		_, err := pool.Exec(ctx, `UPDATE project_disputes SET payment_type_id=$2, payment_id=$3, disputed_amount=NULL WHERE id=$1`, disputeID, typeID, paymentID)
		if err != nil {
			t.Fatalf("link dispute: %v", err)
		}
	} else {
		_, err := pool.Exec(ctx, `UPDATE project_disputes SET payment_type_id=$2, payment_id=$3, disputed_amount=$4::numeric WHERE id=$1`, disputeID, typeID, paymentID, disputed)
		if err != nil {
			t.Fatalf("link dispute: %v", err)
		}
	}
}

func hCMkLedgerPayment(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID int64, typeKey string, refID int64, amountMinor int64, adminID int64) {
	t.Helper()
	var typeID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key=$1`, typeKey).Scan(&typeID); err != nil {
		t.Fatalf("registry: %v", err)
	}
	_, err := pool.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, reference_type_id, reference_id, transaction_date, actor_user_id, actor_role) VALUES ($1,'payment',$2,'hC paid',$3,$4,now(),$5,'admin')`, projectID, formatMinor(amountMinor), typeID, refID, adminID)
	if err != nil {
		t.Fatalf("ledger payment: %v", err)
	}
}

func hCCleanupProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, pid int64, owner int64) {
	t.Helper()
	pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
	pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
}

func TestHCDisputeActRefundBranches(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hCAdmin(t, ctx, pool)
	owner := hCMkUser(t, ctx, pool, "rfndown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)

	newSetup := func(title string) (int64, int64) {
		pid := hCMkProject(t, ctx, pool, owner, title)
		did := hCMkDispute(t, ctx, pool, pid, owner, title+" dispute")
		return pid, did
	}

	// 1. no link at all
	pid, did := newSetup("hC Refund NoLink")
	rec := hCCallAct(pool, &admin, itoaTest(did), `{"action":"record_refund","amount":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund nolink = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Link the disputed payment before recording a refund. Without it the platform cannot tell which payment is being returned." {
		t.Fatalf("refund nolink msg = %q", got)
	}
	var st0 string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_disputes WHERE id=$1`, did).Scan(&st0)
	if st0 != "open" {
		t.Fatalf("refund nolink mutated to %s", st0)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// 2. unknown FQCN (material_quote has no short code mapping)
	pid, did = newSetup("hC Refund Unknown")
	mqID := int64(999001)
	hCSetDisputeLink(t, ctx, pool, did, "material_quote", &mqID, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"record_refund","amount":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund unknown = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "The linked payment no longer exists on this project." {
		t.Fatalf("refund unknown msg = %q", got)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// 3. missing payment row (termin id that does not exist)
	pid, did = newSetup("hC Refund Missing")
	miss := int64(98989898)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &miss, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"record_refund","amount":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "The linked payment no longer exists on this project." {
		t.Fatalf("refund missing msg = %q", got)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// 4. never disbursed (termin exists, no ledger payment)
	pid, did = newSetup("hC Refund NeverPaid")
	term := hCMkTermin(t, ctx, pool, pid, "hC Termin Never", "accepted", 500000)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &term, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"record_refund","amount":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund neverpaid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "That payment was never disbursed, so there is nothing to refund." {
		t.Fatalf("refund neverpaid msg = %q", got)
	}
	// leave cleanup to end of this subcase
	// 5. exceeds refundable (paid 5000.00, ask 6000.00)
	hCMkLedgerPayment(t, ctx, pool, pid, "payment_termin", term, 500000, admin.id)
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"record_refund","amount":6000}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund exceeds = %d %s", rec.Code, rec.Body.String())
	}
	// Literal hand-written from fixture math: paid 500000 minor = "5000.00"
	if got := hCDecode(t, rec)["message"].(string); got != "Refund exceeds what is still refundable on this payment. Paid: Rp 5000.00, already refunded: Rp 0.00, refundable: Rp 5000.00." {
		t.Fatalf("refund exceeds msg = %q", got)
	}
	// 6. exceeds disputed amount (paid ok, disputed 10.00, ask 100.00)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &term, "10.00")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"record_refund","amount":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund disputed = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Refund (100.00) exceeds the disputed amount recorded on this dispute (10.00)." {
		t.Fatalf("refund disputed msg = %q", got)
	}
	// 7. partial refund happy (no flip: termin status accepted, partial amount)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &term, "9000.00")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"record_refund","amount":100}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("refund partial = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Refund recorded in the ledger. Dispute closed." {
		t.Fatalf("refund partial msg = %q", got)
	}
	// Post-state literals: dispute resolved, ledger -100.00, mirror 100.00, no flip
	var dst, dres string
	var dnotes *string
	var dby int64
	if err := pool.QueryRow(ctx, `SELECT status::text, resolution::text, resolution_notes, resolved_by FROM project_disputes WHERE id=$1`, did).Scan(&dst, &dres, &dnotes, &dby); err != nil {
		t.Fatalf("refund partial row: %v", err)
	}
	if dst != "resolved" || dres != "record_refund" || dby != admin.id {
		t.Fatalf("refund partial dispute = %s %s %d", dst, dres, dby)
	}
	var refAmt string
	var refType, revType int64
	var refID, revID int64
	if err := pool.QueryRow(ctx, `SELECT amount::text, reference_type_id, reference_id, reverses_type_id, reverses_id FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='refund' ORDER BY id DESC LIMIT 1`, pid).Scan(&refAmt, &refType, &refID, &revType, &revID); err != nil {
		t.Fatalf("refund ledger: %v", err)
	}
	// reference = dispute (type 13), reverses = termin payment (type 8)
	if refAmt != "-100.00" || refType != 13 || refID != did || revType != 8 || revID != term {
		t.Fatalf("refund ledger = %s %d/%d %d/%d", refAmt, refType, refID, revType, revID)
	}
	var mirrAmt, mirrSt string
	_ = pool.QueryRow(ctx, `SELECT refunded_amount::text, status::text FROM project_payment_termins WHERE id=$1`, term).Scan(&mirrAmt, &mirrSt)
	if mirrAmt != "100.00" || mirrSt != "accepted" {
		t.Fatalf("refund mirror = %s %s want 100.00/accepted", mirrAmt, mirrSt)
	}
	// dispute now closed; new dispute for full-refund flip path
	pid2 := hCMkProject(t, ctx, pool, owner, "hC Refund Full Project")
	did2 := hCMkDispute(t, ctx, pool, pid2, owner, "hC Refund Full dispute")
	term2 := hCMkTermin(t, ctx, pool, pid2, "hC Termin Full", "paid", 500000)
	hCSetDisputeLink(t, ctx, pool, did2, "payment_termin", &term2, "9000.00")
	hCMkLedgerPayment(t, ctx, pool, pid2, "payment_termin", term2, 500000, admin.id)
	rec = hCCallAct(pool, &admin, itoaTest(did2), `{"action":"record_refund","amount":5000}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("refund full = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Refund recorded in the ledger. Dispute closed." {
		t.Fatalf("refund full msg = %q", got)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, term2).Scan(&st)
	if st != "refunded" {
		t.Fatalf("refund flip status = %s", st)
	}
	// Full-refund post-state literals: ledger -5000.00, mirror 5000.00/refunded
	var fullAmt, fullMirr string
	_ = pool.QueryRow(ctx, `SELECT amount::text FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='refund' ORDER BY id DESC LIMIT 1`, pid2).Scan(&fullAmt)
	_ = pool.QueryRow(ctx, `SELECT refunded_amount::text FROM project_payment_termins WHERE id=$1`, term2).Scan(&fullMirr)
	if fullAmt != "-5000.00" || fullMirr != "5000.00" {
		t.Fatalf("refund full amounts = %s %s want -5000.00/5000.00", fullAmt, fullMirr)
	}
	var dst2, dres2 string
	_ = pool.QueryRow(ctx, `SELECT status::text, resolution::text FROM project_disputes WHERE id=$1`, did2).Scan(&dst2, &dres2)
	if dst2 != "resolved" || dres2 != "record_refund" {
		t.Fatalf("refund full dispute = %s %s", dst2, dres2)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	hCCleanupProject(t, ctx, pool, pid2, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id IN ($1,$2)`, did, did2)
	pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) // deferred already; idempotent
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
