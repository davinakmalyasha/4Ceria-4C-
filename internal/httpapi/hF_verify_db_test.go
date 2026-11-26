package httpapi

// hF verification surfaces: legal-phase verification and design-payment
// verification — happy paths with hand-written post-state literals plus
// rejection twins with exact codes and messages.

import (
	"context"
	"net/http"
	"testing"
)

func TestHFVerifyLegalGuards(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	p := hFProjectPath(fx.projectID)

	// Anonymous: 401 before any project read.
	rec := hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("legal anon = %d, want 401", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "Unauthenticated." {
		t.Fatalf("legal anon message = %q", got)
	}

	// Malformed id: the route-binding 404.
	rec = hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("legal bad id = %d, want 404", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Project] abc` {
		t.Fatalf("legal bad id message = %q", got)
	}

	// Missing row: 404 via the project load, never 500.
	rec = hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", &fx.owner,
		map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("legal missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Project] 999999999` {
		t.Fatalf("legal missing message = %q", got)
	}

	// Stranger and hired non-PM professional: 403 with the gate sentence.
	for name, caller := range map[string]*roadmapCaller{"stranger": &fx.stranger, "kontraktor": &fx.kontraktor} {
		rec = hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", caller, p)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("legal %s = %d, want 403", name, rec.Code)
		}
		if got := hFDecode(t, rec)["message"]; got != "Only the Project Owner or PM can verify the legal phase." {
			t.Fatalf("legal %s message = %q", name, got)
		}
	}

	// No handover submitted: 422, nothing stamped.
	rec = hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("legal no handover = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "Legal handover has not been submitted for verification yet." {
		t.Fatalf("legal no handover message = %q", got)
	}
	var locked bool
	if err := pool.QueryRow(context.Background(), `SELECT legal_locked_at IS NOT NULL FROM projects WHERE id = $1`,
		fx.projectID).Scan(&locked); err != nil || locked {
		t.Fatalf("legal stamped without handover: locked=%v err=%v", locked, err)
	}
}

