package httpapi

// hB reports, schedules/delays, change orders and timeline extensions.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHBProjectReports(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Empty index answers a bare array.
	rec := hBCall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK || rec.Body.String() != "[]" {
		t.Fatalf("reports empty = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reports stranger = %d, want 403", rec.Code)
	}

	// Store happy path (no files).
	rec = hBCall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hB week 1","progress_percentage":25,"budget_health":"on_track","phase_slug":"build"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report store = %d %s", rec.Code, rec.Body.String())
	}
	reportID := int64(hBDecode(t, rec)["report"].(map[string]any)["id"].(float64))

	// Validation uses the custom envelope message.
	rec = hBCall(t, StoreReportHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report empty = %d, want 422", rec.Code)
	}
	body := hBDecode(t, rec)
	if body["message"] != "The given data was invalid." {
		t.Fatalf("report envelope = %v", body)
	}
	rec = hBCall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hB","progress_percentage":101,"budget_health":"bogus"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report invalid = %d, want 422", rec.Code)
	}

	// Index now carries the row with its creator.
	rec = hBCall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if got := rec.Body.String(); len(got) < 10 || got == "[]" {
		t.Fatalf("reports index = %d %s", rec.Code, got)
	}

	// Update by the creator; validation; forbidden for a stranger.
	rp := map[string]string{"project": int64String(fx.projectID), "report": int64String(reportID)}
	rec = hBCall(t, UpdateReportHandler(pool), http.MethodPut, "/x",
		`{"summary":"hB week 1 revised","phase_slug":"build"}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report update = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdateReportHandler(pool), http.MethodPut, "/x",
		`{"progress_percentage":999}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report update invalid = %d, want 422", rec.Code)
	}
	rec = hBCall(t, UpdateReportHandler(pool), http.MethodPut, "/x",
		`{"summary":"hB hijack"}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("report update kontraktor = %d, want 403", rec.Code)
	}

	// Delete: stranger refused, creator succeeds, missing 404s.
	rec = hBCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("report delete stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("report delete again = %d, want 404", rec.Code)
	}
	var left int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_reports WHERE project_id = $1`, fx.projectID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("reports left = %d, %v", left, err)
	}
}

