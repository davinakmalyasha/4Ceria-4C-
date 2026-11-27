package httpapi

// hI termination leftovers: mutual lifecycle plus fire/resign settlement.

import (
	"context"
	"net/http"
	"testing"
)

func hITermPaths(projectID, termID int64) map[string]string {
	return map[string]string{"project": int64String(projectID), "termination": int64String(termID)}
}

func TestHIMutualTermination(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	// Index starts empty; stranger refused, anon 401, ghost 404, bad id 404.
	rec := hICall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("mt index = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("mt index stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("mt index anon = %d, want 401", rec.Code)
	}

	// Initiate as hired kontraktor.
	rec = hICall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI force majeure","settlement_terms":"hI 50/50"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("mt initiate = %d %s", rec.Code, rec.Body.String())
	}
	termID := int64(hIDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	var status string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&status); err != nil || status != "termination_pending" {
		t.Fatalf("project status = %q, %v", status, err)
	}
	// Second initiation while frozen: 422. Validation and strangers.
	rec = hICall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI again"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt re-initiate = %d, want 422", rec.Code)
	}
	rec = hICall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x", `{}`, &fx.arsitek,
		hIProjectPath(fx.project2ID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt empty reason = %d, want 422", rec.Code)
	}
	rec = hICall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI x"}`, &fx.stranger, hIProjectPath(fx.project2ID))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("mt stranger = %d, want 403", rec.Code)
	}

	tp := hITermPaths(fx.projectID, termID)
	// Initiator cannot answer own request; arsitek cannot decide; missing action 422.
	rec = hICall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"accept"}`, &fx.kontraktor, tp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("mt self-respond = %d, want 403", rec.Code)
	}
	rec = hICall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{}`, &fx.owner, tp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt no action = %d, want 422", rec.Code)
	}
	// Reject returns to in_progress with literal.
	rec = hICall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"reject","resolution_notes":"hI stay"}`, &fx.owner, tp)
	if rec.Code != http.StatusOK {
		t.Fatalf("mt reject = %d %s", rec.Code, rec.Body.String())
	}
	if err := pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&status); err != nil || status != "in_progress" {
		t.Fatalf("project status = %q, %v", status, err)
	}
	// Missing termination row → 404.
	rec = hICall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"accept"}`, &fx.owner, hITermPaths(fx.projectID, 999999999))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("mt missing term = %d, want 404", rec.Code)
	}

	// Escalate: pending 422, then reject→escalate happy with dispute literal.
	rec = hICall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI esc"}`, &fx.kontraktor, p)
	term2 := int64(hIDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	tp2 := hITermPaths(fx.projectID, term2)
	rec = hICall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x/escalate",
		`{}`, &fx.kontraktor, tp2)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("escalate pending = %d, want 422", rec.Code)
	}
	rec = hICall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x/respond",
		`{"action":"reject"}`, &fx.owner, tp2)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject2: %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x/escalate",
		`{}`, &fx.kontraktor, tp2)
	if rec.Code != http.StatusOK {
		t.Fatalf("escalate = %d %s", rec.Code, rec.Body.String())
	}
	if hIDecode(t, rec)["dispute"] == nil {
		t.Fatalf("escalate missing dispute: %s", rec.Body.String())
	}
	var disputes int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_disputes WHERE project_id = $1 AND status::text = 'open'`,
		fx.projectID).Scan(&disputes); err != nil || disputes != 1 {
		t.Fatalf("disputes = %d, %v", disputes, err)
	}
}

func TestHITerminateAndResign(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1, 'kontraktor', $2, $3, $3, 'active')`, fx.projectID, fx.kontraktor.id, hIKontraktorProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins
		(project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, created_at, updated_at)
		VALUES ($1, 'hI locked', 50, 1000000, 0, 1000000, 'locked', 'kontraktor', now(), now()),
		       ($1, 'hI verifying', 50, 1000000, 0, 1000000, 'verifying', 'kontraktor', now(), now())`, fx.projectID); err != nil {
		t.Fatalf("termins: %v", err)
	}

	// Non-owner refused; missing role 422; anon 401; bad project 404.
	rec := hICall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hI cause"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("terminate non-owner = %d, want 403", rec.Code)
	}
	rec = hICall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("terminate empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hI cause"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("terminate anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hI cause"}`, &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("terminate bad project = %d, want 404", rec.Code)
	}

	rec = hICall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hI cause"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("terminate = %d %s", rec.Code, rec.Body.String())
	}
	var selected *int64
	var projectStatus string
	if err := pool.QueryRow(ctx, `SELECT selected_kontraktor_id, status::text FROM projects WHERE id = $1`,
		fx.projectID).Scan(&selected, &projectStatus); err != nil {
		t.Fatalf("project: %v", err)
	}
	if selected != nil || projectStatus != "open" {
		t.Fatalf("project after terminate: selected=%v status=%s", selected, projectStatus)
	}
	var bidStatus string
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

	// Resign on second project.
	p2 := hIProjectPath(fx.project2ID)
	rec = hICall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI tired"}`, &fx.stranger, p2)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("resign stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p2)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("resign empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI tired"}`, &fx.kontraktor, p2)
	if rec.Code != http.StatusOK {
		t.Fatalf("resign = %d %s", rec.Code, rec.Body.String())
	}
}
