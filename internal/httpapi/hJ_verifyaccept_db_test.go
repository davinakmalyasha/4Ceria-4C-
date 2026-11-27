package httpapi

// hJ verify-proof accept paths: the profile-less bid (bidder name falls
// back to the user row), the insufficient-escrow refusal on a termin,
// and the specialist-assignment finalisation on an addendum.

import (
	"context"
	"net/http"
	"testing"
)

func TestHJVerifyAcceptBidEmptyProfileName(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "vabown", "user")
	bidder := hJMkUser(t, ctx, pool, "vabbid", "arsitek")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, bidder)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify Accept Bid")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, owner)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, bidder)
		pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()

	// Bid whose profile carries an empty name: the ledger label falls
	// back to the bidder's user row.
	var profID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'','verified') RETURNING id`, bidder).Scan(&profID); err != nil {
		t.Fatalf("profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, profID)
	var bidID int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, status, payment_status, payment_proof_path) VALUES ($1,'arsitek',$2,$3,$3,'100000','100000','pending','verifying','receipts/hJ-acc.pdf') RETURNING id`, pid, bidder, profID).Scan(&bidID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	var bidderName string
	_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id=$1`, bidder).Scan(&bidderName)

	bidderCaller := &roadmapCaller{id: bidder, role: "arsitek"}
	rec := hJCall(VerifyProofHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`, bidderCaller,
		map[string]string{"project": itoaTest(pid), "type": "arsitek_bid", "id": itoaTest(bidID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("accept bid = %d %s", rec.Code, rec.Body.String())
	}
	body := hJDecode(t, rec)
	if got := body["message"].(string); got != "Payment verified successfully." {
		t.Fatalf("accept msg = %q", got)
	}
	if got := body["status"].(string); got != "success" {
		t.Fatalf("accept envelope = %q", got)
	}
	var payStatus string
	var ledgerN int
	var ledgerTitle, ledgerAmt string
	if err := pool.QueryRow(ctx, `SELECT payment_status::text FROM bids WHERE id=$1`, bidID).Scan(&payStatus); err != nil {
		t.Fatalf("post: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' AND amount::text='100000.00'`, pid).Scan(&ledgerN); err != nil {
		t.Fatalf("ledger count: %v", err)
	}
	_ = pool.QueryRow(ctx, `SELECT title, amount::text FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' ORDER BY id DESC LIMIT 1`, pid).Scan(&ledgerTitle, &ledgerAmt)
	if payStatus != "paid" || ledgerN != 1 {
		t.Fatalf("post-state = %s ledger %d", payStatus, ledgerN)
	}
	if ledgerTitle != "Professional Fee: "+bidderName {
		t.Fatalf("ledger title = %q want user fallback", ledgerTitle)
	}
	// Reloaded bid carries the profile block for the existing profile.
	data := body["data"].(map[string]any)
	if _, ok := data["arsitek"]; !ok {
		t.Fatalf("missing profile block in %v", data)
	}
	if got := data["payment_status"].(string); got != "paid" {
		t.Fatalf("data status = %q", got)
	}
}

func TestHJVerifyAcceptTerminInsufficient(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "vatinown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	var pid int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,'hJ Verify Insufficient','open',1000) RETURNING id`, owner).Scan(&pid); err != nil {
		t.Fatalf("project: %v", err)
	}
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	// Verifying termin priced far above the ceiling: the accept refuses.
	var termID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, role_type, recipient_id, label, percentage, amount, retention_amount, net_amount, status, payment_proof_path) VALUES ($1,'arsitek',$2,'hJ Big',10,500000,0,500000,'verifying','receipts/hJ-big.pdf') RETURNING id`, pid, owner).Scan(&termID); err != nil {
		t.Fatalf("termin: %v", err)
	}
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	rec := hJCall(VerifyProofHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`, ownerCaller,
		map[string]string{"project": itoaTest(pid), "type": "termin", "id": itoaTest(termID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept insufficient = %d %s", rec.Code, rec.Body.String())
	}
	body := hJDecode(t, rec)
	if got := body["message"].(string); got != "Project budget is insufficient for this payment (500,000). Available: 1,000. Please increase the project budget first." {
		t.Fatalf("accept insufficient msg = %q", got)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, termID).Scan(&st)
	if st != "verifying" {
		t.Fatalf("termin mutated to %s", st)
	}
}

func TestHJVerifyAcceptSpecialist(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "vaspown", "user")
	spec := hJMkUser(t, ctx, pool, "vaspspec", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, spec)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify Specialist")
	defer func() {
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, spec)
		pool.Exec(ctx, `DELETE FROM project_sub_professionals WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()

	// Specialist assignment awaiting verification, addressed to the
	// specialist: the accept finalises the invitation.
	var addID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, type, role_type, user_id, title, amount, status, payment_proof_path, assigned_user_id, specialist_type) VALUES ($1,'specialist_assignment','arsitek',$2,'hJ Spec Add',50000,'verifying','receipts/hJ-spec.pdf',$3,'structural') RETURNING id`, pid, owner, spec).Scan(&addID); err != nil {
		t.Fatalf("addendum: %v", err)
	}
	specCaller := &roadmapCaller{id: spec, role: "user"}
	rec := hJCall(VerifyProofHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`, specCaller,
		map[string]string{"project": itoaTest(pid), "type": "addendum", "id": itoaTest(addID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("accept specialist = %d %s", rec.Code, rec.Body.String())
	}
	body := hJDecode(t, rec)
	if got := body["message"].(string); got != "Payment verified successfully." {
		t.Fatalf("accept specialist msg = %q", got)
	}
	var subStatus, subRole string
	var subUser int64
	if err := pool.QueryRow(ctx, `SELECT status::text, sub_role, user_id FROM project_sub_professionals WHERE project_id=$1`, pid).Scan(&subStatus, &subRole, &subUser); err != nil {
		t.Fatalf("sub: %v", err)
	}
	if subStatus != "invited" || subRole != "structural" || subUser != spec {
		t.Fatalf("sub = %s %s %d", subStatus, subRole, subUser)
	}
	var invN int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='sub_professional_invite'`, spec).Scan(&invN)
	if invN != 1 {
		t.Fatalf("invite notif = %d", invN)
	}
}