func TestHBReportFiles(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	p := hBProjectPath(fx.projectID)

	vault := t.TempDir()
	t.Setenv("EVIDENCE_DIR", vault)

	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, bytes.Repeat([]byte{0}, 64)...)
	pdf := []byte("%PDF-1.4\nhB\n%%EOF\n")
	build := func(t *testing.T, fields map[string]string, files map[string]struct {
		name string
		data []byte
	}) (*strings.Reader, string) {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		for k, v := range fields {
			if err := writer.WriteField(k, v); err != nil {
				t.Fatal(err)
			}
		}
		for key, f := range files {
			part, err := writer.CreateFormFile(key, f.name)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := part.Write(f.data); err != nil {
				t.Fatal(err)
			}
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		b := body.String()
		return strings.NewReader(b), writer.FormDataContentType()
	}
	call := func(h http.HandlerFunc, method, target string, reader *strings.Reader, ctype string, caller *roadmapCaller, vals map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, reader)
		req.Header.Set("Content-Type", ctype)
		for k, v := range vals {
			req.SetPathValue(k, v)
		}
		if caller != nil {
			req = req.WithContext(withCaller(req.Context(), *caller))
		}
		rec := httptest.NewRecorder()
		h(rec, req)
		return rec
	}
	fields := map[string]string{"summary": "hB files", "progress_percentage": "40", "budget_health": "warning"}
	files := map[string]struct {
		name string
		data []byte
	}{"photos": {"hB.png", png}, "attachments": {"hB.pdf", pdf}}
	reader, ctype := build(t, fields, files)
	rec := call(StoreReportHandler(pool), http.MethodPost, "/x", reader, ctype, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report files = %d %s", rec.Code, rec.Body.String())
	}
	reportID := int64(hBDecode(t, rec)["report"].(map[string]any)["id"].(float64))

	// Invalid photo mime (text named .png passes sniff? no — sniff wins).
	badFiles := map[string]struct {
		name string
		data []byte
	}{"photos": {"hB.png", []byte("not an image")}}
	reader, ctype = build(t, fields, badFiles)
	rec = call(StoreReportHandler(pool), http.MethodPost, "/x", reader, ctype, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report bad photo = %d, want 422", rec.Code)
	}
	// Oversize photo and disallowed attachment type.
	bigPNG := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 6<<20)...)
	bigFiles := map[string]struct {
		name string
		data []byte
	}{"photos": {"hB.png", bigPNG}}
	reader, ctype = build(t, fields, bigFiles)
	rec = call(StoreReportHandler(pool), http.MethodPost, "/x", reader, ctype, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report big photo = %d, want 422", rec.Code)
	}
	exeFiles := map[string]struct {
		name string
		data []byte
	}{"attachments": {"hB.exe", []byte("MZ hB")}}
	reader, ctype = build(t, fields, exeFiles)
	rec = call(StoreReportHandler(pool), http.MethodPost, "/x", reader, ctype, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report bad attachment = %d, want 422", rec.Code)
	}

	// Update appends another photo; delete removes the row.
	rp := map[string]string{"project": int64String(fx.projectID), "report": int64String(reportID)}
	more := map[string]struct {
		name string
		data []byte
	}{"photos": {"hB2.png", png}}
	reader, ctype = build(t, map[string]string{"summary": "hB v2"}, more)
	rec = call(UpdateReportHandler(pool), http.MethodPut, "/x", reader, ctype, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report update files = %d %s", rec.Code, rec.Body.String())
	}
	rec = call(DestroyReportHandler(pool), http.MethodDelete, "/x", strings.NewReader(""), "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report delete = %d %s", rec.Code, rec.Body.String())
	}
}

