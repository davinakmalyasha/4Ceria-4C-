package httpapi

// hE round 2: the reachable remainder — malformed-JSON tolerance on every
// body-reading handler, missing validation shapes, the team-only verify,
// design approvals for mep/interior, storage-failure 500s, NULL-photo
// index rows and the paid-link engineering-log refusal.

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestHERound2Malformed(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// Warranty window open so the store reaches field validation.
	if _, err := pool.Exec(ctx, `UPDATE projects SET warranty_end_at = now() + interval '30 days' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("warranty window: %v", err)
	}

	// A live addendum for the verify shapes (binding runs before validation).
	rec := hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","description":"hE round2"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("round2 addendum = %d %s", rec.Code, rec.Body.String())
	}
	var liveAdd int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id = $1 AND description = 'hE round2' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&liveAdd)
	liveAddPaths := map[string]string{"project": int64String(hEProjectID), "addendum": int64String(liveAdd)}

	// Stateless validation outcomes for a malformed body.
	type tc struct {
		name string
		h    http.HandlerFunc
		body string
		vals map[string]string
		who  *roadmapCaller
		code int
		want string
	}
	cases := []tc{
		{"req-eng", RequestEngineeringRoleHandler(pool), `{bad`, p, &fx.arsitek, 422, "The role type field is required."},
		{"verify-eng", VerifyEngineeringRequestHandler(pool), `{bad`, liveAddPaths, &fx.owner, 422, "The status field is required."},
		{"hire", ApproveEngineeringHireHandler(pool), `{bad`, map[string]string{"project": int64String(hEProjectID), "addendum": "999999999"}, &fx.owner, 404, "No query results"},
		{"integration", ApproveEngineeringIntegrationHandler(pool), `{bad`, p, &fx.owner, 422, "The role type field is required."},
		{"authorize", AuthorizeSpecialistHandler(pool), `{bad`, p, &fx.owner, 422, "The role type field is required."},
		{"reject-spec", RejectSpecialistHandler(pool), `{bad`, p, &fx.owner, 422, "The role type field is required."},
		{"reject-bid", RejectEngineeringBidHandler(pool), `{bad`, map[string]string{"project": int64String(hEProjectID), "bidId": "1"}, &fx.arsitek, 422, "The bid type field is required."},
		{"interview", SubmitEngineeringInterviewHandler(pool), `{bad`, p, &fx.arsitek, 422, "The bid id field is required."},
		{"submit-design", SubmitDesignHandler(pool), `{bad`, p, &fx.owner, 422, "The role type field is required."},
		{"approve-design", ApproveDesignHandler(pool), `{bad`, p, &fx.owner, 422, "The role type field is required."},
		{"revise-design", ReviseDesignHandler(pool), `{bad`, p, &fx.owner, 422, "The role type field is required."},
		{"submit-planning", SubmitPlanningHandler(pool), `{bad`, p, &fx.arsitek, 200, ""},
		{"kickoff", IssueKickoffHandler(pool), `{bad`, p, &fx.owner, 422, "The role field is required."},
		{"lock", LockPhaseBriefHandler(pool), `{bad`, p, &fx.kontraktor, 422, "The phase field is required."},
		{"review", ReviewProjectHandler(pool), `{bad`, p, &fx.owner, 422, "The rating field is required."},
		{"brief-revise", ReviseConstructionBriefHandler(pool), `{bad`, p, &fx.owner, 422, "The notes field is required."},
		{"co-store", StoreChangeOrderHandler(pool), `{bad`, p, &fx.kontraktor, 422, "The title field is required."},
		{"co-decide", ChangeOrderDecisionHandler(pool, "owner-decide"), `{bad`, map[string]string{"project": int64String(hEProjectID), "changeOrder": "1"}, &fx.owner, 404, "Not found."},
		{"ext-store", StoreExtensionHandler(pool), `{bad`, p, &fx.kontraktor, 422, "The reason field is required."},
		{"ext-decide", ExtensionDecisionHandler(pool, "pm-review"), `{bad`, map[string]string{"project": int64String(hEProjectID), "extension": "1"}, &fx.pm, 404, "Not found."},
		{"report-store", StoreReportHandler(pool), `{bad`, p, &fx.owner, 422, "The given data was invalid."},
		{"warranty-store", StoreWarrantyClaimHandler(pool), `{bad`, p, &fx.owner, 422, "The title field is required."},
		{"warranty-update", UpdateWarrantyClaimHandler(pool), `{bad`, map[string]string{"project": int64String(hEProjectID), "claim": "1"}, &fx.owner, 404, "No query results"},
		{"handover-approve", PhaseHandoverApproveHandler(pool), `{bad`, p, &fx.pm, 422, "The phase field is required."},
		{"handover-reject", PhaseHandoverRevisionHandler(pool), `{bad`, p, &fx.pm, 422, "The phase field is required."},
		{"daily-badjson", StoreDailyLogHandler(pool), `{bad`, p, &fx.kontraktor, 422, "The given data was invalid."},
		{"delay", LogDelayHandler(pool), `{bad`, p, &fx.pm, 422, "The phase slug field is required."},
	}
	for _, c := range cases {
		rec := hECall(t, c.h, http.MethodPost, "/x", c.body, c.who, c.vals)
		if rec.Code != c.code || (c.want != "" && !containsStr(rec.Body.String(), c.want)) {
			t.Fatalf("%s = %d %s, want %d %q", c.name, rec.Code, rec.Body.String(), c.code, c.want)
		}
	}

	// Planning submit tolerates the broken body and still proposes.
	var planningStatus string
	var iteration int64
	_ = pool.QueryRow(ctx, `SELECT planning_status::text, planning_iteration FROM projects WHERE id = $1`, hEProjectID).Scan(&planningStatus, &iteration)
	if planningStatus != "proposed" || iteration != 1 {
		t.Fatalf("malformed submit = %q/%d, want proposed/1", planningStatus, iteration)
	}

	// Report update with no fields still touches the row and answers 200.
	rec = hECall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hE round2","progress_percentage":10,"budget_health":"on_track"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report store = %d %s", rec.Code, rec.Body.String())
	}
	repID := int64(hEDecode(t, rec)["report"].(map[string]any)["id"].(float64))
	rec = hECall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{bad`, &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "report": int64String(repID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("report malformed update = %d %s", rec.Code, rec.Body.String())
	}

	// Schedule update with no fields is a 200 no-op with the phase shape.
	rec = hECall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedules = %d %s", rec.Code, rec.Body.String())
	}
	var schedID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_schedules WHERE project_id = $1 AND phase_slug = 'legal'`, hEProjectID).Scan(&schedID)
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{bad`, &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "schedule": int64String(schedID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("schedule malformed update = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Phase updated successfully." {
		t.Fatalf("schedule message = %q", got)
	}

	// Brief approve tolerates the broken body once the brief is pending.
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status = 'pending_review' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("pending: %v", err)
	}
	rec = hECall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", `{bad`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("brief malformed approve = %d %s", rec.Code, rec.Body.String())
	}

	// Owner-accept tolerates the broken body; null phases align so it finalizes.
	rec = hECall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{bad`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("accept malformed = %d %s", rec.Code, rec.Body.String())
	}
	var status string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, hEProjectID).Scan(&status)
	if status != "completed" {
		t.Fatalf("accept status = %q, want completed", status)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHERound2ValidationShapes(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// A live addendum for the verify shape (binding runs before validation).
	rec0 := hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x",
		`{"role_type":"mep","description":"hE shapes"}`, &fx.arsitek, p)
	if rec0.Code != http.StatusOK {
		t.Fatalf("shapes addendum = %d %s", rec0.Code, rec0.Body.String())
	}
	var liveAdd int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id = $1 AND description = 'hE shapes' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&liveAdd)
	liveAddPaths := map[string]string{"project": int64String(hEProjectID), "addendum": int64String(liveAdd)}

	// A live extension for the decide shape (binding runs before validation).
	recX := hECall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hE shape","days_requested":1}`, &fx.kontraktor, p)
	if recX.Code != http.StatusOK {
		t.Fatalf("shape ext = %d %s", recX.Code, recX.Body.String())
	}
	liveExtPaths := map[string]string{"project": int64String(hEProjectID),
		"extension": int64String(int64(hEDecode(t, recX)["data"].(map[string]any)["id"].(float64)))}

	// Non-string / missing shapes with exact messages.
	type tc struct {
		name string
		h    http.HandlerFunc
		body string
		vals map[string]string
		who  *roadmapCaller
		want string
	}
	cases := []tc{
		{"verify-status-number", VerifyEngineeringRequestHandler(pool), `{"status":5}`, liveAddPaths, &fx.owner, "The selected status is invalid."},
		{"integration-empty", ApproveEngineeringIntegrationHandler(pool), `{}`, p, &fx.owner, "The role type field is required."},
		{"integration-number", ApproveEngineeringIntegrationHandler(pool), `{"role_type":5}`, p, &fx.owner, "The selected role type is invalid."},
		{"authorize-empty", AuthorizeSpecialistHandler(pool), `{}`, p, &fx.owner, "The addendum id field is required."},
		{"reject-bid-empty", RejectEngineeringBidHandler(pool), `{}`, map[string]string{"project": int64String(hEProjectID), "bidId": "1"}, &fx.arsitek, "The bid type field is required."},
		{"daily-empty", StoreDailyLogHandler(pool), `{}`, p, &fx.kontraktor, "The log date field is required."},
		{"ext-status-number", ExtensionDecisionHandler(pool, "owner-decide"), `{"status":5}`, liveExtPaths, &fx.owner, "The selected status is invalid."},
	}
	// pm_notes non-string needs a live change order in proposed.
	rec := hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hE shape","description":"hE","cost_impact":10}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("shape co = %d %s", rec.Code, rec.Body.String())
	}
	shapeID := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	shapePaths := map[string]string{"project": int64String(hEProjectID), "changeOrder": int64String(shapeID)}
	cases = append(cases,
		tc{"co-owner-notes-long", ChangeOrderDecisionHandler(pool, "owner-decide"), `{"action":"reject","owner_notes":"` + longStr(2001) + `"}`, shapePaths, &fx.owner, "The owner notes field must not be greater than 2000 characters."},
		tc{"co-pm-notes-number", ChangeOrderDecisionHandler(pool, "pm-review"), `{"action":"approve","pm_notes":5}`, shapePaths, &fx.pm, "The pm notes field must be a string."})

	for _, c := range cases {
		rec := hECall(t, c.h, http.MethodPost, "/x", c.body, c.who, c.vals)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), c.want) {
			t.Fatalf("%s = %d %s, want 422 %q", c.name, rec.Code, rec.Body.String(), c.want)
		}
	}
	// The empty daily body names every required field.
	rec = hECall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p)
	for _, want := range []string{
		"The log date field is required.",
		"The weather field is required.",
		"The worker count field is required.",
		"The activities field is required.",
	} {
		if !containsStr(rec.Body.String(), want) {
			t.Fatalf("daily empty missing %q in %s", want, rec.Body.String())
		}
	}

	// Team-only request verifies into approved_unpaid (the || second arm).
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x",
		`{"role_type":"interior","description":"hE team only"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("team-only request = %d %s", rec.Code, rec.Body.String())
	}
	var teamAdd int64
	var teamID int64
	if err := pool.QueryRow(ctx, `INSERT INTO team_members (owner_user_id, name, role_title) VALUES ($1, 'hE T2', 'Drafter') RETURNING id`, hEOwnerID).Scan(&teamID); err != nil {
		t.Fatalf("team: %v", err)
	}
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id = $1 AND role_type = 'interior' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&teamAdd)
	if _, err := pool.Exec(ctx, `UPDATE project_addendums SET team_member_id = $2 WHERE id = $1`, teamAdd, teamID); err != nil {
		t.Fatalf("team link: %v", err)
	}
	tap := map[string]string{"project": int64String(hEProjectID), "addendum": int64String(teamAdd)}
	rec = hECall(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/x", `{"status":"approved"}`, &fx.owner, tap)
	if rec.Code != http.StatusOK {
		t.Fatalf("team verify = %d %s", rec.Code, rec.Body.String())
	}
	var teamStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id = $1`, teamAdd).Scan(&teamStatus)
	if teamStatus != "approved_unpaid" {
		t.Fatalf("team status = %q, want approved_unpaid", teamStatus)
	}
	var reqInterior bool
	_ = pool.QueryRow(ctx, `SELECT requires_interior FROM projects WHERE id = $1`, hEProjectID).Scan(&reqInterior)
	if !reqInterior {
		t.Fatalf("team verify must flip requires_interior")
	}

	// Reject-specialist across projects binds the 404, not a 422.
	xp := map[string]string{"project": int64String(hEProject2ID), "addendum": int64String(teamAdd)}
	rec = hECall(t, RejectSpecialistHandler(pool), http.MethodPost, "/x",
		`{"role_type":"interior","addendum_id":`+int64String(teamAdd)+`}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("reject-spec cross = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// Empty-string notes collapse to nil and still decide.
	rec = hECall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hE blank","days_requested":2}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("blank ext = %d %s", rec.Code, rec.Body.String())
	}
	blankID := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	bp := map[string]string{"project": int64String(hEProjectID), "extension": int64String(blankID)}
	rec = hECall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"status":"pm_reviewed","pm_notes":""}`, &fx.pm, bp)
	if rec.Code != http.StatusOK {
		t.Fatalf("blank pm notes = %d %s", rec.Code, rec.Body.String())
	}
	var pmNotes *string
	_ = pool.QueryRow(ctx, `SELECT pm_notes FROM project_timeline_extensions WHERE id = $1`, blankID).Scan(&pmNotes)
	if pmNotes != nil {
		t.Fatalf("pm_notes = %v, want NULL for blank", *pmNotes)
	}

	// Zero-cost owner approval mints no stage and still decides.
	rec = hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hE free","description":"hE","cost_impact":0,"owner_notes":""}`, &fx.kontraktor, p)
	_ = rec
	rec = hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hE free2","description":"hE","cost_impact":0}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("free co = %d %s", rec.Code, rec.Body.String())
	}
	freeID := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve","owner_notes":""}`, &fx.owner, map[string]string{"project": int64String(hEProjectID), "changeOrder": int64String(freeID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("free approve = %d %s", rec.Code, rec.Body.String())
	}
	var freeTermins int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_payment_termins WHERE change_order_id = $1`, freeID).Scan(&freeTermins)
	if freeTermins != 0 {
		t.Fatalf("free termins = %d, want 0", freeTermins)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHERound2DesignMore(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()

	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	// MEP approval stamps its own column.
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, status)
		VALUES ($1, $2, 'hE mep.pdf', 'vault/hE-mep.pdf', 'mep_layout', 'uploaded')`, hEProjectID, hEMepID); err != nil {
		t.Fatalf("mep doc: %v", err)
	}
	p := hEProjectPath(hEProjectID)
	rec := hECall(t, ApproveDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"mep"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve mep = %d %s", rec.Code, rec.Body.String())
	}
	var mepStamp *string
	_ = pool.QueryRow(ctx, `SELECT mep_approved_at::text FROM projects WHERE id = $1`, hEProjectID).Scan(&mepStamp)
	if mepStamp == nil {
		t.Fatalf("mep_approved_at missing")
	}
	// Mep specialist is told.
	var mepTold int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type = 'design_approved' AND user_id = $1`, hEMepID).Scan(&mepTold)
	if mepTold != 1 {
		t.Fatalf("mep notifs = %d, want 1", mepTold)
	}

	// Interior approval stamps the owner interior column.
	rec = hECall(t, ApproveDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"interior"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve interior = %d %s", rec.Code, rec.Body.String())
	}
	var interiorStamp *string
	_ = pool.QueryRow(ctx, `SELECT owner_interior_approved_at::text FROM projects WHERE id = $1`, hEProjectID).Scan(&interiorStamp)
	if interiorStamp == nil {
		t.Fatalf("owner_interior_approved_at missing")
	}

	// Approving a role with no hired specialist skips the notification.
	p2 := hEProjectPath(hEProject2ID)
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, status)
		VALUES ($1, $2, 'hE mep2.pdf', 'vault/hE-mep2.pdf', 'mep_layout', 'uploaded')`, hEProject2ID, hEMepID); err != nil {
		t.Fatalf("p2 doc: %v", err)
	}
	rec = hECall(t, ApproveDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"mep"}`, &fx.owner, p2)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve mep no-hire = %d %s", rec.Code, rec.Body.String())
	}
	var stray int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type = 'design_approved' AND user_id = $1`, hEMepID).Scan(&stray)
	if stray != mepTold {
		t.Fatalf("no-hire approve notified the specialist: %d vs %d", stray, mepTold)
	}

	// Submitting on a project without a PM notifies only the owner.
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, status)
		VALUES ($1, $2, 'hE mep3.pdf', 'vault/hE-mep3.pdf', 'mep_layout', 'uploaded')`, hEProject2ID, hEMepID); err != nil {
		t.Fatalf("p2 doc2: %v", err)
	}
	rec = hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"mep"}`, &fx.owner, p2)
	if rec.Code != http.StatusOK {
		t.Fatalf("submit no-pm = %d %s", rec.Code, rec.Body.String())
	}
	var ownerTold int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type = 'design_submitted' AND user_id = $1`, hEOwnerID).Scan(&ownerTold)
	if ownerTold != 0 {
		t.Fatalf("owner self-submit notified the owner: %d", ownerTold)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHERound2Storage500(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// Point the public disk at a regular file: every write fails
	// deterministically (all upload paths here are public prefixes).
	blocker := filepath.Join(t.TempDir(), "blocker")
	if err := os.WriteFile(blocker, []byte("hE"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PUBLIC_STORAGE_ROOT", blocker)
	t.Setenv("EVIDENCE_DIR", blocker)

	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 64)...)

	// Daily log with a photo.
	reader, ctype := hEMultipartFile(t,
		map[string]string{"log_date": "2026-04-05", "weather": "sunny", "worker_count": "2", "activities": "hE blocked"},
		"photos", "hE.png", png)
	drec := serveHE(StoreDailyLogHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.kontraktor))
	if drec.Code != http.StatusInternalServerError || !containsStr(drec.Body.String(), "Server Error") {
		t.Fatalf("daily blocked = %d %s", drec.Code, drec.Body.String())
	}

	// Warranty claim with an image.
	reader, ctype = hEMultipartFiles(t, map[string]string{"title": "hE blocked", "description": "hE"}, "images",
		[]hEFile{{name: "hE.png", data: png}})
	if _, err := pool.Exec(ctx, `UPDATE projects SET warranty_end_at = now() + interval '30 days' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("warranty: %v", err)
	}
	wrec := serveHE(StoreWarrantyClaimHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.owner))
	if wrec.Code != http.StatusInternalServerError || !containsStr(wrec.Body.String(), "Server Error") {
		t.Fatalf("warranty blocked = %d %s", wrec.Code, wrec.Body.String())
	}
	var claims int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_warranty_claims WHERE project_id = $1`, hEProjectID).Scan(&claims)
	if claims != 0 {
		t.Fatalf("blocked warranty stored %d rows", claims)
	}

	// Engineering log with a file.
	reader, ctype = hEMultipartFiles(t,
		map[string]string{"role_type": "structural", "title": "hE blocked", "description": "hE"}, "files",
		[]hEFile{{name: "hE.pdf", data: []byte("%PDF-1.4\nhE\n%%EOF\n")}})
	erec := serveHE(StoreEngineeringLogHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.arsitek))
	if erec.Code != http.StatusInternalServerError || !containsStr(erec.Body.String(), "Server Error") {
		t.Fatalf("eng-log blocked = %d %s", erec.Code, erec.Body.String())
	}

	// Planning verify with an audit attachment.
	if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'proposed' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("propose: %v", err)
	}
	reader, ctype = hEMultipartFile(t, map[string]string{}, "attachments", "hE.png", png)
	vreq := newHEFileRequest(t, "/x", reader, ctype, p, &fx.pm)
	vrec := serveHE(VerifyPlanningPMHandler(pool), vreq)
	if vrec.Code != http.StatusInternalServerError || !containsStr(vrec.Body.String(), "Server Error") {
		t.Fatalf("planning blocked = %d %s", vrec.Code, vrec.Body.String())
	}

	// Report store with a photo names its own failure.
	reader, ctype = hEMultipartFiles(t,
		map[string]string{"summary": "hE blocked", "progress_percentage": "10", "budget_health": "on_track"}, "photos",
		[]hEFile{{name: "hE.png", data: png}})
	rrec := serveHE(StoreReportHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.owner))
	if rrec.Code != http.StatusInternalServerError || !containsStr(rrec.Body.String(), "Failed to publish report: Server Error") {
		t.Fatalf("report blocked = %d %s", rrec.Code, rrec.Body.String())
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHERound2DailyPhotos(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	if _, err := pool.Exec(ctx, `UPDATE projects SET pbg_verified_at = now() WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("pbg: %v", err)
	}

	// Oversize image: same 422 as a non-image.
	big := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 6<<20)...)
	reader, ctype := hEMultipartFile(t,
		map[string]string{"log_date": "2026-04-06", "weather": "sunny", "worker_count": "2", "activities": "hE big"},
		"photos", "hE-big.png", big)
	brec := serveHE(StoreDailyLogHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.kontraktor))
	if brec.Code != http.StatusUnprocessableEntity || !containsStr(brec.Body.String(), "The photos field must be an image no larger than 5120 kilobytes.") {
		t.Fatalf("daily big photo = %d %s", brec.Code, brec.Body.String())
	}

	// NULL photos and empty-string photos both render an empty array.
	for _, tc := range []struct {
		name   string
		photos string
		when   string
	}{
		{"null", `NULL`, "2026-04-07"},
		{"blank", `'[""]'`, "2026-04-08"},
	} {
		if _, err := pool.Exec(ctx, `INSERT INTO project_daily_logs (project_id, user_id, log_date, weather, worker_count, activities, photos)
			VALUES ($1, $2, $3, 'sunny', 1, 'hE `+tc.name+`', `+tc.photos+`::jsonb)`, hEProjectID, hEKontrakID, tc.when); err != nil {
			t.Fatalf("seed %s: %v", tc.name, err)
		}
	}
	rec := hECall(t, DailyLogsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("index = %d %s", rec.Code, rec.Body.String())
	}
	var index struct {
		Data []struct {
			Photos []string `json:"photos"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &index); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(index.Data) != 2 {
		t.Fatalf("rows = %d, want 2", len(index.Data))
	}
	for i, row := range index.Data {
		if len(row.Photos) != 0 {
			t.Fatalf("row %d photos = %v, want empty", i, row.Photos)
		}
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_daily_logs WHERE project_id = $1`, hEProjectID); err != nil {
		t.Fatalf("cleanup: %v", err)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHERound2EngLog(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	// JSON shapes: numbers fail their type rules, long titles fail length.
	for _, tc := range []struct{ name, body, want string }{
		{"role-number", `{"role_type":5,"title":"hE","description":"hE"}`, "The selected role type is invalid."},
		{"title-number", `{"role_type":"structural","title":5,"description":"hE"}`, "The title field must be a string."},
		{"title-long", `{"role_type":"structural","title":"` + longStr(256) + `","description":"hE"}`, "The title field must not be greater than 255 characters."},
		{"title-blank", `{"role_type":"structural","title":"","description":"hE"}`, "The title field is required."},
		{"desc-number", `{"role_type":"structural","title":"hE","description":5}`, "The description field must be a string."},
	} {
		rec := hECall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/x", tc.body, &fx.arsitek, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("eng-log %s = %d %s, want 422 %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	// JSON happy path (no files): the already-approved manual log is born.
	rec := hECall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","title":"hE json log","description":"hE poured"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("eng-log json = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Log recorded successfully" {
		t.Fatalf("eng-log message = %q", got)
	}
	var jsonLog int64
	var approval string
	var sortOrder int64
	_ = pool.QueryRow(ctx, `SELECT id, approval_status::text, sort_order FROM project_milestones
		WHERE project_id = $1 AND title = 'hE json log' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&jsonLog, &approval, &sortOrder)
	if jsonLog == 0 || approval != "approved" || sortOrder != 1 {
		t.Fatalf("json log = %d/%q/%d, want id/approved/1", jsonLog, approval, sortOrder)
	}

	// A paid link refuses the delete with the exact message.
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, milestone_id)
		VALUES ($1, 'hE paid stage', 0, 1000, 0, 1000, 'paid', $2)`, hEProjectID, jsonLog); err != nil {
		t.Fatalf("paid termin: %v", err)
	}
	dp := map[string]string{"project": int64String(hEProjectID), "milestone": int64String(jsonLog)}
	rec = hECall(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/x", "", &fx.arsitek, dp)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("eng-del paid = %d, want 400 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Cannot delete a step linked to a PAID payment." {
		t.Fatalf("eng-del paid message = %q", got)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE milestone_id = $1`, jsonLog); err != nil {
		t.Fatalf("termin cleanup: %v", err)
	}

	// File shapes over multipart: wrong type, then oversize, then happy.
	pdf := []byte("%PDF-1.4\nhE\n%%EOF\n")
	reader, ctype := hEMultipartFiles(t,
		map[string]string{"role_type": "structural", "title": "hE f", "description": "hE"},
		"files", []hEFile{{name: "hE-note.txt", data: []byte("hE plain")}})
	trec := serveHE(StoreEngineeringLogHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.arsitek))
	if trec.Code != http.StatusUnprocessableEntity || !containsStr(trec.Body.String(), "The files.0 field must be a file of type: jpg, jpeg, png, webp, pdf.") {
		t.Fatalf("eng-log txt = %d %s", trec.Code, trec.Body.String())
	}
	huge := append([]byte("%PDF-1.4\n"), make([]byte, 11<<20)...)
	reader, ctype = hEMultipartFiles(t,
		map[string]string{"role_type": "structural", "title": "hE f", "description": "hE"},
		"files", []hEFile{{name: "hE-big.pdf", data: huge}})
	brec := serveHE(StoreEngineeringLogHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.arsitek))
	if brec.Code != http.StatusUnprocessableEntity || !containsStr(brec.Body.String(), "The files.0 field must not be greater than 10240 kilobytes.") {
		t.Fatalf("eng-log huge = %d %s", brec.Code, brec.Body.String())
	}
	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 64)...)
	reader, ctype = hEMultipartFiles(t,
		map[string]string{"role_type": "structural", "title": "hE file log", "description": "hE"},
		"files", []hEFile{{name: "hE-site.png", data: png}, {name: "hE-plan.pdf", data: pdf}})
	grec := serveHE(StoreEngineeringLogHandler(pool), newHEFileRequest(t, "/x", reader, ctype, p, &fx.arsitek))
	if grec.Code != http.StatusOK {
		t.Fatalf("eng-log files = %d %s", grec.Code, grec.Body.String())
	}
	var gallery string
	_ = pool.QueryRow(ctx, `SELECT content::text FROM project_milestones WHERE project_id = $1 AND title = 'hE file log' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&gallery)
	if !containsStr(gallery, "milestones/gallery") {
		t.Fatalf("gallery = %q, want stored vault paths", gallery)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}
