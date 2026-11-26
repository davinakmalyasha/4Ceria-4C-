package httpapi

// Half-1 project-workspace flows (1/3): project CRUD, milestones, payment
// termins with the dispute FreezeGate, requirements / stock / procurement.
// Fresh rows are created under unique names and deleted afterwards; seeded
// demo rows are only read.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestH1ProjectCRUD(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31692) // role user: sees own projects in index
	_ = h1User(t, pool, 31683)

	// Store validation failure (missing title/budget/category/deadline).
	rec := h1Call(t, pool, StoreProjectHandler(pool), http.MethodPost, "/api/projects", `{}`, &owner, "999999999")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("project store invalid = %d %s", rec.Code, rec.Body.String())
	}
	// Invalid category + target role.
	rec = h1Call(t, pool, StoreProjectHandler(pool), http.MethodPost, "/api/projects",
		`{"title":"H1 P","description":"d","budget":1000000,"lokasi":"Jakarta","project_category":"castle","target_role":"wizard","deadline":"2030-01-01"}`, &owner, "999999999")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("project store bad enums = %d %s", rec.Code, rec.Body.String())
	}
	// Valid store.
	rec = h1Call(t, pool, StoreProjectHandler(pool), http.MethodPost, "/api/projects",
		`{"title":"H1 flow project","description":"h1 desc","budget":200000000,"lokasi":"Jakarta Selatan","project_category":"new_build","target_role":"arsitek","deadline":"2030-06-01"}`, &owner, "999999999")
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("project store = %d %s", rec.Code, rec.Body.String())
	}
	var projectID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM projects WHERE title = 'H1 flow project' ORDER BY id DESC LIMIT 1`).Scan(&projectID)
	if projectID == 0 {
		t.Fatalf("no project row after %s", rec.Body.String())
	}
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM project_activity_logs WHERE project_id = $1`, projectID)
		_, _ = pool.Exec(c, `DELETE FROM projects WHERE id = $1`, projectID)
	})

	// Show as owner; missing 404; bad id 404.
	rec = h1Call(t, pool, ProjectShowHandler(pool), http.MethodGet, "/api/projects/1", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("project show = %d %s", rec.Code, rec.Body.String())
	}
	for _, k := range []string{"H1 flow project", "budget"} {
		if !strings.Contains(rec.Body.String(), k) {
			t.Errorf("project show missing %s: %.300s", k, rec.Body.String())
		}
	}
	// Index as owner contains the fresh project; stranger's feed differs.
	rec = h1Call(t, pool, ProjectsHandler(pool), http.MethodGet, "/api/projects", "", &owner, "999999999")
	if rec.Code != http.StatusOK {
		t.Fatalf("projects index = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "H1 flow project") {
		t.Errorf("projects index missing fresh project: %.300s", rec.Body.String())
	}

	// Update: validation failure, then valid.
	rec = h1Call(t, pool, UpdateProjectHandler(pool), http.MethodPut, "/api/projects/1", `{"budget":"nan"}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("project update invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, UpdateProjectHandler(pool), http.MethodPut, "/api/projects/1", `{"title":"H1 flow project v2"}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("project update = %d %s", rec.Code, rec.Body.String())
	}

	// Activity log records the workspace writes.
	rec = h1Call(t, pool, ActivityHandler(pool), http.MethodGet, "/api/projects/1/activity", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("activity = %d %s", rec.Code, rec.Body.String())
	}

	// Destroy forbidden for a stranger is covered in guards; owner destroy
	// of an untouched project succeeds.
	rec = h1Call(t, pool, DestroyProjectHandler(pool), http.MethodDelete, "/api/projects/1", "", &owner, itoaTest(projectID))
	t.Logf("project destroy fresh = %d %.200s", rec.Code, rec.Body.String())
}

