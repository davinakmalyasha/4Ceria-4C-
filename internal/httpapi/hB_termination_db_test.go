package httpapi

// hB termination surfaces: mutual-termination lifecycle and the
// fire/resign contract settlement.

import (
	"context"
	"net/http"
	"testing"
)

func hBTerminationPaths(projectID, termID int64) map[string]string {
	return map[string]string{"project": int64String(projectID), "termination": int64String(termID)}
}

func TestHBMutualTerminationInitiateAndIndex(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Index starts empty for a participant; stranger is refused.
	rec := hBCall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("mt index = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("mt index stranger = %d, want 403", rec.Code)
	}

	// Initiate as the hired kontraktor freezes the workspace.
	rec = hBCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB force majeure","settlement_terms":"hB 50/50"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("mt initiate = %d %s", rec.Code, rec.Body.String())
	}
	termID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	var status string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&status); err != nil || status != "termination_pending" {
		t.Fatalf("project status = %q, %v", status, err)
	}

	// Second initiation while frozen: 422. So is validation and strangers.
	rec = hBCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB again"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt re-initiate = %d, want 422", rec.Code)
	}
	rec = hBCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x", `{}`, &fx.arsitek,
		hBProjectPath(fx.project2ID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt empty reason = %d, want 422", rec.Code)
	}
	rec = hBCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB x"}`, &fx.stranger, hBProjectPath(fx.project2ID))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("mt stranger = %d, want 403", rec.Code)
	}

	// Index now lists the request for the owner.
	rec = hBCall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if body := hBDecode(t, rec); len(body["data"].([]any)) != 1 {
		t.Fatalf("mt index after = %v", body)
	}
	_ = termID
}

func TestHBMutualTerminationRespond(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	rec := hBCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB split"}`, &fx.kontraktor, p)
	termID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	tp := hBTerminationPaths(fx.projectID, termID)

	// The initiator cannot answer their own request.
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"accept"}`, &fx.kontraktor, tp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("mt self-respond = %d, want 403", rec.Code)
	}
	// A non-owner, non-PM participant cannot decide either.
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"accept"}`, &fx.arsitek, tp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("mt arsitek respond = %d, want 403", rec.Code)
	}
	// Validation: missing action.
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{}`, &fx.owner, tp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt no action = %d, want 422", rec.Code)
	}
	// Reject: project returns to in_progress.
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"reject","resolution_notes":"hB stay"}`, &fx.owner, tp)
	if rec.Code != http.StatusOK {
		t.Fatalf("mt reject = %d %s", rec.Code, rec.Body.String())
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&status); err != nil || status != "in_progress" {
		t.Fatalf("project status = %q, %v", status, err)
	}
	// Decided requests cannot be re-decided.
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"accept"}`, &fx.owner, tp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt re-respond = %d, want 422", rec.Code)
	}
	// Missing termination row: binding 404.
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"accept"}`, &fx.owner, hBTerminationPaths(fx.projectID, 999999999))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("mt missing term = %d, want 404", rec.Code)
	}

	// Accept path on a fresh request cancels the project.
	rec = hBCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB split 2"}`, &fx.kontraktor, p)
	term2 := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"accept"}`, &fx.owner, hBTerminationPaths(fx.projectID, term2))
	if rec.Code != http.StatusOK {
		t.Fatalf("mt accept = %d %s", rec.Code, rec.Body.String())
	}
	if err := pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&status); err != nil || status != "cancelled" {
		t.Fatalf("project status = %q, %v", status, err)
	}
}

func TestHBMutualTerminationEscalate(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	rec := hBCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB esc"}`, &fx.kontraktor, p)
	termID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	tp := hBTerminationPaths(fx.projectID, termID)

	// Only rejected requests escalate: pending is 422.
	rec = hBCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x/escalate",
		`{}`, &fx.kontraktor, tp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("escalate pending = %d, want 422", rec.Code)
	}
	// Reject first, then escalate as a participant.
	rec = hBCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"reject"}`, &fx.owner, tp)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject: %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x/escalate",
		`{}`, &fx.kontraktor, tp)
	if rec.Code != http.StatusOK {
		t.Fatalf("escalate = %d %s", rec.Code, rec.Body.String())
	}
	if hBDecode(t, rec)["dispute"] == nil {
		t.Fatalf("escalate missing dispute: %s", rec.Body.String())
	}
	// Second escalation reuses the open dispute.
	rec = hBCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x/escalate",
		`{}`, &fx.kontraktor, tp)
	if rec.Code != http.StatusOK {
		t.Fatalf("escalate again = %d %s", rec.Code, rec.Body.String())
	}
	// Stranger cannot escalate.
	rec = hBCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x/escalate",
		`{}`, &fx.stranger, tp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("escalate stranger = %d, want 403", rec.Code)
	}
	var disputes int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_disputes WHERE project_id = $1 AND status::text = 'open'`,
		fx.projectID).Scan(&disputes); err != nil || disputes != 1 {
		t.Fatalf("disputes = %d, %v", disputes, err)
	}
}

func TestHBTerminateAndResign(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Live bid plus locked/verifying stages for the settlement.
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1, 'kontraktor', $2, $3, $3, 'active')`, fx.projectID, fx.kontraktor.id, hBKontraktorProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins
		(project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, created_at, updated_at)
		VALUES ($1, 'hB locked', 50, 1000000, 0, 1000000, 'locked', 'kontraktor', now(), now()),
		       ($1, 'hB verifying', 50, 1000000, 0, 1000000, 'verifying', 'kontraktor', now(), now())`, fx.projectID); err != nil {
		t.Fatalf("termins: %v", err)
	}

	// Non-owner is refused; missing role is 422.
	rec := hBCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hB cause"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("terminate non-owner = %d, want 403", rec.Code)
	}
	rec = hBCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("terminate empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hB cause"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("terminate = %d %s", rec.Code, rec.Body.String())
	}
	var selected *int64
	var bidStatus, projectStatus string
	if err := pool.QueryRow(ctx, `SELECT selected_kontraktor_id, status::text FROM projects WHERE id = $1`,
		fx.projectID).Scan(&selected, &projectStatus); err != nil {
		t.Fatalf("project: %v", err)
	}
	if selected != nil || projectStatus != "open" {
		t.Fatalf("project after terminate: selected=%v status=%s", selected, projectStatus)
	}
	if err := pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE project_id = $1 AND role::text = 'kontraktor' ORDER BY id DESC LIMIT 1`,
		fx.projectID).Scan(&bidStatus); err != nil || bidStatus != "terminated" {
		t.Fatalf("bid status = %q, %v", bidStatus, err)
	}
	var voided, verifying int
	if err := pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM project_payment_termins WHERE project_id = $1 AND status::text = 'void'),
		(SELECT count(*) FROM project_payment_termins WHERE project_id = $1 AND status::text = 'verifying')`,
		fx.projectID).Scan(&voided, &verifying); err != nil || voided != 1 || verifying != 1 {
		t.Fatalf("settlement void=%d verifying=%d, %v", voided, verifying, err)
	}
	// Nobody left to fire.
	rec = hBCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hB again"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("terminate empty role = %d, want 422", rec.Code)
	}

	// Resign on the second project as its hired kontraktor.
	p2 := hBProjectPath(fx.project2ID)
	rec = hBCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB tired"}`, &fx.stranger, p2)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("resign stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p2)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("resign empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB tired"}`, &fx.kontraktor, p2)
	if rec.Code != http.StatusOK {
		t.Fatalf("resign = %d %s", rec.Code, rec.Body.String())
	}
}
