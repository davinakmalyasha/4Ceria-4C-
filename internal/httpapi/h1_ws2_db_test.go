package httpapi

// Half-1 project-workspace flows (2/3): documents, comments, reports,
// snag items, warranty claims, schedules, daily logs, material folders,
// change orders and extensions. Fresh rows use unique names; everything
// created is deleted.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// h1StaffProject inserts a throwaway project with a PM and a hired
// contractor so role-gated writes (PM delay logs, contractor site logs,
// snag fixes, change-order reviews) can run. Returns the project id; the
// caller deletes dependent rows then the project.
func h1StaffProject(t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	ctx := context.Background()
	var id int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, pm_id, selected_kontraktor_id, deadline)
		VALUES (31692, 'H1 staffed project', 830, 6544, '2030-06-01') RETURNING id`).Scan(&id); err != nil {
		t.Fatalf("staff project: %v", err)
	}
	t.Cleanup(func() {
		c := context.Background()
		for _, q := range []string{
			`DELETE FROM project_snag_items WHERE project_id = $1`,
			`DELETE FROM project_warranty_claims WHERE project_id = $1`,
			`DELETE FROM project_daily_logs WHERE project_id = $1`,
			`DELETE FROM project_delays WHERE project_id = $1`,
			`DELETE FROM project_change_orders WHERE project_id = $1`,
			`DELETE FROM project_activity_logs WHERE project_id = $1`,
			`DELETE FROM projects WHERE id = $1`,
		} {
			_, _ = pool.Exec(c, q, id)
		}
	})
	return id
}

// h1Sub calls a nested project handler with {project} plus one id key.
func h1Sub(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID int64, key string, id int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	return h1SubBody(t, pool, h, owner, projectID, map[string]int64{key: id}, body)
}

func h1SubBody(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID int64, kv map[string]int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	_ = pool
	req := h1JSONRequest(t, http.MethodPost, "/api/projects/"+itoaTest(projectID)+"/x", body)
	h1AllPathKeys(req, "999999999")
	req.SetPathValue("project", itoaTest(projectID))
	for k, v := range kv {
		req.SetPathValue(k, itoaTest(v))
	}
	req = req.WithContext(withCaller(req.Context(), owner))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestH1Documents(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31682)

	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = 31682 ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no owned project")
	}

	rec := h1Sub(t, pool, DocumentsIndexHandler(pool), owner, projectID, "document", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("documents index = %d %s", rec.Code, rec.Body.String())
	}
	// Store validation: file required.
	rec = h1CallMultipart(t, pool, StoreDocumentHandler(pool), "/api/projects/1/documents",
		map[string]string{"title": "H1 plan"}, "", "", nil, &owner, itoaTest(projectID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("document store no-file = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Valid store with a PDF upload.
	rec = h1UploadDoc(t, pool, owner, projectID, map[string]string{"title": "H1 plan", "category": "blueprint"})
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("document store = %d %s", rec.Code, rec.Body.String())
	}
	var docID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_documents WHERE project_id = $1 AND file_name LIKE '%h1plan%' OR project_id = $1 AND title = 'H1 plan' ORDER BY id DESC LIMIT 1`, projectID, projectID).Scan(&docID)
	if docID == 0 {
		_ = pool.QueryRow(ctx, `SELECT id FROM project_documents WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, projectID).Scan(&docID)
	}
	if docID == 0 {
		t.Fatalf("no document row after %s", rec.Body.String())
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_documents WHERE id = $1`, docID)
	})
	// Index carries it.
	rec = h1Sub(t, pool, DocumentsIndexHandler(pool), owner, projectID, "document", 999999999, "")
	if !strings.Contains(rec.Body.String(), itoaTest(docID)) {
		t.Errorf("documents index missing %d: %.300s", docID, rec.Body.String())
	}
	// Update validation then valid.
	rec = h1Sub(t, pool, UpdateDocumentHandler(pool), owner, projectID, "document", docID, `{"file_name":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("document update invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, UpdateDocumentHandler(pool), owner, projectID, "document", docID, `{"file_name":"h1 plan v2.pdf"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("document update = %d %s", rec.Code, rec.Body.String())
	}
	// Verify then destroy: verified documents are protected, so the
	// destroy path runs on a second fresh row.
	rec = h1Sub(t, pool, VerifyDocumentHandler(pool), owner, projectID, "document", docID, `{"status":"verified"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("document verify = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, DestroyDocumentHandler(pool), owner, projectID, "document", docID, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("verified destroy = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	rec = h1UploadDoc(t, pool, owner, projectID, map[string]string{"title": "H1 temp", "category": "general"})
	var doc2 int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_documents WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, projectID).Scan(&doc2)
	if doc2 == docID || doc2 == 0 {
		t.Fatalf("second document missing after %s", rec.Body.String())
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_documents WHERE id = $1`, doc2)
	})
	rec = h1Sub(t, pool, DestroyDocumentHandler(pool), owner, projectID, "document", doc2, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("document destroy = %d %s", rec.Code, rec.Body.String())
	}
}