func TestHFVerifyLegalHappy(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	// Hire the notary on the fixture project so the phase notification fires.
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_notaris_id = $2, legal_handover_submitted_at = now() WHERE id = $1`,
		fx.projectID, hFNotarisProfileID); err != nil {
		t.Fatalf("handover: %v", err)
	}
	// One locked notaris stage: the triggerPaymentForPhase branch.
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins
		(project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, created_at, updated_at)
		VALUES ($1, 'hF notaris fee', 100, 800000, 0, 800000, 'locked', 'notaris', now(), now())`, fx.projectID); err != nil {
		t.Fatalf("termin: %v", err)
	}

	rec := hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("legal happy = %d %s", rec.Code, rec.Body.String())
	}

	var approved, locked, completed, cleared, inPhases bool
	if err := pool.QueryRow(ctx, `SELECT owner_legal_approved_at IS NOT NULL, legal_locked_at IS NOT NULL,
		legal_completed_at IS NOT NULL, legal_handover_submitted_at IS NULL,
		COALESCE(completed_phases, '[]'::jsonb) @> '["legal"]'::jsonb
		FROM projects WHERE id = $1`, fx.projectID).Scan(&approved, &locked, &completed, &cleared, &inPhases); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !approved || !locked || !completed || !cleared || !inPhases {
		t.Fatalf("legal stamps = %v %v %v %v %v", approved, locked, completed, cleared, inPhases)
	}
	var terminStatus string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE project_id = $1 AND role_type::text = 'notaris'`,
		fx.projectID).Scan(&terminStatus); err != nil || terminStatus != "pending" {
		t.Fatalf("termin status = %q, %v", terminStatus, err)
	}
	var verifiedLog, unblockedLog, notifCount int
	if err := pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM project_activity_logs WHERE project_id = $1 AND action = 'legal_verified'),
		(SELECT count(*) FROM project_activity_logs WHERE project_id = $1 AND action = 'payment_unblocked'),
		(SELECT count(*) FROM notifications WHERE user_id = $2 AND type = 'phase_verified')`,
		fx.projectID, hFNotarisID).Scan(&verifiedLog, &unblockedLog, &notifCount); err != nil {
		t.Fatalf("logs: %v", err)
	}
	if verifiedLog != 1 || unblockedLog != 1 || notifCount != 1 {
		t.Fatalf("logs = verified %d unblocked %d notif %d, want 1/1/1", verifiedLog, unblockedLog, notifCount)
	}

	// The handover is consumed: a second call is a 422.
	rec = hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("legal again = %d, want 422", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "Legal handover has not been submitted for verification yet." {
		t.Fatalf("legal again message = %q", got)
	}

	// Assigned PM verifies on the second project.
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id = $2, legal_handover_submitted_at = now() WHERE id = $1`,
		fx.project2ID, hFPMProfileID); err != nil {
		t.Fatalf("pm handover: %v", err)
	}
	rec = hFCall(t, VerifyLegalHandler(pool), http.MethodPost, "/x", "", &fx.pm, hFProjectPath(fx.project2ID))
	if rec.Code != http.StatusOK {
		t.Fatalf("legal pm = %d %s", rec.Code, rec.Body.String())
	}
}

func TestHFVerifyPaymentGuards(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	rec := hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("pay anon = %d, want 401", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "Unauthenticated." {
		t.Fatalf("pay anon message = %q", got)
	}

	rec = hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("pay bad id = %d, want 404", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Project] abc` {
		t.Fatalf("pay bad id message = %q", got)
	}

	rec = hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.owner,
		map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("pay missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Project] 999999999` {
		t.Fatalf("pay missing message = %q", got)
	}

	// Owner, hired kontraktor and an unhired arsitek are all refused: only
	// the assigned architect passes.
	for name, caller := range map[string]*roadmapCaller{"owner": &fx.owner, "kontraktor": &fx.kontraktor, "stranger": &fx.stranger} {
		rec = hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", caller, p)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("pay %s = %d, want 403 %s", name, rec.Code, rec.Body.String())
		}
		if got := hFDecode(t, rec)["message"]; got != "Only the assigned architect can verify payments." {
			t.Fatalf("pay %s message = %q", name, got)
		}
	}

	// Planning not approved yet.
	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'draft' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("planning draft: %v", err)
	}
	rec = hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pay planning = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "The project must be approved before payment can be verified." {
		t.Fatalf("pay planning message = %q", got)
	}

	// Already verified.
	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'approved', design_payment_verified_at = now() WHERE id = $1`,
		fx.projectID); err != nil {
		t.Fatalf("verified: %v", err)
	}
	rec = hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pay verified = %d, want 422", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "The design fee has already been verified for this project." {
		t.Fatalf("pay verified message = %q", got)
	}

	// An open dispute freezes the path.
	if _, err := pool.Exec(ctx, `UPDATE projects SET design_payment_verified_at = NULL WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("unverify: %v", err)
	}
	var disputeID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
		VALUES ($1, $2, 'payment', 'hF freeze', 'hF frozen', 'open') RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&disputeID); err != nil {
		t.Fatalf("dispute: %v", err)
	}
	rec = hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pay frozen = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	want := "Payments are frozen: dispute #" + int64String(disputeID) + ` ("hF freeze") is open on this project. An admin must resolve it first.`
	if got := hFDecode(t, rec)["message"]; got != want {
		t.Fatalf("pay frozen message = %q want %q", got, want)
	}
}