func TestHBSchedulesAndDelays(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Index initializes the six phases.
	rec := hBCall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedules = %d %s", rec.Code, rec.Body.String())
	}
	schedules := hBDecode(t, rec)["schedules"].([]any)
	if len(schedules) != 6 {
		t.Fatalf("phases = %d", len(schedules))
	}
	phaseID := int64(schedules[0].(map[string]any)["id"].(float64))
	rec = hBCall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("schedules stranger = %d, want 403", rec.Code)
	}

	// Update the phase: happy, bad date, bad status, wrong project.
	sp := map[string]string{"project": int64String(fx.projectID), "schedule": int64String(phaseID)}
	rec = hBCall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x",
		`{"status":"active","progress_percentage":10,"target_start_date":"2026-11-01","target_end_date":"2026-12-01"}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedule update = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x",
		`{"target_start_date":"not-a-date"}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("schedule bad date = %d, want 422", rec.Code)
	}
	rec = hBCall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"warp"}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("schedule bad status = %d, want 422", rec.Code)
	}
	xp := map[string]string{"project": int64String(fx.project2ID), "schedule": int64String(phaseID)}
	rec = hBCall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"active"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("schedule cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"active"}`, &fx.stranger, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("schedule stranger = %d, want 403", rec.Code)
	}

	// Delay: only the assigned PM logs; owner (not PM) is refused.
	rec = hBCall(t, LogDelayHandler(pool), http.MethodPost, "/x",
		`{"phase_slug":"design","days":5,"reason":"hB rain","category":"weather"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("delay = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, LogDelayHandler(pool), http.MethodPost, "/x",
		`{"phase_slug":"design","days":5,"reason":"hB x","category":"y"}`, &fx.owner, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delay owner = %d, want 403", rec.Code)
	}
	rec = hBCall(t, LogDelayHandler(pool), http.MethodPost, "/x", `{}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("delay empty = %d, want 422", rec.Code)
	}
	var delayCount int
	var shifted int64
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_delays WHERE project_id = $1`, fx.projectID).Scan(&delayCount); err != nil || delayCount != 1 {
		t.Fatalf("delays = %d, %v", delayCount, err)
	}
	if err := pool.QueryRow(ctx, `SELECT shifted_days FROM project_schedules WHERE project_id = $1 AND phase_slug = 'handover'`,
		fx.projectID).Scan(&shifted); err != nil || shifted != 5 {
		t.Fatalf("shifted = %d, %v", shifted, err)
	}
}

func hBChangeOrderPaths(projectID, orderID int64) map[string]string {
	return map[string]string{"project": int64String(projectID), "changeOrder": int64String(orderID)}
}

func TestHBChangeOrders(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Milestone for the milestone-bound branch.
	var milestoneID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, created_at, updated_at)
		VALUES ($1, 'hB MS', now(), now()) RETURNING id`, fx.projectID).Scan(&milestoneID); err != nil {
		t.Fatalf("milestone: %v", err)
	}

	// Store as a participant; stranger refused; validation; foreign milestone.
	store := `{"title":"hB CO","description":"hB extra","cost_impact":250000,"time_impact_days":3,"milestone_id":` + int64String(milestoneID) + `}`
	rec := hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", store, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("co store = %d %s", rec.Code, rec.Body.String())
	}
	coID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", store, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("co stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", `{"title":""}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("co empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hB","description":"hB","cost_impact":1,"milestone_id":999999999}`, &fx.kontraktor, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("co foreign milestone = %d, want 404", rec.Code)
	}

	// Frozen payments refuse new change orders.
	if _, err := pool.Exec(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
		VALUES ($1, $2, 'payment', 'hB freeze', 'hB frozen', 'open')`, fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("dispute: %v", err)
	}
	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", store, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("co frozen = %d, want 422", rec.Code)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id = $1`, fx.projectID); err != nil {
		t.Fatalf("dispute cleanup: %v", err)
	}

	// Index merges change orders with billable addendums.
	rec = hBCall(t, ChangeOrdersIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if body := hBDecode(t, rec); len(body["data"].([]any)) != 1 {
		t.Fatalf("co index = %v", body)
	}
	rec = hBCall(t, ChangeOrdersIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("co index stranger = %d, want 403", rec.Code)
	}

	cop := hBChangeOrderPaths(fx.projectID, coID)
	// PM review: forbidden for non-PM, validation, then approve.
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"action":"approve","pm_notes":"hB ok"}`, &fx.owner, cop)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("pm-review owner = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{}`, &fx.pm, cop)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pm-review empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"action":"approve","pm_notes":"hB ok"}`, &fx.pm, cop)
	if rec.Code != http.StatusOK {
		t.Fatalf("pm-review = %d %s", rec.Code, rec.Body.String())
	}

	// Owner decide: forbidden for non-owner, then approve mints the
	// exact-minor-unit payment stage.
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.kontraktor, cop)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("owner-decide kontraktor = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve","owner_notes":"hB go"}`, &fx.owner, cop)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner-decide = %d %s", rec.Code, rec.Body.String())
	}
	var terminAmount string
	if err := pool.QueryRow(ctx, `SELECT amount::text FROM project_payment_termins WHERE change_order_id = $1`,
		coID).Scan(&terminAmount); err != nil || terminAmount != "250000.00" {
		t.Fatalf("termin = %q, %v", terminAmount, err)
	}
	// Zero-cost approval mints no stage; over-budget approval is refused.
	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hB CO0","description":"hB free","cost_impact":0}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("co zero store = %d %s", rec.Code, rec.Body.String())
	}
	zeroID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	zeroPaths := hBChangeOrderPaths(fx.projectID, zeroID)
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner, zeroPaths)
	if rec.Code != http.StatusOK {
		t.Fatalf("co zero approve = %d %s", rec.Code, rec.Body.String())
	}
	var zeroTermins int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_payment_termins WHERE change_order_id = $1`,
		zeroID).Scan(&zeroTermins); err != nil || zeroTermins != 0 {
		t.Fatalf("zero termins = %d, %v", zeroTermins, err)
	}

	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hB COH","description":"hB huge","cost_impact":99999999999}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("co huge store = %d %s", rec.Code, rec.Body.String())
	}
	hugeID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	hugePaths := hBChangeOrderPaths(fx.projectID, hugeID)
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner, hugePaths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("co huge approve = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// PM-review reject, then a direct owner reject from proposed.
	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hB COR","description":"hB r","cost_impact":1000}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("co store r = %d %s", rec.Code, rec.Body.String())
	}
	rejectID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rejectPaths := hBChangeOrderPaths(fx.projectID, rejectID)
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"action":"reject","pm_notes":"hB no"}`, &fx.pm, rejectPaths)
	if rec.Code != http.StatusOK {
		t.Fatalf("pm-review reject = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hB COR2","description":"hB r2","cost_impact":1000}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("co store r2 = %d %s", rec.Code, rec.Body.String())
	}
	reject2 := hBChangeOrderPaths(fx.projectID, int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64)))
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"reject","owner_notes":"hB no"}`, &fx.owner, reject2)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner-decide reject = %d %s", rec.Code, rec.Body.String())
	}

	// Decided twice: 422.
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"reject"}`, &fx.owner, cop)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("co re-decide = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Bad change-order id: binding 404.
	rec = hBCall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "changeOrder": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("co bad id = %d, want 404", rec.Code)
	}
}