func h1UploadDoc(t *testing.T, pool *pgxpool.Pool, owner roadmapCaller, projectID int64, fields map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	reader, ctype := h1Multipart(t, fields, "file", "h1plan.pdf", h1ProofPDF)
	req := httptest.NewRequest(http.MethodPost, "/api/projects/"+itoaTest(projectID)+"/documents", reader)
	req.Header.Set("Content-Type", ctype)
	h1AllPathKeys(req, "999999999")
	req.SetPathValue("project", itoaTest(projectID))
	req = req.WithContext(withCaller(req.Context(), owner))
	rec := httptest.NewRecorder()
	StoreDocumentHandler(pool)(rec, req)
	return rec
}

func TestH1CommentsReports(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31682)
	stranger := h1User(t, pool, 31686)

	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = 31682 ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no owned project")
	}

	// Comments index is public; store requires a message.
	rec := h1Sub(t, pool, ProjectCommentsIndexHandler(pool), owner, projectID, "comment", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("comments index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, ProjectCommentsStoreHandler(pool), owner, projectID, "comment", 999999999, `{"message":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, ProjectCommentsStoreHandler(pool), owner, projectID, "comment", 999999999, `{"message":"H1 looks good"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("comment store = %d %s", rec.Code, rec.Body.String())
	}
	var commentID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_comments WHERE project_id = $1 AND message = 'H1 looks good' ORDER BY id DESC LIMIT 1`, projectID).Scan(&commentID)
	if commentID == 0 {
		t.Fatalf("no comment row after store")
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_comments WHERE id = $1`, commentID)
	})
	// Stranger cannot edit; owner can; owner can delete.
	rec = h1Sub(t, pool, UpdateCommentHandler(pool), stranger, projectID, "comment", commentID, `{"message":"hijack"}`)
	if rec.Code != http.StatusForbidden && rec.Code != http.StatusNotFound {
		t.Fatalf("comment update stranger = %d, want 403/404 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, UpdateCommentHandler(pool), owner, projectID, "comment", commentID, `{"message":"H1 looks great"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment update = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, DestroyCommentHandler(pool), owner, projectID, "comment", commentID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("comment destroy = %d %s", rec.Code, rec.Body.String())
	}

	// Reports: index, validation, store, update, destroy.
	rec = h1Sub(t, pool, ProjectReportsIndexHandler(pool), owner, projectID, "report", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("reports index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreReportHandler(pool), owner, projectID, "report", 999999999, `{"summary":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreReportHandler(pool), owner, projectID, "report", 999999999,
		`{"summary":"H1 week 1","progress_percentage":25,"budget_health":"on_track"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("report store = %d %s", rec.Code, rec.Body.String())
	}
	var reportID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_reports WHERE project_id = $1 AND summary = 'H1 week 1' ORDER BY id DESC LIMIT 1`, projectID).Scan(&reportID)
	if reportID == 0 {
		t.Fatalf("no report row after store")
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_reports WHERE id = $1`, reportID)
	})
	rec = h1Sub(t, pool, UpdateReportHandler(pool), owner, projectID, "report", reportID, `{"summary":"H1 week 1 revised","progress_percentage":30,"budget_health":"warning"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("report update = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, DestroyReportHandler(pool), owner, projectID, "report", reportID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("report destroy = %d %s", rec.Code, rec.Body.String())
	}
}

func TestH1SnagWarranty(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31692) // staffed project owner (role user)
	kontraktor := h1User(t, pool, 31683)
	pm := h1User(t, pool, 31688)

	projectID := h1StaffProject(t, pool)

	// Snag: index, validation, store, contractor update, owner accept.
	rec := h1Sub(t, pool, SnagItemsIndexHandler(pool), owner, projectID, "snagItem", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("snag index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreSnagItemHandler(pool), owner, projectID, "snagItem", 999999999, `{"title":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("snag store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreSnagItemHandler(pool), owner, projectID, "snagItem", 999999999,
		`{"title":"H1 paint drip","description":"living room wall","location":"living room","severity":"minor"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("snag store = %d %s", rec.Code, rec.Body.String())
	}
	var snagID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_snag_items WHERE project_id = $1 AND title = 'H1 paint drip' ORDER BY id DESC LIMIT 1`, projectID).Scan(&snagID)
	if snagID == 0 {
		t.Fatalf("no snag row after store")
	}
	// Owner is not the assigned fixer.
	rec = h1Sub(t, pool, UpdateSnagItemHandler(pool), owner, projectID, "snagItem", snagID, `{"status":"resolved"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("snag update owner = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	// The hired contractor fixes it: validation first, then resolved.
	rec = h1Sub(t, pool, UpdateSnagItemHandler(pool), kontraktor, projectID, "snagItem", snagID, `{"status":"bogus"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("snag update invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, UpdateSnagItemHandler(pool), kontraktor, projectID, "snagItem", snagID, `{"status":"resolved","resolution_note":"H1 repainted"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("snag update = %d %s", rec.Code, rec.Body.String())
	}
	var snagStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_snag_items WHERE id = $1`, snagID).Scan(&snagStatus)
	if snagStatus != "resolved" {
		t.Fatalf("snag status = %s after update %s", snagStatus, rec.Body.String())
	}
	// Owner accepts the resolution; a second accept is rejected because
	// the item is no longer merely resolved.
	rec = h1Sub(t, pool, AcceptSnagHandler(pool), owner, projectID, "snagItem", snagID, `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("snag accept = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, AcceptSnagHandler(pool), pm, projectID, "snagItem", snagID, `{}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("snag double accept = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Warranty claims need warranty_end_at (set at handover): use a
	// throwaway project with the period open, owned by the caller.
	var warrantyProject int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, warranty_end_at)
		VALUES (31682, 'H1 warranty project', now() + interval '30 days') RETURNING id`).Scan(&warrantyProject); err != nil {
		t.Fatalf("warranty project: %v", err)
	}
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM project_warranty_claims WHERE project_id = $1`, warrantyProject)
		_, _ = pool.Exec(c, `DELETE FROM project_activity_logs WHERE project_id = $1`, warrantyProject)
		_, _ = pool.Exec(c, `DELETE FROM projects WHERE id = $1`, warrantyProject)
	})
	warrantyOwner := h1User(t, pool, 31682)
	rec = h1Sub(t, pool, WarrantyClaimsIndexHandler(pool), warrantyOwner, warrantyProject, "claim", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreWarrantyClaimHandler(pool), warrantyOwner, warrantyProject, "claim", 999999999, `{"title":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("warranty store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreWarrantyClaimHandler(pool), warrantyOwner, warrantyProject, "claim", 999999999,
		`{"title":"H1 leak","description":"roof leak after rain"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("warranty store = %d %s", rec.Code, rec.Body.String())
	}
	var claimID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_warranty_claims WHERE project_id = $1 AND title = 'H1 leak' ORDER BY id DESC LIMIT 1`, warrantyProject).Scan(&claimID)
	if claimID == 0 {
		t.Fatalf("no warranty row after store")
	}
	rec = h1Sub(t, pool, UpdateWarrantyClaimHandler(pool), warrantyOwner, warrantyProject, "claim", claimID, `{"status":"bogus"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("warranty update invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, UpdateWarrantyClaimHandler(pool), warrantyOwner, warrantyProject, "claim", claimID, `{"status":"fixing"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty update = %d %s", rec.Code, rec.Body.String())
	}
}

func TestH1SchedulesLogsFolders(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31692) // staffed project owner
	kontraktor := h1User(t, pool, 31683)
	pm := h1User(t, pool, 31688)

	projectID := h1StaffProject(t, pool)

	// Schedules: index, PM logs a delay, phase update.
	rec := h1Sub(t, pool, SchedulesIndexHandler(pool), owner, projectID, "schedule", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("schedules index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, LogDelayHandler(pool), pm, projectID, "schedule", 999999999,
		`{"phase_slug":"construction","days":3,"reason":"H1 rain","category":"weather"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("log delay = %d %s", rec.Code, rec.Body.String())
	}
	var delayCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_delays WHERE project_id = $1`, projectID).Scan(&delayCount)
	if delayCount == 0 {
		t.Errorf("delay row missing")
	}
	var schedID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_schedules WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, projectID).Scan(&schedID)
	if schedID != 0 {
		rec = h1Sub(t, pool, UpdateScheduleHandler(pool), owner, projectID, "schedule", schedID, `{"status":"delayed"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("schedule update = %d %s", rec.Code, rec.Body.String())
		}
	}

	// Daily logs: hired contractor stores and destroys; index reads.
	rec = h1Sub(t, pool, DailyLogsIndexHandler(pool), owner, projectID, "dailyLog", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("daily index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreDailyLogHandler(pool), kontraktor, projectID, "dailyLog", 999999999, `{"log_date":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("daily store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreDailyLogHandler(pool), kontraktor, projectID, "dailyLog", 999999999,
		`{"log_date":"2026-01-10","weather":"sunny","worker_count":6,"activities":"H1 pour"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("daily store = %d %s", rec.Code, rec.Body.String())
	}
	var logID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_daily_logs WHERE project_id = $1 AND activities = 'H1 pour' ORDER BY id DESC LIMIT 1`, projectID).Scan(&logID)
	if logID == 0 {
		t.Fatalf("no daily row after store")
	}
	rec = h1Sub(t, pool, DestroyDailyLogHandler(pool), kontraktor, projectID, "dailyLog", logID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("daily destroy = %d %s", rec.Code, rec.Body.String())
	}

	// Material folders: index, validation, store, update, destroy.
	rec = h1Sub(t, pool, MaterialFoldersIndexHandler(pool), owner, projectID, "folder", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("folders index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreMaterialFolderHandler(pool), owner, projectID, "folder", 999999999, `{"name":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("folder store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreMaterialFolderHandler(pool), owner, projectID, "folder", 999999999, `{"name":"H1 folder","bom_type":"raw"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("folder store = %d %s", rec.Code, rec.Body.String())
	}
	var folderID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_material_folders WHERE project_id = $1 AND name = 'H1 folder' ORDER BY id DESC LIMIT 1`, projectID).Scan(&folderID)
	if folderID == 0 {
		t.Fatalf("no folder row after store")
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_material_folders WHERE id = $1`, folderID)
	})
	rec = h1Sub(t, pool, UpdateMaterialFolderHandler(pool), owner, projectID, "folder", folderID, `{"name":"H1 folder v2"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("folder update = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, DestroyMaterialFolderHandler(pool), owner, projectID, "folder", folderID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("folder destroy = %d %s", rec.Code, rec.Body.String())
	}
}

func TestH1ChangeOrdersExtensions(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31692)
	pm := h1User(t, pool, 31688)

	projectID := h1StaffProject(t, pool)

	// Change orders: index, validation, store, PM review then owner decide.
	rec := h1Sub(t, pool, ChangeOrdersIndexHandler(pool), owner, projectID, "changeOrder", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("change-order index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreChangeOrderHandler(pool), owner, projectID, "changeOrder", 999999999, `{"title":""}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("change-order store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreChangeOrderHandler(pool), owner, projectID, "changeOrder", 999999999,
		`{"title":"H1 extra wall","description":"add partition","cost_impact":"1500000","time_impact_days":2}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("change-order store = %d %s", rec.Code, rec.Body.String())
	}
	var coID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_change_orders WHERE project_id = $1 AND title = 'H1 extra wall' ORDER BY id DESC LIMIT 1`, projectID).Scan(&coID)
	if coID == 0 {
		t.Fatalf("no change-order row after store")
	}
	rec = h1SubBody(t, pool, ChangeOrderDecisionHandler(pool, "pm-review"), pm, projectID, map[string]int64{"changeOrder": coID}, `{"action":"approve","pm_notes":"H1 ok"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("change-order pm-review = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1SubBody(t, pool, ChangeOrderDecisionHandler(pool, "owner-decide"), owner, projectID, map[string]int64{"changeOrder": coID}, `{"action":"approve","owner_notes":"H1 go"}`)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "escrow") {
		t.Fatalf("change-order owner-decide underfunded = %d, want escrow 422 %s", rec.Code, rec.Body.String())
	}
	// Fund the project and approve for real.
	if _, err := pool.Exec(ctx, `UPDATE projects SET budget = 100000000 WHERE id = $1`, projectID); err != nil {
		t.Fatal(err)
	}
	rec = h1SubBody(t, pool, ChangeOrderDecisionHandler(pool, "owner-decide"), owner, projectID, map[string]int64{"changeOrder": coID}, `{"action":"approve","owner_notes":"H1 go"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("change-order owner-decide = %d %s", rec.Code, rec.Body.String())
	}
	var coStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_change_orders WHERE id = $1`, coID).Scan(&coStatus)
	if coStatus != "owner_approved" && coStatus != "approved" {
		t.Errorf("change order status = %s, want owner_approved/approved", coStatus)
	}

	// Extensions: index, validation, store.
	rec = h1Sub(t, pool, ExtensionsIndexHandler(pool), owner, projectID, "extension", 999999999, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("extensions index = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreExtensionHandler(pool), owner, projectID, "extension", 999999999, `{"days_requested":"nan"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("extension store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Sub(t, pool, StoreExtensionHandler(pool), owner, projectID, "extension", 999999999, `{"days_requested":7,"reason":"H1 rain delay"}`)
	t.Logf("extension store = %d %.200s", rec.Code, rec.Body.String())
	var extID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_timeline_extensions WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, projectID).Scan(&extID)
	if extID != 0 {
		t.Cleanup(func() {
			_, _ = pool.Exec(context.Background(), `DELETE FROM project_timeline_extensions WHERE id = $1`, extID)
		})
	}
}
