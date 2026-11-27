package httpapi

// hJ verify/legal coverage: the reachable branches the shared suite
// leaves dark — loader-gate 404s, the legacy-id bid path, the
// unassigned-PM 403, and the deliverable/notify/assigned units.

import (
	"context"
	"net/http"
	"testing"
)

func TestHJVerifyGate404(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ghost := &roadmapCaller{id: 1010099, role: "arsitek"}

	// loadViewer fails for a caller with no users row: gateError pins the
	// entity-neutral 404 (never a 500).
	rec := hJCall(VerifyPaymentHandler(pool), http.MethodPost, "/x", `{}`, ghost, map[string]string{"project": "1010098"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify-payment ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
		t.Fatalf("verify-payment ghost message = %q", got)
	}

	rec = hJCall(VerifyLegalHandler(pool), http.MethodPost, "/x", `{}`, ghost, map[string]string{"project": "1010098"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify-legal ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
		t.Fatalf("verify-legal ghost message = %q", got)
	}
}

func TestHJVerifyPaymentLegacy(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	owner := hJMkUser(t, ctx, pool, "vpaylegown", "user")
	arsiUser := hJMkUser(t, ctx, pool, "vpaylegarsi", "arsitek")
	var arsiProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hJ Arsi','verified') RETURNING id`, arsiUser).Scan(&arsiProf); err != nil {
		t.Fatalf("arsi profile: %v", err)
	}
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify Legacy")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_milestones WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, owner)
		pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, arsiProf)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, arsiUser)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2, planning_status='approved', design_details='{"deliverables":["floor_plan","3d_render"]}' WHERE id=$1`, pid, arsiProf); err != nil {
		t.Fatalf("planning: %v", err)
	}
	// Accepted bid carrying a previous-stack id: the ledger and the
	// notification must name the previous id, not the physical one.
	const legacyID = 555001
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, status, calculated_total, legacy_id) VALUES ($1,'arsitek',$2,$3,$3,'accepted','250000.00',$4)`, pid, arsiUser, arsiProf, legacyID); err != nil {
		t.Fatalf("bid: %v", err)
	}

	arsiCaller := &roadmapCaller{id: arsiUser, role: "arsitek"}
	rec := hJCall(VerifyPaymentHandler(pool), http.MethodPost, "/x", `{}`, arsiCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("pay legacy = %d %s", rec.Code, rec.Body.String())
	}

	var verified bool
	var bidStatus, bidPaid string
	var milestones, ledger int
	if err := pool.QueryRow(ctx, `SELECT design_payment_verified_at IS NOT NULL,
		(SELECT status::text FROM bids WHERE project_id=$1 AND role::text='arsitek' ORDER BY id DESC LIMIT 1),
		(SELECT payment_status::text FROM bids WHERE project_id=$1 AND role::text='arsitek' ORDER BY id DESC LIMIT 1),
		(SELECT count(*) FROM project_milestones WHERE project_id=$1),
		(SELECT count(*) FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' AND amount::text='250000.00')
		FROM projects WHERE id=$1`, pid).Scan(&verified, &bidStatus, &bidPaid, &milestones, &ledger); err != nil {
		t.Fatalf("post-state: %v", err)
	}
	if !verified || bidStatus != "accepted" || bidPaid != "paid" || milestones != 2 || ledger != 1 {
		t.Fatalf("post-state = verified %v status %s paid %s milestones %d ledger %d, want true/accepted/paid/2/1",
			verified, bidStatus, bidPaid, milestones, ledger)
	}
	// Notification data names the previous id (literals).
	var ntype, nbody, ndata string
	if err := pool.QueryRow(ctx, `SELECT type, body, data::text FROM notifications WHERE user_id=$1 AND type='payment_verified'`, owner).Scan(&ntype, &nbody, &ndata); err != nil {
		t.Fatalf("notif: %v", err)
	}
	if nbody != `Your Rp 250.000 design fee for "hJ Verify Legacy" has been verified.` {
		t.Fatalf("notif body = %q", nbody)
	}
	wantData := `{"payment_id": 555001, "payment_type": "arsitek_bid", "project_id": ` + itoaTest(pid) + `}`
	if ndata != wantData {
		t.Fatalf("notif data = %q want %q", ndata, wantData)
	}
	// Leftovers check: exactly the two generated milestones remain pre-cleanup.
	var left int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id=$1`, pid).Scan(&left)
	if left != 2 {
		t.Fatalf("milestones left = %d want 2", left)
	}
}

func TestHJVerifyLegalNonAssignedPM(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	owner := hJMkUser(t, ctx, pool, "vlegpmown", "user")
	pmUser := hJMkUser(t, ctx, pool, "vlegpm", "project_manager")
	var pmProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_managers (user_id, nama, verification_status) VALUES ($1,'hJ PM','verified') RETURNING id`, pmUser).Scan(&pmProf); err != nil {
		t.Fatalf("pm profile: %v", err)
	}
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify PM")
	defer func() {
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_managers WHERE id=$1`, pmProf)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, pmUser)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()
	// Handover submitted, but no PM assigned (pm_id NULL): a PM-role
	// caller who is not the assigned PM reads the owner/PM-only 403.
	if _, err := pool.Exec(ctx, `UPDATE projects SET legal_handover_submitted_at=now() WHERE id=$1`, pid); err != nil {
		t.Fatalf("handover: %v", err)
	}

	pmCaller := &roadmapCaller{id: pmUser, role: "project_manager"}
	rec := hJCall(VerifyLegalHandler(pool), http.MethodPost, "/x", `{}`, pmCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("legal unassigned pm = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Only the Project Owner or PM can verify the legal phase." {
		t.Fatalf("legal unassigned pm message = %q", got)
	}
	var locked bool
	_ = pool.QueryRow(ctx, `SELECT legal_locked_at IS NOT NULL FROM projects WHERE id=$1`, pid).Scan(&locked)
	if locked {
		t.Fatalf("legal stamped on 403")
	}
}

func TestHJVerifyUnits(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	owner := hJMkUser(t, ctx, pool, "vunitown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify Units")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)

	// design_details JSON null decodes to nil: no deliverables, no error.
	if _, err := pool.Exec(ctx, `UPDATE projects SET design_details='null' WHERE id=$1`, pid); err != nil {
		t.Fatalf("details: %v", err)
	}
	if out, err := verifyDeliverables(ctx, tx, pid); err != nil || out != nil {
		t.Fatalf("deliver null = %v %v", out, err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	// Unknown phase notifies nobody and reports no error.
	tx2, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin2: %v", err)
	}
	defer tx2.Rollback(ctx)
	if err := notifyPhaseProfessional(ctx, tx2, pid, "hJ-bogus"); err != nil {
		t.Fatalf("notify bogus: %v", err)
	}
	if err := tx2.Rollback(ctx); err != nil {
		t.Fatalf("rollback2: %v", err)
	}

	// verifyAssignedPM truth table (pool-free).
	if verifyAssignedPM(nil, nil) {
		t.Fatalf("assigned nil viewer")
	}
	other := &projectViewer{id: 7, role: "arsitek", profiles: map[string]int64{}}
	if verifyAssignedPM(other, nil) {
		t.Fatalf("assigned wrong role")
	}
	pmViewer := &projectViewer{id: 8, role: "project_manager", profiles: map[string]int64{"project_manager": 42}}
	if verifyAssignedPM(pmViewer, nil) {
		t.Fatalf("assigned nil pm")
	}
	zero := int64(0)
	if verifyAssignedPM(pmViewer, &zero) {
		t.Fatalf("assigned zero pm")
	}
	miss := int64(43)
	if verifyAssignedPM(pmViewer, &miss) {
		t.Fatalf("assigned mismatch")
	}
	hit := int64(42)
	if !verifyAssignedPM(pmViewer, &hit) {
		t.Fatalf("assigned match false")
	}
}

func TestHJVerifySharedGuards(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	_ = pool
	// Bid-minor and checklist units already sit at 100%; the null-details
	// branch above is the only deliverable gap. This test pins the frozen
	// refusal shape the verify path reuses (literals).
	fe := &frozenError{disputeID: 7, disputeTitle: "hJ Freeze"}
	if got := fe.Error(); got != `Payments are frozen: dispute #7 ("hJ Freeze") is open on this project. An admin must resolve it first.` {
		t.Fatalf("frozen = %q", got)
	}
	if _, ok := asFrozen(fe); !ok {
		t.Fatalf("asFrozen missed")
	}
	if _, ok := asFrozen(errBidGone); ok {
		t.Fatalf("asFrozen false positive")
	}
}