func TestHBExtensions(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	rec := hBCall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB rain","description":"hB wet","days_requested":7}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext store = %d %s", rec.Code, rec.Body.String())
	}
	extID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hBCall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB x"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ext stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, StoreExtensionHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("ext empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, ExtensionsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if body := hBDecode(t, rec); len(body["data"].([]any)) != 1 {
		t.Fatalf("ext index = %v", body)
	}

	ep := map[string]string{"project": int64String(fx.projectID), "extension": int64String(extID)}
	// PM review by a non-PM is refused; validation; then approve.
	rec = hBCall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"status":"pm_reviewed"}`, &fx.owner, ep)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ext pm-review owner = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{}`, &fx.pm, ep)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("ext pm-review empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"status":"pm_reviewed","pm_notes":"hB ok"}`, &fx.pm, ep)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext pm-review = %d %s", rec.Code, rec.Body.String())
	}
	// Owner decide: non-owner refused; approve pushes the deadline.
	rec = hBCall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"status":"approved"}`, &fx.kontraktor, ep)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ext owner-decide kontraktor = %d, want 403", rec.Code)
	}
	var beforeDeadline *string
	_ = pool.QueryRow(ctx, `SELECT deadline::text FROM projects WHERE id = $1`, fx.projectID).Scan(&beforeDeadline)
	rec = hBCall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"status":"approved","owner_notes":"hB go"}`, &fx.owner, ep)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext owner-decide = %d %s", rec.Code, rec.Body.String())
	}
	// Owner rejects a fresh extension instead of approving.
	rec = hBCall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hB maybe","days_requested":2}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext store 2 = %d %s", rec.Code, rec.Body.String())
	}
	ext2 := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	ep2 := map[string]string{"project": int64String(fx.projectID), "extension": int64String(ext2)}
	rec = hBCall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"status":"rejected","owner_notes":"hB no"}`, &fx.owner, ep2)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext owner reject = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, ExtensionsIndexHandler(pool), http.MethodGet, "/x", "", &fx.kontraktor, p)
	if body := hBDecode(t, rec); len(body["data"].([]any)) != 2 {
		t.Fatalf("ext index 2 = %v", body)
	}
	var deadline string
	if err := pool.QueryRow(ctx, `SELECT deadline::text FROM projects WHERE id = $1`, fx.projectID).Scan(&deadline); err != nil {
		t.Fatalf("deadline: %v", err)
	}
	if beforeDeadline != nil && deadline <= *beforeDeadline {
		t.Fatalf("deadline not pushed: %s was %s", deadline, *beforeDeadline)
	}
}