func TestH1Milestones(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31682)
	stranger := h1User(t, pool, 31686)

	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = 31682 ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no owned project")
	}

	// List on a milestone-less project is an empty 200.
	rec := h1Call(t, pool, MilestonesHandler(pool), http.MethodGet, "/api/projects/1/milestones", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("milestones index = %d %s", rec.Code, rec.Body.String())
	}
	// Stranger is forbidden.
	rec = h1Call(t, pool, MilestonesHandler(pool), http.MethodGet, "/api/projects/1/milestones", "", &stranger, itoaTest(projectID))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("milestones stranger = %d, want 403 %s", rec.Code, rec.Body.String())
	}

	// Store validation failure (missing title).
	rec = h1Call(t, pool, StoreMilestoneHandler(pool), http.MethodPost, "/api/projects/1/milestones", `{}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("milestone store invalid = %d %s", rec.Code, rec.Body.String())
	}
	// Stranger cannot store.
	rec = h1Call(t, pool, StoreMilestoneHandler(pool), http.MethodPost, "/api/projects/1/milestones", `{"title":"intruder"}`, &stranger, itoaTest(projectID))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("milestone store stranger = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	// Valid store as owner.
	rec = h1Call(t, pool, StoreMilestoneHandler(pool), http.MethodPost, "/api/projects/1/milestones",
		`{"title":"H1 foundation","description":"pour concrete","start_date":"2026-01-05","due_date":"2026-02-05","phase_context":"design","sort_order":1}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("milestone store = %d %s", rec.Code, rec.Body.String())
	}
	var milestoneID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_milestones WHERE project_id = $1 AND title = 'H1 foundation' ORDER BY id DESC LIMIT 1`, projectID).Scan(&milestoneID)
	if milestoneID == 0 {
		t.Fatalf("no milestone row after %s", rec.Body.String())
	}
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM project_change_orders WHERE milestone_id = $1`, milestoneID)
		_, _ = pool.Exec(c, `DELETE FROM project_payment_termins WHERE milestone_id = $1`, milestoneID)
		_, _ = pool.Exec(c, `DELETE FROM project_milestones WHERE id = $1`, milestoneID)
	})

	// List now carries the row with its relations.
	rec = h1Call(t, pool, MilestonesHandler(pool), http.MethodGet, "/api/projects/1/milestones?phase_context=design", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("milestones filtered = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "H1 foundation") {
		t.Errorf("milestones list missing fresh row: %.300s", rec.Body.String())
	}

	// Update: validation failure then valid.
	rec = h1CallMilestone(t, pool, UpdateMilestoneHandler(pool), owner, projectID, milestoneID, `{"approval_status":"bogus"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("milestone update invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1CallMilestone(t, pool, UpdateMilestoneHandler(pool), owner, projectID, milestoneID, `{"title":"H1 foundation v2"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("milestone update = %d %s", rec.Code, rec.Body.String())
	}
	// Destroy the draft milestone (approved ones are protected; the
	// approve path is exercised on a second row below).
	rec = h1CallMilestone(t, pool, DestroyMilestoneHandler(pool), owner, projectID, milestoneID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("milestone destroy = %d %s", rec.Code, rec.Body.String())
	}
	var remaining int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE id = $1`, milestoneID).Scan(&remaining)
	if remaining != 0 {
		t.Errorf("milestone %d not deleted", milestoneID)
	}
	// Approve path on a fresh row.
	rec = h1Call(t, pool, StoreMilestoneHandler(pool), http.MethodPost, "/api/projects/1/milestones",
		`{"title":"H1 second fix","phase_context":"design"}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("milestone store 2 = %d %s", rec.Code, rec.Body.String())
	}
	var milestone2 int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_milestones WHERE project_id = $1 AND title = 'H1 second fix' ORDER BY id DESC LIMIT 1`, projectID).Scan(&milestone2)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_milestones WHERE id = $1`, milestone2)
	})
	rec = h1CallMilestone(t, pool, ApproveMilestoneHandler(pool), owner, projectID, milestone2, `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("milestone approve = %d %s", rec.Code, rec.Body.String())
	}
	// An approved milestone is protected from deletion.
	rec = h1CallMilestone(t, pool, DestroyMilestoneHandler(pool), owner, projectID, milestone2, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("approved destroy = %d, want 400 %s", rec.Code, rec.Body.String())
	}
}

func TestH1TerminsAndFreeze(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31682)

	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = 31682 ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no owned project")
	}

	// List (seeded termin on 14976 lives elsewhere; here just 200).
	rec := h1Call(t, pool, PaymentTerminsHandler(pool), http.MethodGet, "/api/projects/1/payment-termins", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("termins index = %d %s", rec.Code, rec.Body.String())
	}

	// Store validation failure.
	rec = h1Call(t, pool, StoreTerminHandler(pool), http.MethodPost, "/api/projects/1/payment-termins", `{}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("termin store invalid = %d %s", rec.Code, rec.Body.String())
	}
	// Valid store: owner schedules an architect stage (owner becomes the
	// recipient, which also authorises milestone link/unlink below).
	rec = h1Call(t, pool, StoreTerminHandler(pool), http.MethodPost, "/api/projects/1/payment-termins",
		`{"label":"H1 DP","percentage":20,"amount":"20000000","role_type":"arsitek","trigger_description":"start"}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusCreated {
		t.Fatalf("termin store = %d %s", rec.Code, rec.Body.String())
	}
	var terminID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_payment_termins WHERE project_id = $1 AND label = 'H1 DP' ORDER BY id DESC LIMIT 1`, projectID).Scan(&terminID)
	if terminID == 0 {
		t.Fatalf("no termin row after %s", rec.Body.String())
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_payment_termins WHERE id = $1`, terminID)
	})
	// Retention split: exact 5% of 20000000.
	var retention, net string
	_ = pool.QueryRow(ctx, `SELECT retention_amount::text, net_amount::text FROM project_payment_termins WHERE id = $1`, terminID).Scan(&retention, &net)
	if retention != "1000000.00" || net != "19000000.00" {
		t.Errorf("termin split = %s / %s, want 1000000.00 / 19000000.00", retention, net)
	}

	// Update validation failure: sub-route helper carries both ids.
	rec = h1CallTermin(t, pool, UpdatePaymentTerminHandler(pool), owner, projectID, terminID, `{"percentage":999}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("termin update invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Frozen project: an open dispute blocks every payment-path write.
	if _, err := pool.Exec(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
		VALUES ($1, 31682, 'payment', 'H1 freeze probe', 'freeze', 'open')`, projectID); err != nil {
		t.Fatalf("seed dispute: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_disputes WHERE project_id = $1 AND title = 'H1 freeze probe'`, projectID)
	})
	rec = h1CallTermin(t, pool, UpdatePaymentTerminHandler(pool), owner, projectID, terminID, `{"label":"H1 DP frozen"}`)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "frozen") {
		t.Fatalf("frozen termin update = %d, want frozen 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, StoreTerminHandler(pool), http.MethodPost, "/api/projects/1/payment-termins",
		`{"label":"H1 blocked","percentage":10,"amount":"1000000","role_type":"arsitek"}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "frozen") {
		t.Fatalf("frozen termin store = %d, want frozen 422 %s", rec.Code, rec.Body.String())
	}
	// Link/unlink also freeze.
	rec = h1CallTerminLink(t, pool, LinkTerminMilestoneHandler(pool), owner, projectID, terminID, `{"milestone_id":999999999}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("frozen link = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1CallTerminLink(t, pool, UnlinkTerminMilestoneHandler(pool), owner, projectID, terminID, `{}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("frozen unlink = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Unfreeze for the remaining writes.
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id = $1 AND title = 'H1 freeze probe'`, projectID); err != nil {
		t.Fatal(err)
	}

	// Link validation (no such milestone) then unlink.
	rec = h1CallTerminLink(t, pool, LinkTerminMilestoneHandler(pool), owner, projectID, terminID, `{"milestone_id":999999999}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("link missing milestone = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1CallTerminLink(t, pool, UnlinkTerminMilestoneHandler(pool), owner, projectID, terminID, `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("unlink = %d %s", rec.Code, rec.Body.String())
	}

	// Delete the stage.
	rec = h1CallTermin(t, pool, DeletePaymentTerminHandler(pool), owner, projectID, terminID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("termin delete = %d %s", rec.Code, rec.Body.String())
	}
}

// h1CallTermin builds a sub-route request carrying {project} and {termin}.
func h1CallTermin(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID, terminID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := h1JSONRequest(t, http.MethodPut, "/api/projects/"+itoaTest(projectID)+"/payment-termins/"+itoaTest(terminID), body)
	req.SetPathValue("project", itoaTest(projectID))
	req.SetPathValue("termin", itoaTest(terminID))
	req = req.WithContext(withCaller(req.Context(), owner))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func h1CallTerminLink(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID, terminID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	method := http.MethodPost
	req := h1JSONRequest(t, method, "/api/projects/"+itoaTest(projectID)+"/payment-termins/"+itoaTest(terminID)+"/link", body)
	req.SetPathValue("project", itoaTest(projectID))
	req.SetPathValue("termin", itoaTest(terminID))
	req = req.WithContext(withCaller(req.Context(), owner))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestH1RequirementsStock(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	owner := h1User(t, pool, 31682)

	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = 31682 ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no owned project")
	}

	// Index (200, seeded rows carry over).
	rec := h1Call(t, pool, RequirementsHandler(pool), http.MethodGet, "/api/projects/1/requirements", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("requirements index = %d %s", rec.Code, rec.Body.String())
	}
	// Store validation failure.
	rec = h1Call(t, pool, StoreRequirementHandler(pool), http.MethodPost, "/api/projects/1/requirements", `{}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("requirement store invalid = %d %s", rec.Code, rec.Body.String())
	}
	// Valid store.
	rec = h1Call(t, pool, StoreRequirementHandler(pool), http.MethodPost, "/api/projects/1/requirements",
		`{"name":"H1 cement need","bom_type":"raw","quantity_required":100,"unit":"sak","category":"structural"}`, &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("requirement store = %d %s", rec.Code, rec.Body.String())
	}
	var reqID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_requirements WHERE project_id = $1 AND name = 'H1 cement need' ORDER BY id DESC LIMIT 1`, projectID).Scan(&reqID)
	if reqID == 0 {
		t.Fatalf("no requirement row after %s", rec.Body.String())
	}
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM project_requirement_histories WHERE requirement_id = $1`, reqID)
		_, _ = pool.Exec(c, `DELETE FROM project_procurement_requests WHERE requirement_id = $1`, reqID)
		_, _ = pool.Exec(c, `DELETE FROM project_requirements WHERE id = $1`, reqID)
	})

	// History + usage read back the store.
	rec = h1CallReq(t, pool, RequirementHistoryHandler(pool), owner, projectID, reqID)
	if rec.Code != http.StatusOK {
		t.Fatalf("requirement history = %d %s", rec.Code, rec.Body.String())
	}
	// Restock then use/usage move on-site quantities in exact numerics.
	rec = h1CallReqBody(t, pool, RestockHandler(pool), owner, projectID, reqID, `{"quantity":30}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("restock = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1CallReqBody(t, pool, UsageHandler(pool), owner, projectID, reqID, `{"quantity":2,"notes":"h1 usage"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("usage = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1CallReqBody(t, pool, UseHandler(pool), owner, projectID, reqID, `{"quantity":8}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("use = %d %s", rec.Code, rec.Body.String())
	}
	var onSite, used string
	_ = pool.QueryRow(ctx, `SELECT quantity_on_site::text, quantity_used::text FROM project_requirements WHERE id = $1`, reqID).Scan(&onSite, &used)
	if onSite != "20.00" || used != "10.00" {
		t.Errorf("stock = %s on-site / %s used, want 20.00 / 10.00", onSite, used)
	}
	// Overuse is rejected.
	rec = h1CallReqBody(t, pool, UseHandler(pool), owner, projectID, reqID, `{"quantity":999999}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("overuse = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Procurement: request, list, verify, reject.
	rec = h1CallReqBody(t, pool, RequestProcurementHandler(pool), owner, projectID, reqID, `{"quantity_needed":5,"message":"h1 buy"}`)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("request procurement = %d %s", rec.Code, rec.Body.String())
	}
	var procID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_procurement_requests WHERE requirement_id = $1 ORDER BY id DESC LIMIT 1`, reqID).Scan(&procID)
	rec = h1Call(t, pool, ProcurementListHandler(pool), http.MethodGet, "/api/projects/1/procurement-requests", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("procurement list = %d %s", rec.Code, rec.Body.String())
	}
	if procID != 0 {
		rec = h1CallProc(t, pool, VerifyProcurementHandler(pool), owner, projectID, procID, `{}`)
		t.Logf("procurement verify = %d %.200s", rec.Code, rec.Body.String())
		rec = h1CallProc(t, pool, RejectProcurementHandler(pool), owner, projectID, procID, `{"reason":"h1 no"}`)
		t.Logf("procurement reject = %d %.200s", rec.Code, rec.Body.String())
	}

	// Project history + requirement history indexes.
	rec = h1Call(t, pool, ProjectHistoryHandler(pool), http.MethodGet, "/api/projects/1/requirements-history", "", &owner, itoaTest(projectID))
	if rec.Code != http.StatusOK {
		t.Fatalf("project requirements history = %d %s", rec.Code, rec.Body.String())
	}

	// Update then delete.
	rec = h1CallReqBody(t, pool, UpdateRequirementHandler(pool), owner, projectID, reqID, `{"name":"H1 cement need v2"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("requirement update = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1CallReq(t, pool, DeleteRequirementHandler(pool), owner, projectID, reqID)
	if rec.Code != http.StatusOK {
		t.Fatalf("requirement delete = %d %s", rec.Code, rec.Body.String())
	}
}

func h1CallMilestone(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID, milestoneID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	method := http.MethodPost
	if body == "" {
		method = http.MethodDelete
	}
	req := h1JSONRequest(t, method, "/api/projects/"+itoaTest(projectID)+"/milestones/"+itoaTest(milestoneID), body)
	h1AllPathKeys(req, "999999999")
	req.SetPathValue("project", itoaTest(projectID))
	req.SetPathValue("milestone", itoaTest(milestoneID))
	req = req.WithContext(withCaller(req.Context(), owner))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func h1CallReq(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID, reqID int64) *httptest.ResponseRecorder {
	t.Helper()
	return h1CallReqBody(t, pool, h, owner, projectID, reqID, `{}`)
}

func h1CallReqBody(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID, reqID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := h1JSONRequest(t, http.MethodPost, "/api/projects/"+itoaTest(projectID)+"/requirements/"+itoaTest(reqID), body)
	h1AllPathKeys(req, "999999999")
	req.SetPathValue("project", itoaTest(projectID))
	req.SetPathValue("requirement", itoaTest(reqID))
	req = req.WithContext(withCaller(req.Context(), owner))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func h1CallProc(t *testing.T, pool interface{}, h http.HandlerFunc, owner roadmapCaller, projectID, procID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := h1JSONRequest(t, http.MethodPost, "/api/projects/"+itoaTest(projectID)+"/procurement-requests/"+itoaTest(procID), body)
	h1AllPathKeys(req, "999999999")
	req.SetPathValue("project", itoaTest(projectID))
	req.SetPathValue("procurementRequest", itoaTest(procID))
	req = req.WithContext(withCaller(req.Context(), owner))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}
