package httpapi

// hI brief + planning leftovers: happy paths plus ghost/anon/bad-id twins.

import (
	"context"
	"net/http"
	"testing"
)

func TestHIBrief(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	// Approve draft → 422.
	rec := hICall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("approve draft = %d, want 422", rec.Code)
	}
	// Stranger gate after pending.
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status = 'pending_review' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("pending: %v", err)
	}
	rec = hICall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("approve stranger = %d, want 403", rec.Code)
	}
	// Anon 401, ghost 404, bad id 404.
	rec = hICall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("approve anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("approve ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("approve bad id = %d, want 404", rec.Code)
	}
	// Happy approve.
	rec = hICall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve = %d %s", rec.Code, rec.Body.String())
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT construction_brief_status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&status); err != nil || status != "approved" {
		t.Fatalf("brief status = %q, %v", status, err)
	}

	// Revise: back to pending, empty → 422, happy, kontraktor forbidden.
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status = 'pending_review' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("re-pending: %v", err)
	}
	rec = hICall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("revise empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"hI fix details"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("revise = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"hI x"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("revise kontraktor = %d, want 403", rec.Code)
	}

	// Lock design by arsitek, kontraktor forbidden, empty 422, anon 401.
	rec = hICall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("lock design = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("lock kontraktor = %d, want 403", rec.Code)
	}
	rec = hICall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("lock empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("lock anon = %d, want 401", rec.Code)
	}

	// Kickoff: owner issues for arsitek; twice 422; bad role 422; stranger 403.
	rec = hICall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"arsitek"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("kickoff = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"arsitek"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("kickoff again = %d, want 422", rec.Code)
	}
	rec = hICall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"wizard"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("kickoff bad role = %d, want 422", rec.Code)
	}
	rec = hICall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("kickoff stranger = %d, want 403", rec.Code)
	}
}

func TestHIPlanning(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	// Only the assigned architect proposes.
	rec := hICall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{"architect_notes":"hI plan"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("submit stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{"architect_notes":"hI plan"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("submit = %d %s", rec.Code, rec.Body.String())
	}
	// Anon 401, bad id 404.
	rec = hICall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{"architect_notes":"hI"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("submit anon = %d, want 401", rec.Code)
	}

	// Owner cannot approve before PM verifies.
	rec = hICall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("approve early = %d, want 422", rec.Code)
	}
	rec = hICall(t, VerifyPlanningPMHandler(pool), http.MethodPost, "/x",
		`{"pm_audit_notes":"hI looks good"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("verify = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, VerifyPlanningPMHandler(pool), http.MethodPost, "/x", `{}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("verify stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("approve stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve = %d %s", rec.Code, rec.Body.String())
	}

	// Reject round-trip.
	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'draft' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("redraft: %v", err)
	}
	rec = hICall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("resubmit: %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, VerifyPlanningPMHandler(pool), http.MethodPost, "/x",
		`{"pm_audit_notes":"hI re-verify"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("re-verify: %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RejectPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject owner = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RejectPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reject stranger = %d, want 403", rec.Code)
	}
	var planningStatus string
	if err := pool.QueryRow(ctx, `SELECT planning_status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&planningStatus); err != nil || planningStatus != "draft" {
		t.Fatalf("planning = %q, %v", planningStatus, err)
	}
}
