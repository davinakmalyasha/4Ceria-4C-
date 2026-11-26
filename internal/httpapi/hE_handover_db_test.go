package httpapi

// hE handover gaps: the verifyPhaseTx design/interior/legal branches, the
// termin unlock per role, revision for other phases, and owner-accept with
// a hired architect rating.

import (
	"context"
	"net/http"
	"testing"
)

func TestHEHandoverPhases(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// --- unauth / bad-id / missing pins ---
	rec := hECall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/x", `{"phase":"construction"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("approve unauth = %d, want 401", rec.Code)
	}
	rec = hECall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/x", `{"phase":"build","notes":"hE"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("reject unauth = %d, want 401", rec.Code)
	}
	rec = hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("accept unauth = %d, want 401", rec.Code)
	}

	// Seeded design-branch world: hired roles, docs, milestones, locked stages.
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, status)
		VALUES ($1, $2, 'hE bp.pdf', 'vault/hE-bp.pdf', 'blueprint', 'uploaded'),
		       ($1, $2, 'hE sc.pdf', 'vault/hE-sc.pdf', 'structural_calc', 'uploaded'),
		       ($1, $2, 'hE mep.pdf', 'vault/hE-mep2.pdf', 'mep_layout', 'uploaded'),
		       ($1, $2, 'hE id.pdf', 'vault/hE-id.pdf', 'interior_design', 'uploaded')`,
		hEProjectID, hEArsitekID); err != nil {
		t.Fatalf("docs: %v", err)
	}
	var designMS, structMS int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, approval_status, is_completed)
		VALUES ($1, 'hE design ms', 'design', 'pending', false) RETURNING id`, hEProjectID).Scan(&designMS); err != nil {
		t.Fatalf("design ms: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, approval_status, is_completed)
		VALUES ($1, 'hE struct ms', 'structural', 'pending', false) RETURNING id`, hEProjectID).Scan(&structMS); err != nil {
		t.Fatalf("struct ms: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, milestone_id)
		VALUES ($1, 'hE design stage', 0, 50000, 0, 50000, 'locked', 'arsitek', $2),
		       ($1, 'hE struct stage', 0, 60000, 0, 60000, 'pending', 'structural', $3)`,
		hEProjectID, designMS, structMS); err != nil {
		t.Fatalf("termins: %v", err)
	}

	// --- approve design: all four doc families verified, milestones done ---
	rec = hECall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve design = %d %s", rec.Code, rec.Body.String())
	}
	for _, cat := range []string{"blueprint", "structural_calc", "mep_layout", "interior_design"} {
		var n int
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_documents WHERE project_id = $1 AND category = $2 AND status::text = 'verified'`, hEProjectID, cat).Scan(&n)
		if n != 1 {
			t.Fatalf("doc %s verified = %d, want 1", cat, n)
		}
	}
	for _, id := range []int64{designMS, structMS} {
		var approval string
		var done bool
		_ = pool.QueryRow(ctx, `SELECT approval_status::text, is_completed FROM project_milestones WHERE id = $1`, id).Scan(&approval, &done)
		if approval != "approved" || !done {
			t.Fatalf("milestone %d = %q/%v, want approved/true", id, approval, done)
		}
	}
	var designTermin, structTermin string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE label = 'hE design stage'`).Scan(&designTermin)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE label = 'hE struct stage'`).Scan(&structTermin)
	if designTermin != "pending" || structTermin != "pending" {
		t.Fatalf("termins = %q/%q, want pending/pending", designTermin, structTermin)
	}
	var completed string
	_ = pool.QueryRow(ctx, `SELECT completed_phases::text FROM projects WHERE id = $1`, hEProjectID).Scan(&completed)
	if completed != `["design"]` {
		t.Fatalf("completed_phases = %q, want [design]", completed)
	}
	var designLog int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id = $1 AND action = 'design_verified'`, hEProjectID).Scan(&designLog)
	if designLog != 1 {
		t.Fatalf("design_verified logs = %d, want 1", designLog)
	}
	// The arsitek phase trigger unblocked the first locked arsitek stage.
	var unblocked int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id = $1 AND action = 'payment_unblocked'`, hEProjectID).Scan(&unblocked)
	if unblocked != 0 {
		t.Fatalf("payment_unblocked logs = %d, want 0 (design stage was already pending)", unblocked)
	}

	// --- approve interior: stamp + interior termin unlocked ---
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type)
		VALUES ($1, 'hE interior stage', 0, 40000, 0, 40000, 'locked', 'interior')`, hEProjectID); err != nil {
		t.Fatalf("interior termin: %v", err)
	}
	rec = hECall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/x", `{"phase":"interior"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve interior = %d %s", rec.Code, rec.Body.String())
	}
	var interiorStamp *string
	_ = pool.QueryRow(ctx, `SELECT owner_interior_approved_at::text FROM projects WHERE id = $1`, hEProjectID).Scan(&interiorStamp)
	if interiorStamp == nil {
		t.Fatalf("owner_interior_approved_at missing")
	}
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE label = 'hE interior stage'`).Scan(&designTermin)
	if designTermin != "pending" {
		t.Fatalf("interior termin = %q, want pending", designTermin)
	}

	// --- approve legal: stamp, handover columns cleared, notaris unlocked ---
	if _, err := pool.Exec(ctx, `UPDATE projects SET legal_handover_submitted_at = now(), legal_handover_notes = 'hE stale' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("legal stamp: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type)
		VALUES ($1, 'hE legal stage', 0, 30000, 0, 30000, 'locked', 'notaris')`, hEProjectID); err != nil {
		t.Fatalf("legal termin: %v", err)
	}
	rec = hECall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/x", `{"phase":"legal"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve legal = %d %s", rec.Code, rec.Body.String())
	}
	var legalStamp, clearedAt *string
	var clearedNotes *string
	_ = pool.QueryRow(ctx, `SELECT owner_legal_approved_at::text, legal_handover_submitted_at::text, legal_handover_notes FROM projects WHERE id = $1`,
		hEProjectID).Scan(&legalStamp, &clearedAt, &clearedNotes)
	if legalStamp == nil || clearedAt != nil || clearedNotes != nil {
		t.Fatalf("legal row = %v/%v/%v, want stamp/NULL/NULL", legalStamp, clearedAt, clearedNotes)
	}
	_ = pool.QueryRow(ctx, `SELECT completed_phases::text FROM projects WHERE id = $1`, hEProjectID).Scan(&completed)
	if completed != `["design", "interior", "legal"]` {
		t.Fatalf("completed_phases = %q, want design/interior/legal", completed)
	}

	// --- revision: design + interior notes, construction spelling refused ---
	if _, err := pool.Exec(ctx, `UPDATE projects SET design_handover_submitted_at = now(), interior_handover_submitted_at = now() WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("handover stamps: %v", err)
	}
	rec = hECall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/x", `{"phase":"design","notes":"hE redo design"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject design = %d %s", rec.Code, rec.Body.String())
	}
	var designCleared *string
	var designNotes string
	_ = pool.QueryRow(ctx, `SELECT design_handover_submitted_at::text, design_handover_notes FROM projects WHERE id = $1`, hEProjectID).Scan(&designCleared, &designNotes)
	if designCleared != nil || designNotes != "hE redo design" {
		t.Fatalf("design handover = %v/%q, want NULL/hE redo design", designCleared, designNotes)
	}
	rec = hECall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/x", `{"phase":"interior","notes":"hE redo interior"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject interior = %d %s", rec.Code, rec.Body.String())
	}
	// "construction" is not a reject spelling — only build is.
	rec = hECall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/x", `{"phase":"construction","notes":"hE x"}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected phase is invalid.") {
		t.Fatalf("reject construction = %d %s, want 422 invalid phase", rec.Code, rec.Body.String())
	}
	rec = hECall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/x", `{"phase":"build","notes":"`+longStr(1001)+`"}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The notes field must not be greater than 1000 characters.") {
		t.Fatalf("reject long notes = %d %s", rec.Code, rec.Body.String())
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHEOwnerAcceptRating(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// Validation twins first (project is nowhere near acceptable).
	rec := hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":"high"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The rating field must be an integer.") {
		t.Fatalf("accept bad rating = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":0}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The rating field must be at least 1.") {
		t.Fatalf("accept rating 0 = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":6}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The rating field must not be greater than 5.") {
		t.Fatalf("accept rating 6 = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"review":"`+longStr(1001)+`"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The review field must not be greater than 1000 characters.") {
		t.Fatalf("accept long review = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"review":5}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The review field must be a string.") {
		t.Fatalf("accept numeric review = %d %s", rec.Code, rec.Body.String())
	}

	// Make the project acceptable: no open snags, phases aligned, SLF set.
	if _, err := pool.Exec(ctx, `UPDATE projects SET needed_phases = '["design"]'::jsonb, completed_phases = '["design"]'::jsonb,
		slf_verified_at = now(), project_category = 'renovation' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("finalize setup: %v", err)
	}
	rec = hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"review":"hE flawless handover"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("accept ok = %d %s", rec.Code, rec.Body.String())
	}
	// The hired architect is rated, and the answer carries the review.
	var rating int
	var comment *string
	_ = pool.QueryRow(ctx, `SELECT rating, komentar FROM arsitek_ratings WHERE project_id = $1`, hEProjectID).Scan(&rating, &comment)
	if rating != 5 || comment == nil || *comment != "hE flawless handover" {
		t.Fatalf("arsitek rating = %d/%v, want 5/hE flawless handover", rating, comment)
	}
	body := hEDecode(t, rec)
	data, _ := body["data"].(map[string]any)
	review, _ := data["review_arsitek"].(map[string]any)
	if review == nil || int(review["rating"].(float64)) != 5 {
		t.Fatalf("answer review_arsitek = %v, want rating 5", review)
	}
	var status, warranty string
	_ = pool.QueryRow(ctx, `SELECT status::text, (warranty_end_at::date - warranty_start_at::date)::text FROM projects WHERE id = $1`, hEProjectID).Scan(&status, &warranty)
	if status != "completed" || warranty != "180" {
		t.Fatalf("project = %q/%q, want completed/180", status, warranty)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func longStr(n int) string {
	out := make([]byte, n)
	for i := range out {
		out[i] = 'h'
	}
	return string(out)
}
