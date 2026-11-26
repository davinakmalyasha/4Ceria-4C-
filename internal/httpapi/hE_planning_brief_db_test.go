package httpapi

// hE planning gaps (auth/404 pins, no-PM approve, audit uploads, reject
// matrix) and brief gaps (auth/404, revise-by-PM, lock no-op, kickoff for
// kontraktor, the full review matrix).

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHEPlanningGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)
	p2 := hEProjectPath(hEProject2ID)

	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	// --- unauth / bad-id / missing pins on all five verbs ---
	verbs := []struct {
		name string
		h    func(*pgxpool.Pool) http.HandlerFunc
	}{
		{"submit", SubmitPlanningHandler},
		{"approve", ApprovePlanningHandler},
		{"verify", VerifyPlanningPMHandler},
		{"audit", UpdatePlanningAuditHandler},
		{"reject", RejectPlanningHandler},
	}
	for _, v := range verbs {
		rec := hECall(t, v.h(pool), http.MethodPost, "/x", `{}`, nil, p)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("planning %s unauth = %d, want 401", v.name, rec.Code)
		}
		rec = hECall(t, v.h(pool), http.MethodPost, "/x/abc", `{}`, &fx.owner, map[string]string{"project": "abc"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("planning %s bad-id = %d, want 404 %s", v.name, rec.Code, rec.Body.String())
		}
		rec = hECall(t, v.h(pool), http.MethodPost, "/x/999999999", `{}`, &fx.owner, map[string]string{"project": "999999999"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("planning %s missing = %d, want 404 %s", v.name, rec.Code, rec.Body.String())
		}
	}

	// --- submit ignores a non-string note but still proposes ---
	rec := hECall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{"architect_notes":5}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("submit numeric notes = %d %s", rec.Code, rec.Body.String())
	}
	var planningStatus string
	var iteration int64
	var notes *string
	_ = pool.QueryRow(ctx, `SELECT planning_status::text, planning_iteration, architect_notes FROM projects WHERE id = $1`, hEProjectID).Scan(&planningStatus, &iteration, &notes)
	if planningStatus != "proposed" || iteration != 1 || notes != nil {
		t.Fatalf("planning = %q/%d/%v, want proposed/1/NULL", planningStatus, iteration, notes)
	}

	// --- PM verifies with a real PNG audit attachment ---
	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 64)...)
	reader, ctype := hEMultipartFile(t, map[string]string{"pm_audit_notes": "hE verified"}, "attachments", "hE-audit.png", png)
	req := httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.pm))
	vrec := httptest.NewRecorder()
	VerifyPlanningPMHandler(pool)(vrec, req)
	if vrec.Code != http.StatusOK {
		t.Fatalf("verify upload = %d %s", vrec.Code, vrec.Body.String())
	}
	var attach string
	_ = pool.QueryRow(ctx, `SELECT planning_status::text, pm_audit_attachments::text FROM projects WHERE id = $1`, hEProjectID).Scan(&planningStatus, &attach)
	if planningStatus != "pm_verified" || !containsStr(attach, "pm_audits") {
		t.Fatalf("verify = %q/%q, want pm_verified/pm_audits path", planningStatus, attach)
	}

	// --- owner approves; the design brief never writes a payment stamp ---
	rec = hECall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve = %d %s", rec.Code, rec.Body.String())
	}
	var paidStamp *string
	_ = pool.QueryRow(ctx, `SELECT planning_status::text, design_payment_verified_at::text FROM projects WHERE id = $1`, hEProjectID).Scan(&planningStatus, &paidStamp)
	if planningStatus != "approved" || paidStamp != nil {
		t.Fatalf("approve = %q/%v, want approved/NULL payment stamp", planningStatus, paidStamp)
	}

	// --- approve with no PM assigned only needs proposed ---
	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'proposed', pm_id = NULL WHERE id = $1`, hEProject2ID); err != nil {
		t.Fatalf("propose p2: %v", err)
	}
	rec = hECall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.owner, p2)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve no-pm = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT planning_status::text FROM projects WHERE id = $1`, hEProject2ID).Scan(&planningStatus)
	if planningStatus != "approved" {
		t.Fatalf("p2 planning = %q, want approved", planningStatus)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id = NULL, planning_status = 'draft' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("redraft: %v", err)
	}
	// Draft cannot be approved, and a non-owner cannot approve.
	rec = hECall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("approve draft = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "No active planning proposal found to approve." {
		t.Fatalf("approve draft message = %q", got)
	}
	rec = hECall(t, ApprovePlanningHandler(pool), http.MethodPost, "/x", "", &fx.pm, p2)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("approve pm = %d, want 403", rec.Code)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id = $2 WHERE id = $1`, hEProjectID, hEPMProfileID); err != nil {
		t.Fatalf("pm restore: %v", err)
	}

	// --- verify on a draft is a 422, and the audit path appends a PDF ---
	rec = hECall(t, VerifyPlanningPMHandler(pool), http.MethodPost, "/x", `{}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify draft = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "No active planning proposal found for verification." {
		t.Fatalf("verify draft message = %q", got)
	}
	rec = hECall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("resubmit = %d %s", rec.Code, rec.Body.String())
	}
	pdf := []byte("%PDF-1.4\nhE\n%%EOF\n")
	reader, ctype = hEMultipartFile(t, map[string]string{}, "attachments", "hE-note.pdf", pdf)
	req = httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.pm))
	arec := httptest.NewRecorder()
	UpdatePlanningAuditHandler(pool)(arec, req)
	if arec.Code != http.StatusOK {
		t.Fatalf("audit pdf = %d %s", arec.Code, arec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT pm_audit_attachments::text FROM projects WHERE id = $1`, hEProjectID).Scan(&attach)
	if !containsStr(attach, "pm_audits") {
		t.Fatalf("audit attachments = %q", attach)
	}

	// --- PM rejects with a bad attachment: 422 and nothing mutates ---
	// (two attachments stored, so the file is validated, not skipped)
	reader, ctype = hEMultipartFile(t, map[string]string{}, "attachments", "hE.txt", []byte("hE text"))
	req = httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.pm))
	rrec := httptest.NewRecorder()
	RejectPlanningHandler(pool)(rrec, req)
	if rrec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pm reject bad file = %d, want 422 %s", rrec.Code, rrec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT planning_status::text FROM projects WHERE id = $1`, hEProjectID).Scan(&planningStatus)
	if planningStatus != "proposed" {
		t.Fatalf("planning = %q, want still proposed", planningStatus)
	}

	// --- three stored attachments: a fourth upload is kept out ---
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_audit_attachments = '["hE/a","hE/b","hE/c"]'::jsonb WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("seed attach: %v", err)
	}
	reader, ctype = hEMultipartFile(t, map[string]string{}, "attachments", "hE-d.png", png)
	req = httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.pm))
	arec = httptest.NewRecorder()
	UpdatePlanningAuditHandler(pool)(arec, req)
	if arec.Code != http.StatusOK {
		t.Fatalf("audit fourth = %d %s", arec.Code, arec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT pm_audit_attachments::text FROM projects WHERE id = $1`, hEProjectID).Scan(&attach)
	if attach != `["hE/a", "hE/b", "hE/c"]` {
		t.Fatalf("attachments = %q, want the original three", attach)
	}

	// --- owner rejects from proposed when no PM exists ---
	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'proposed', pm_id = NULL WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("propose: %v", err)
	}
	rec = hECall(t, RejectPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner reject no-pm = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT planning_status::text FROM projects WHERE id = $1`, hEProjectID).Scan(&planningStatus)
	if planningStatus != "draft" {
		t.Fatalf("planning = %q, want draft", planningStatus)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id = $2 WHERE id = $1`, hEProjectID, hEPMProfileID); err != nil {
		t.Fatalf("pm restore2: %v", err)
	}

	// --- owner cannot reject a proposed plan while a PM is assigned ---
	rec = hECall(t, SubmitPlanningHandler(pool), http.MethodPost, "/x", `{"architect_notes":"hE carry"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("resubmit2 = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RejectPlanningHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("owner reject proposed-with-pm = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// --- PM rejects with draft notes (non-string ignored) ---
	rec = hECall(t, RejectPlanningHandler(pool), http.MethodPost, "/x", `{"pm_audit_notes":5}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("pm reject = %d %s", rec.Code, rec.Body.String())
	}
	var logReason string
	_ = pool.QueryRow(ctx, `SELECT details FROM project_activity_logs WHERE project_id = $1 AND action = 'planning_rejected' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&logReason)
	if !containsStr(logReason, "hE carry") {
		t.Fatalf("reject log = %q, want the carried architect notes", logReason)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHEBriefGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// --- unauth / bad-id / missing pins on all five verbs ---
	verbs := []struct {
		name string
		h    func(*pgxpool.Pool) http.HandlerFunc
		body string
	}{
		{"approve-brief", ApproveConstructionBriefHandler, `{}`},
		{"revise-brief", ReviseConstructionBriefHandler, `{"notes":"hE"}`},
		{"lock-brief", LockPhaseBriefHandler, `{"phase":"design"}`},
		{"kickoff", IssueKickoffHandler, `{"role":"arsitek"}`},
		{"review", ReviewProjectHandler, `{"rating":5,"target_role":"arsitek"}`},
	}
	for _, v := range verbs {
		rec := hECall(t, v.h(pool), http.MethodPost, "/x", v.body, nil, p)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("brief %s unauth = %d, want 401", v.name, rec.Code)
		}
		rec = hECall(t, v.h(pool), http.MethodPost, "/x/abc", v.body, &fx.owner, map[string]string{"project": "abc"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("brief %s bad-id = %d, want 404 %s", v.name, rec.Code, rec.Body.String())
		}
		rec = hECall(t, v.h(pool), http.MethodPost, "/x/999999999", v.body, &fx.owner, map[string]string{"project": "999999999"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("brief %s missing = %d, want 404 %s", v.name, rec.Code, rec.Body.String())
		}
	}

	// --- revise by the PM (owner-or-PM gate) with notes twin ---
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status = 'pending_review' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("pending: %v", err)
	}
	rec := hECall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"`+longStr(2001)+`"}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The notes field must not be greater than 2000 characters.") {
		t.Fatalf("revise long = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":5}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The notes field must be a string.") {
		t.Fatalf("revise numeric = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"hE pm revision"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("revise pm = %d %s", rec.Code, rec.Body.String())
	}
	var briefStatus, briefNotes string
	_ = pool.QueryRow(ctx, `SELECT construction_brief_status::text, construction_brief_revision_notes FROM projects WHERE id = $1`, hEProjectID).Scan(&briefStatus, &briefNotes)
	if briefStatus != "revision_requested" || briefNotes != "hE pm revision" {
		t.Fatalf("brief = %q/%q", briefStatus, briefNotes)
	}

	// --- approve refuses a non-pending brief ---
	rec = hECall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("approve revised = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Brief is not pending review." {
		t.Fatalf("approve message = %q", got)
	}

	// --- lock: build submit, then a no-op when already locked ---
	rec = hECall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"build"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("lock build = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT construction_brief_status::text FROM projects WHERE id = $1`, hEProjectID).Scan(&briefStatus)
	if briefStatus != "pending_review" {
		t.Fatalf("brief = %q, want pending_review", briefStatus)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_locked_at = now() WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("lock stamp: %v", err)
	}
	rec = hECall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"build"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("lock build noop = %d %s", rec.Code, rec.Body.String())
	}
	// A PM without an architect profile cannot lock design.
	rec = hECall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.pm, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("lock design pm = %d, want 403", rec.Code)
	}

	// --- kickoff kontraktor notifies; bad shapes are 422 ---
	rec = hECall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("kickoff kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	var kickoff *string
	_ = pool.QueryRow(ctx, `SELECT kontraktor_kickoff_at::text FROM projects WHERE id = $1`, hEProjectID).Scan(&kickoff)
	if kickoff == nil {
		t.Fatalf("kontraktor_kickoff_at missing")
	}
	var kickNotifs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type = 'kickoff_issued' AND user_id = $1`, hEKontrakID).Scan(&kickNotifs)
	if kickNotifs != 1 {
		t.Fatalf("kickoff notifs = %d, want 1", kickNotifs)
	}
	rec = hECall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("kickoff dup = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Notice to Proceed has already been issued for this role." {
		t.Fatalf("kickoff dup message = %q", got)
	}
	for _, tc := range []struct{ name, body, want string }{
		{"missing", `{}`, "The role field is required."},
		{"numeric", `{"role":5}`, "The selected role is invalid."},
	} {
		rec = hECall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", tc.body, &fx.owner, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("kickoff %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	// --- review matrix: every role, one row each, then an update ---
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1, 'kontraktor', $2, $3, $3, 'active')`, hEProject3ID, hEKontrakID, hEKontrakProfileID); err != nil {
		t.Fatalf("kontraktor bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, pm_id, status)
		VALUES ($1, 'project_manager', $2, $3, $3, 'active')`, hEProject3ID, hEPMUserID, hEPMProfileID); err != nil {
		t.Fatalf("pm bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, interior_id, status)
		VALUES ($1, 'interior', $2, $3, $3, 'resigned')`, hEProject3ID, hEInterID, hEInterProfileID); err != nil {
		t.Fatalf("interior bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, notaris_id, status)
		VALUES ($1, 'notaris', $2, $3, $3, 'terminated')`, hEProject2ID, hENotarisID, hENotarisProfileID); err != nil {
		t.Fatalf("notaris bid: %v", err)
	}
	// open project + active bid is not reviewable yet
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1, 'kontraktor', $2, $3, $3, 'active')`, hEProject2ID, hEKontrakID, hEKontrakProfileID); err != nil {
		t.Fatalf("p2 kontraktor bid: %v", err)
	}
	p3 := hEProjectPath(hEProject3ID)
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"kontraktor"}`, &fx.owner, p3)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	var kRating int
	_ = pool.QueryRow(ctx, `SELECT rating FROM kontraktor_ratings WHERE project_id = $1`, hEProject3ID).Scan(&kRating)
	if kRating != 5 {
		t.Fatalf("kontraktor rating = %d, want 5", kRating)
	}
	// update: same row, new value
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":4,"comment":"hE solid","target_role":"kontraktor"}`, &fx.owner, p3)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review update = %d %s", rec.Code, rec.Body.String())
	}
	var kCount int
	_ = pool.QueryRow(ctx, `SELECT count(*), max(rating) FROM kontraktor_ratings WHERE project_id = $1`, hEProject3ID).Scan(&kCount, &kRating)
	if kCount != 1 || kRating != 4 {
		t.Fatalf("kontraktor ratings = %d/%d, want 1/4", kCount, kRating)
	}
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"pm"}`, &fx.owner, p3)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review pm = %d %s", rec.Code, rec.Body.String())
	}
	var pmRating int
	_ = pool.QueryRow(ctx, `SELECT rating FROM p_m_ratings WHERE project_id = $1`, hEProject3ID).Scan(&pmRating)
	if pmRating != 5 {
		t.Fatalf("pm rating = %d, want 5", pmRating)
	}
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":3,"target_role":"interior"}`, &fx.owner, p3)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review interior resigned = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"notaris"}`, &fx.owner, hEProjectPath(hEProject2ID))
	if rec.Code != http.StatusCreated {
		t.Fatalf("review notaris terminated = %d %s", rec.Code, rec.Body.String())
	}

	// --- review twins ---
	for _, tc := range []struct{ name, body, want string }{
		{"rating-zero", `{"rating":0,"target_role":"kontraktor"}`, "The rating field must be at least 1."},
		{"rating-word", `{"rating":"high","target_role":"kontraktor"}`, "The rating field must be an integer."},
		{"comment-long", `{"rating":5,"comment":"` + longStr(501) + `","target_role":"kontraktor"}`, "The comment field must not be greater than 500 characters."},
		{"comment-number", `{"rating":5,"comment":5,"target_role":"kontraktor"}`, "The comment field must be a string."},
		{"target-missing", `{"rating":5}`, "The target role field is required."},
		{"target-bogus", `{"rating":5,"target_role":"chef"}`, "The selected target role is invalid."},
	} {
		rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", tc.body, &fx.owner, p3)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("review %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}
	// active bid on an open project is not reviewable
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"kontraktor"}`, &fx.owner, hEProjectPath(hEProject2ID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("review active = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "You can only leave a review once the project is completed or the professional has left." {
		t.Fatalf("review active message = %q", got)
	}
	// no bid for the role at all: no assignment (P3 has no notaris bid)
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"notaris"}`, &fx.owner, p3)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("review no-bid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "No professional assignment found for role: notaris" {
		t.Fatalf("review no-bid message = %q", got)
	}
	// non-owner is refused
	rec = hECall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"kontraktor"}`, &fx.kontraktor, p3)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("review kontraktor = %d, want 403", rec.Code)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}
