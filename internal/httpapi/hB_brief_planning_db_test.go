package httpapi

// hB brief lifecycle (approve/revise construction brief, lock phase
// brief, kickoff, review) and the planning machine.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHBConstructionBrief(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Locked out of review: nothing pending.
	rec := hBCall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("approve draft = %d, want 422", rec.Code)
	}
	// Stranger gate.
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status = 'pending_review' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("pending: %v", err)
	}
	rec = hBCall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("approve stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve = %d %s", rec.Code, rec.Body.String())
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT construction_brief_status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&status); err != nil || status != "approved" {
		t.Fatalf("brief status = %q, %v", status, err)
	}

	// Revise: back to pending, revise with notes.
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status = 'pending_review' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("re-pending: %v", err)
	}
	rec = hBCall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("revise empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"hB fix details"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("revise = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"hB x"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("revise kontraktor = %d, want 403", rec.Code)
	}
}

func TestHBPhaseBriefAndKickoff(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	p := hBProjectPath(fx.projectID)

	// Design lock by the assigned architect; contractor cannot lock design.
	rec := hBCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("lock design = %d %s", rec.Code, rec.Body.String())
	}
	// Locking twice is a no-op success.
	rec = hBCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("lock design twice = %d %s", rec.Code, rec.Body.String())
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("lock design = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("lock design kontraktor = %d, want 403", rec.Code)
	}
	// Build submit by the assigned contractor; validation first.
	rec = hBCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("lock empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"build"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("lock build = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"build"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("lock stranger = %d, want 403", rec.Code)
	}

	// Kickoff: owner issues for arsitek; twice is 422; bad role is 422.
	rec = hBCall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"arsitek"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("kickoff = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"arsitek"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("kickoff again = %d, want 422", rec.Code)
	}
	rec = hBCall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"wizard"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("kickoff bad role = %d, want 422", rec.Code)
	}
	rec = hBCall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("kickoff stranger = %d, want 403", rec.Code)
	}
	// Kickoff for a role with no hired profile skips the notification.
	rec = hBCall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"arsitek"}`, &fx.owner,
		hBProjectPath(fx.project2ID))
	if rec.Code != http.StatusOK {
		t.Fatalf("kickoff no profile = %d %s", rec.Code, rec.Body.String())
	}
}

func TestHBReviewProject(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Completed project with a terminated arsitek bid is reviewable.
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, status)
		VALUES ($1, 'arsitek', $2, $3, $3, 'terminated')`, fx.projectID, fx.arsitek.id, hBArsitekProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET status = 'completed' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("complete: %v", err)
	}
	rec := hBCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x",
		`{"rating":5,"comment":"hB great","target_role":"arsitek"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review = %d %s", rec.Code, rec.Body.String())
	}
	// Second review updates the same row.
	rec = hBCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x",
		`{"rating":4,"target_role":"arsitek"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review update = %d %s", rec.Code, rec.Body.String())
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM arsitek_ratings WHERE project_id = $1`, fx.projectID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("ratings = %d, %v", count, err)
	}
	// Validation, forbidden, and role-without-assignment branches.
	rec = hBCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":9}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("review invalid = %d, want 422", rec.Code)
	}
	rec = hBCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x",
		`{"rating":5,"target_role":"arsitek"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("review stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x",
		`{"rating":5,"target_role":"notaris"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("review no-bid role = %d, want 422, got %s", rec.Code, rec.Body.String())
	}
	// An active bid on an open project is not reviewable yet.
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1, 'kontraktor', $2, $3, $3, 'active')`, fx.project2ID, fx.kontraktor.id, hBKontraktorProfileID); err != nil {
		t.Fatalf("bid2: %v", err)
	}
	rec = hBCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x",
		`{"rating":5,"target_role":"kontraktor"}`, &fx.owner, hBProjectPath(fx.project2ID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("review active = %d, want 422, got %s", rec.Code, rec.Body.String())
	}
}

func TestHBPlanning(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Only the assigned architect proposes.
	rec := hBCall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{"architect_notes":"hB plan"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("submit stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{"architect_notes":"hB plan"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("submit = %d %s", rec.Code, rec.Body.String())
	}

	// Owner cannot approve before the PM verifies.
	rec = hBCall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("approve early = %d, want 422", rec.Code)
	}
	// PM verifies (audit path without files), then the owner approves.
	// A non-image, non-PDF audit attachment is a 422 (status is proposed).
	var abody bytes.Buffer
	awriter := multipart.NewWriter(&abody)
	apart, err := awriter.CreateFormFile("attachments", "hB.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := apart.Write([]byte("hB text")); err != nil {
		t.Fatal(err)
	}
	if err := awriter.Close(); err != nil {
		t.Fatal(err)
	}
	areq := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(abody.String()))
	areq.Header.Set("Content-Type", awriter.FormDataContentType())
	areq.SetPathValue("project", int64String(fx.projectID))
	areq = areq.WithContext(withCaller(areq.Context(), fx.pm))
	arec := httptest.NewRecorder()
	VerifyPlanningPMHandler(pool)(arec, areq)
	if arec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify bad attachment = %d, want 422 %s", arec.Code, arec.Body.String())
	}
	rec = hBCall(t, VerifyPlanningPMHandler(pool), http.MethodPost, "/x",
		`{"pm_audit_notes":"hB looks good"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("verify = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, VerifyPlanningPMHandler(pool), http.MethodPost, "/x", `{}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("verify stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("approve stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve = %d %s", rec.Code, rec.Body.String())
	}

	// Rejection round-trip: submit, PM drafts audit notes, owner rejects.
	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'draft' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("redraft: %v", err)
	}
	rec = hBCall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("resubmit: %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdatePlanningAuditHandler(pool), http.MethodPost, "/x",
		`{"pm_audit_notes":"hB draft notes"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("audit = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdatePlanningAuditHandler(pool), http.MethodPost, "/x", `{}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("audit stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, VerifyPlanningPMHandler(pool), http.MethodPost, "/x", `{}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("re-verify: %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RejectPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject owner = %d %s", rec.Code, rec.Body.String())
	}
	// PM rejects from proposed.
	rec = hBCall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("resubmit2: %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RejectPlanningHandler(pool), http.MethodPost, "/x",
		`{"pm_audit_notes":"hB nope"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject pm = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RejectPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reject stranger = %d, want 403", rec.Code)
	}
	var planningStatus string
	if err := pool.QueryRow(ctx, `SELECT planning_status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&planningStatus); err != nil || planningStatus != "draft" {
		t.Fatalf("planning = %q, %v", planningStatus, err)
	}
}
