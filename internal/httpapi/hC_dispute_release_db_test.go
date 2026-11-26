package httpapi

import (
	"context"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hCMkBidForRelease(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID, bidderUID, profileID int64, role, status string) int64 {
	t.Helper()
	// role-specific column must equal bidder_profile_id per check constraint
	col := map[string]string{
		"arsitek": "arsitek_id", "kontraktor": "kontraktor_id", "notaris": "notaris_id",
		"interior": "interior_id", "structural": "structural_id", "mep": "mep_id",
		"project_manager": "pm_id",
	}[role]
	if col == "" {
		t.Fatalf("bad role %s", role)
	}
	var id int64
	// dynamic column: build SQL with fmt
	q := `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, ` + col + `, price, calculated_total, status, payment_status) VALUES ($1,$2,$3,$4,$4,100000,100000,$5,'unpaid') RETURNING id`
	if err := pool.QueryRow(ctx, q, projectID, role, bidderUID, profileID, status).Scan(&id); err != nil {
		t.Fatalf("seed bid: %v", err)
	}
	return id
}

func TestHCDisputeActReleaseBranches(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hCAdmin(t, ctx, pool)
	owner := hCMkUser(t, ctx, pool, "relown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)

	// no linked payment
	pid := hCMkProject(t, ctx, pool, owner, "hC Release NoLink")
	did := hCMkDispute(t, ctx, pool, pid, owner, "hC Release NoLink d")
	rec := hCCallAct(pool, &admin, itoaTest(did), `{"action":"release_payment"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("release nolink = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "This dispute has no linked payment to release. Use dismiss, refund, terminate, or custom." {
		t.Fatalf("release nolink msg = %q", got)
	}
	var rs0 string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_disputes WHERE id=$1`, did).Scan(&rs0)
	if rs0 != "open" {
		t.Fatalf("release nolink mutated to %s", rs0)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// missing payment row -> 404
	pid = hCMkProject(t, ctx, pool, owner, "hC Release Missing P")
	did = hCMkDispute(t, ctx, pool, pid, owner, "hC Release Missing D")
	miss := int64(98979797)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &miss, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"release_payment"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("release missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Payment record not found." {
		t.Fatalf("release missing msg = %q", got)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// already paid
	pid = hCMkProject(t, ctx, pool, owner, "hC Release Paid P")
	did = hCMkDispute(t, ctx, pool, pid, owner, "hC Release Paid D")
	termPaid := hCMkTermin(t, ctx, pool, pid, "hC Termin Paid", "paid", 500000)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &termPaid, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"release_payment"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("release paid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("release paid msg = %q", got)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// refunded
	pid = hCMkProject(t, ctx, pool, owner, "hC Release Refunded P")
	did = hCMkDispute(t, ctx, pool, pid, owner, "hC Release Refunded D")
	termRef := hCMkTermin(t, ctx, pool, pid, "hC Termin Ref", "refunded", 500000)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &termRef, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"release_payment"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("release refunded = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "This payment was refunded through dispute arbitration and cannot be re-charged." {
		t.Fatalf("release refunded msg = %q", got)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// terminated bid branch
	bidder := hCMkUser(t, ctx, pool, "relbidder", "arsitek")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, bidder)
	var profID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hC RelBidder','verified') RETURNING id`, bidder).Scan(&profID); err != nil {
		t.Fatalf("bidder profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, profID)
	pid = hCMkProject(t, ctx, pool, owner, "hC Release TermBid P")
	defer func() {}()
	bidID := hCMkBidForRelease(t, ctx, pool, pid, bidder, profID, "arsitek", "terminated")
	did = hCMkDispute(t, ctx, pool, pid, owner, "hC Release TermBid D")
	hCSetDisputeLink(t, ctx, pool, did, "bid.arsitek", &bidID, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"release_payment"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("release terminated = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "This payment is no longer payable — the related contract was terminated." {
		t.Fatalf("release terminated msg = %q", got)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)

	// insufficient budget: tiny budget project, large termin
	var tinyPID int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,'hC Release Tiny','open',1000) RETURNING id`, owner).Scan(&tinyPID); err != nil {
		t.Fatalf("tiny project: %v", err)
	}
	didTiny := hCMkDispute(t, ctx, pool, tinyPID, owner, "hC Release Tiny D")
	termBig := hCMkTermin(t, ctx, pool, tinyPID, "hC Termin Big", "accepted", 500000)
	hCSetDisputeLink(t, ctx, pool, didTiny, "payment_termin", &termBig, "")
	rec = hCCallAct(pool, &admin, itoaTest(didTiny), `{"action":"release_payment"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("release insufficient = %d %s", rec.Code, rec.Body.String())
	}
	// Literal: NetMinor 500000 minor renders "5,000"; budget 1000.00 renders available "1,000"
	if got := hCDecode(t, rec)["message"].(string); got != "Project budget is insufficient for this payment (5,000). Available: 1,000. Please increase the project budget first." {
		t.Fatalf("release insufficient msg = %q", got)
	}
	hCCleanupProject(t, ctx, pool, tinyPID, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, didTiny)

	// happy release
	pid = hCMkProject(t, ctx, pool, owner, "hC Release Happy P")
	did = hCMkDispute(t, ctx, pool, pid, owner, "hC Release Happy D")
	termHappy := hCMkTermin(t, ctx, pool, pid, "hC Termin Happy", "accepted", 200000)
	hCSetDisputeLink(t, ctx, pool, did, "payment_termin", &termHappy, "")
	rec = hCCallAct(pool, &admin, itoaTest(did), `{"action":"release_payment"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("release happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Payment released and recorded. Dispute closed." {
		t.Fatalf("release happy msg = %q", got)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, termHappy).Scan(&st)
	if st != "paid" {
		t.Fatalf("release happy status = %s", st)
	}
	// Happy post-state literals: ledger 2000.00 payment, dispute resolved/release_payment
	var payAmt, payTitle string
	var payRefType, payRefID int64
	if err := pool.QueryRow(ctx, `SELECT amount::text, title, reference_type_id, reference_id FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' ORDER BY id DESC LIMIT 1`, pid).Scan(&payAmt, &payTitle, &payRefType, &payRefID); err != nil {
		t.Fatalf("release ledger: %v", err)
	}
	if payAmt != "2000.00" || payRefType != 8 || payRefID != termHappy {
		t.Fatalf("release ledger = %s %d/%d want 2000.00 8/%d", payAmt, payRefType, payRefID, termHappy)
	}
	if payTitle != "Payment: hC Termin Happy (arsitek)" {
		t.Fatalf("release title = %q", payTitle)
	}
	var rst, rres string
	_ = pool.QueryRow(ctx, `SELECT status::text, resolution::text FROM project_disputes WHERE id=$1`, did).Scan(&rst, &rres)
	if rst != "resolved" || rres != "release_payment" {
		t.Fatalf("release dispute = %s %s", rst, rres)
	}
	hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)
}
