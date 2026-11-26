package httpapi

import (
	"context"
	"net/http"
	"testing"
)

var _ = http.StatusOK

func TestHCDisputeActBidReleaseHappy(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hCAdmin(t, ctx, pool)
	owner := hCMkUser(t, ctx, pool, "bidrelown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	bidder := hCMkUser(t, ctx, pool, "bidrelbd", "arsitek")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, bidder)
	var profID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hC BidRel','verified') RETURNING id`, bidder).Scan(&profID); err != nil {
		t.Fatalf("profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, profID)

	// Bid happy release: bid status accepted, payment unpaid, budget sufficient
	pid := hCMkProject(t, ctx, pool, owner, "hC Bid Release Happy P")
	did := hCMkDispute(t, ctx, pool, pid, owner, "hC Bid Release Happy D")
	bidID := hCMkBidForRelease(t, ctx, pool, pid, bidder, profID, "arsitek", "accepted")
	hCSetDisputeLink(t, ctx, pool, did, "bid.arsitek", &bidID, "")
	rec := hCCallAct(pool, &admin, itoaTest(did), `{"action":"release_payment"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("bid release happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Payment released and recorded. Dispute closed." {
		t.Fatalf("bid release msg = %q", got)
	}
	var paySt, st string
	_ = pool.QueryRow(ctx, `SELECT payment_status::text, status::text FROM bids WHERE id=$1`, bidID).Scan(&paySt, &st)
	if paySt != "paid" || st != "active" {
		t.Fatalf("bid pay status = %s %s want paid/active", paySt, st)
	}
	// Bid release post-state literals: ledger 100000.00 (price 100000), dispute resolved
	var bAmt string
	var bRefType, bRefID int64
	_ = pool.QueryRow(ctx, `SELECT amount::text, reference_type_id, reference_id FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' ORDER BY id DESC LIMIT 1`, pid).Scan(&bAmt, &bRefType, &bRefID)
	if bAmt != "100000.00" || bRefType != 1 || bRefID != bidID {
		t.Fatalf("bid ledger = %s %d/%d want 100000.00 1/%d", bAmt, bRefType, bRefID, bidID)
	}
	var bdSt, bdRes string
	_ = pool.QueryRow(ctx, `SELECT status::text, resolution::text FROM project_disputes WHERE id=$1`, did).Scan(&bdSt, &bdRes)
	if bdSt != "resolved" || bdRes != "release_payment" {
		t.Fatalf("bid dispute = %s %s", bdSt, bdRes)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// Termin release with awaiting_payment bid activation
	pid2 := hCMkProject(t, ctx, pool, owner, "hC Termin Activate P")
	did2 := hCMkDispute(t, ctx, pool, pid2, owner, "hC Termin Activate D")
	term := hCMkTermin(t, ctx, pool, pid2, "hC Termin Act", "accepted", 200000)
	hCSetDisputeLink(t, ctx, pool, did2, "payment_termin", &term, "")
	// awaiting bid for arsitek role (termin role_type is arsitek)
	awaitID := hCMkBidForRelease(t, ctx, pool, pid2, bidder, profID, "arsitek", "awaiting_payment")
	rec2 := hCCallAct(pool, &admin, itoaTest(did2), `{"action":"release_payment"}`)
	if rec2.Code != http.StatusOK {
		t.Fatalf("termin activate = %d %s", rec2.Code, rec2.Body.String())
	}
	if got := hCDecode(t, rec2)["message"].(string); got != "Payment released and recorded. Dispute closed." {
		t.Fatalf("termin activate msg = %q", got)
	}
	var awaitSt, awaitPay string
	_ = pool.QueryRow(ctx, `SELECT status::text, payment_status::text FROM bids WHERE id=$1`, awaitID).Scan(&awaitSt, &awaitPay)
	if awaitSt != "accepted" {
		t.Fatalf("awaiting bid status = %s %s", awaitSt, awaitPay)
	}
	// Termin activation post-state: project slot taken from the bid profile (literal)
	var slot *int64
	_ = pool.QueryRow(ctx, `SELECT selected_arsitek_id FROM projects WHERE id=$1`, pid2).Scan(&slot)
	if slot == nil || *slot != profID {
		t.Fatalf("project slot = %v want %d", slot, profID)
	}
	hCCleanupProject(t, ctx, pool, pid2, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did2)
}