func TestHFVerifyPaymentHappy(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'approved',
		design_details = '{"deliverables":["floor_plan","3d_render"]}' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("planning: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, status, calculated_total)
		VALUES ($1, 'arsitek', $2, $3, $3, 'accepted', '250000.00')`,
		fx.projectID, fx.arsitek.id, hFArsitekProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}

	rec := hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("pay happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["data"].(map[string]any)["title"]; got != "hF Tower" {
		t.Fatalf("pay resource title = %v", got)
	}

	var verified bool
	var bidStatus string
	var milestones, ledger, notif int
	if err := pool.QueryRow(ctx, `SELECT design_payment_verified_at IS NOT NULL,
		(SELECT payment_status::text FROM bids WHERE project_id = $1 AND role::text = 'arsitek' ORDER BY id DESC LIMIT 1),
		(SELECT count(*) FROM project_milestones WHERE project_id = $1),
		(SELECT count(*) FROM project_budget_transactions WHERE project_id = $1 AND transaction_type = 'payment'
			AND title = 'Paid Architect Base Fee (Verified by Professional)' AND amount::text = '250000.00'),
		(SELECT count(*) FROM notifications WHERE user_id = $2 AND type = 'payment_verified')
		FROM projects WHERE id = $1`,
		fx.projectID, fx.owner.id).Scan(&verified, &bidStatus, &milestones, &ledger, &notif); err != nil {
		t.Fatalf("post-state: %v", err)
	}
	if !verified || bidStatus != "paid" || milestones != 2 || ledger != 1 || notif != 1 {
		t.Fatalf("post-state = verified %v bid %s milestones %d ledger %d notif %d, want true/paid/2/1/1",
			verified, bidStatus, milestones, ledger, notif)
	}
	var titles []string
	rows, err := pool.Query(ctx, `SELECT title FROM project_milestones WHERE project_id = $1 ORDER BY sort_order`, fx.projectID)
	if err != nil {
		t.Fatalf("titles: %v", err)
	}
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err != nil {
			t.Fatalf("title scan: %v", err)
		}
		titles = append(titles, title)
	}
	rows.Close()
	if len(titles) != 2 || titles[0] != "Architectural Design: Detailed Floor Plans" ||
		titles[1] != "3D Visualization: Photorealistic Renders" {
		t.Fatalf("milestone titles = %q", titles)
	}

	// Second verification is refused: the milestones stay exactly two.
	rec = hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pay again = %d, want 422", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "The design fee has already been verified for this project." {
		t.Fatalf("pay again message = %q", got)
	}
	var again int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id = $1`, fx.projectID).Scan(&again); err != nil || again != 2 {
		t.Fatalf("milestones after re-verify = %d, %v", again, err)
	}
}

func TestHFVerifyPaymentInsufficient(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()

	const pid = 960011
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline,
		selected_arsitek_id, planning_status, design_details)
		VALUES ($1, $2, 'hF Poor', 'hF thin', 1000, 'hF Town', 'open', '2027-04-01', $3, 'approved',
		'{"deliverables":["floor_plan"]}')`, pid, hFOwnerID, hFArsitekProfileID); err != nil {
		t.Fatalf("project: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, status, calculated_total)
		VALUES ($1, 'arsitek', $2, $3, $3, 'accepted', '250000.00')`,
		pid, fx.arsitek.id, hFArsitekProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}

	rec := hFCall(t, VerifyPaymentHandler(pool), http.MethodPost, "/x", "", &fx.arsitek, hFProjectPath(pid))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pay thin = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	want := "Project budget is insufficient for the design fee (Rp 250.000). Available: Rp 1.000."
	if got := hFDecode(t, rec)["message"]; got != want {
		t.Fatalf("pay thin message = %q want %q", got, want)
	}

	// The whole transaction rolled back: no stamp, no ledger, payment
	// status untouched (had it committed, the bid would read 'paid').
	var verified bool
	var ledger int
	var bidStatus string
	if err := pool.QueryRow(ctx, `SELECT design_payment_verified_at IS NOT NULL,
		(SELECT count(*) FROM project_budget_transactions WHERE project_id = $1 AND transaction_type = 'payment'),
		(SELECT payment_status::text FROM bids WHERE project_id = $1 AND role::text = 'arsitek' ORDER BY id DESC LIMIT 1)
		FROM projects WHERE id = $1`,
		pid).Scan(&verified, &ledger, &bidStatus); err != nil {
		t.Fatalf("post-state: %v", err)
	}
	if verified || ledger != 0 || bidStatus != "unpaid" {
		t.Fatalf("rollback = verified %v ledger %d bid %s, want false/0/unpaid", verified, ledger, bidStatus)
	}
}
