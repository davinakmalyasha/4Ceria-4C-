package httpapi

// hE warranty gaps (images, contractor notify, cost edges, missing pins)
// and schedule gaps (post-state index, update validation, delay edges).

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHEWarrantyGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	// Open the warranty window and link the hired kontraktor profile so the
	// notification branch fires.
	if _, err := pool.Exec(ctx, `UPDATE projects SET warranty_end_at = now() + interval '30 days',
		selected_kontraktor_id = $2 WHERE id = $1`, hEProjectID, hEKontrakProfileID); err != nil {
		t.Fatalf("warranty window: %v", err)
	}

	// --- missing-project pin on store (gateError 404, not 500) ---
	rec := hECall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/x/999999999",
		`{"title":"hE","description":"hE"}`, &fx.owner, map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("warranty store missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// --- validation twins ---
	for _, tc := range []struct{ name, body, want string }{
		{"title-long", `{"title":"` + longStr(256) + `","description":"hE"}`, "The title field must not be greater than 255 characters."},
		{"title-number", `{"title":5,"description":"hE"}`, "The title field must be a string."},
		{"desc-missing", `{"title":"hE"}`, "The description field is required."},
		{"desc-number", `{"title":"hE","description":5}`, "The description field must be a string."},
	} {
		rec = hECall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/x", tc.body, &fx.owner, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("warranty %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 64)...)

	// --- six images are refused ---
	many := make([]hEFile, 6)
	for i := range many {
		many[i] = hEFile{name: "hE.png", data: png}
	}
	reader, ctype := hEMultipartFiles(t, map[string]string{"title": "hE many", "description": "hE"}, "images", many)
	req := httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.owner))
	mrec := httptest.NewRecorder()
	StoreWarrantyClaimHandler(pool)(mrec, req)
	if mrec.Code != http.StatusUnprocessableEntity || !containsStr(mrec.Body.String(), "The images field must not have more than 5 items.") {
		t.Fatalf("warranty 6 images = %d %s", mrec.Code, mrec.Body.String())
	}

	// --- a text file is not an image ---
	reader, ctype = hEMultipartFiles(t, map[string]string{"title": "hE txt", "description": "hE"}, "images",
		[]hEFile{{name: "hE-note.txt", data: []byte("hE plain")}})
	req = httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.owner))
	mrec = httptest.NewRecorder()
	StoreWarrantyClaimHandler(pool)(mrec, req)
	if mrec.Code != http.StatusUnprocessableEntity || !containsStr(mrec.Body.String(), "must be an image.") {
		t.Fatalf("warranty txt = %d %s", mrec.Code, mrec.Body.String())
	}

	// --- happy with two images: stored paths + contractor told ---
	reader, ctype = hEMultipartFiles(t, map[string]string{"title": "hE leak", "description": "hE roof"},
		"images", []hEFile{{name: "hE-a.png", data: png}, {name: "hE-b.png", data: png}})
	req = httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.owner))
	mrec = httptest.NewRecorder()
	StoreWarrantyClaimHandler(pool)(mrec, req)
	if mrec.Code != http.StatusOK {
		t.Fatalf("warranty images = %d %s", mrec.Code, mrec.Body.String())
	}
	if got := hEDecode(t, mrec)["message"]; got != "Warranty claim filed" {
		t.Fatalf("warranty message = %q", got)
	}
	var claimID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_warranty_claims WHERE project_id = $1 AND title = 'hE leak' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&claimID)
	if claimID == 0 {
		t.Fatalf("no warranty row")
	}
	var images string
	_ = pool.QueryRow(ctx, `SELECT images::text FROM project_warranty_claims WHERE id = $1`, claimID).Scan(&images)
	if !containsStr(images, "projects/"+int64String(hEProjectID)+"/warranty") {
		t.Fatalf("warranty images = %q, want project warranty paths", images)
	}
	var told int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'warranty_claim'`, hEKontrakID).Scan(&told)
	if told != 1 {
		t.Fatalf("contractor notifs = %d, want 1", told)
	}

	// --- update edges: exact codes and messages ---
	cp := map[string]string{"project": int64String(hEProjectID), "claim": int64String(claimID)}
	rec = hECall(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/x", `{"status":"fixing","cost_impact":-1}`, &fx.owner, cp)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The cost impact field must be at least 0.") {
		t.Fatalf("warranty neg cost = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/x", `{"status":"fixing","cost_impact":"lots"}`, &fx.owner, cp)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The cost impact field must be a number.") {
		t.Fatalf("warranty nan cost = %d %s", rec.Code, rec.Body.String())
	}
	// zero cost by the contractor is allowed (only positive costs are gated)
	rec = hECall(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/x", `{"status":"fixing","cost_impact":0}`, &fx.kontraktor, cp)
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty zero cost kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Claim status updated" {
		t.Fatalf("warranty update message = %q", got)
	}
	var cost string
	_ = pool.QueryRow(ctx, `SELECT cost_impact::text FROM project_warranty_claims WHERE id = $1`, claimID).Scan(&cost)
	if cost != "0.00" {
		t.Fatalf("warranty cost = %q, want 0.00", cost)
	}
	// closed stamps no resolved_at
	rec = hECall(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/x", `{"status":"closed"}`, &fx.owner, cp)
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty close = %d %s", rec.Code, rec.Body.String())
	}
	var finalStatus string
	var resolved *string
	_ = pool.QueryRow(ctx, `SELECT status::text, resolved_at::text FROM project_warranty_claims WHERE id = $1`, claimID).Scan(&finalStatus, &resolved)
	if finalStatus != "closed" || resolved != nil {
		t.Fatalf("warranty closed = %q/%v, want closed/NULL", finalStatus, resolved)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHESchedulesGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// --- unauth / bad-id / missing pins ---
	rec := hECall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("schedules unauth = %d, want 401", rec.Code)
	}
	rec = hECall(t, LogDelayHandler(pool), http.MethodPost, "/x", `{"phase_slug":"build","days":1,"reason":"hE","category":"hE"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("delay unauth = %d, want 401", rec.Code)
	}
	rec = hECall(t, LogDelayHandler(pool), http.MethodPost, "/x/999999999", `{"phase_slug":"build","days":1,"reason":"hE","category":"hE"}`, &fx.pm,
		map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delay missing project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, LogDelayHandler(pool), http.MethodPost, "/x/abc", `{"phase_slug":"build","days":1,"reason":"hE","category":"hE"}`, &fx.pm,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delay bad project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x/abc", `{"status":"active"}`, &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "schedule": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("schedule bad id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x/999999999", `{"status":"active"}`, &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "schedule": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("schedule missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"active"}`, nil,
		map[string]string{"project": int64String(hEProjectID), "schedule": "1"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("schedule unauth = %d, want 401", rec.Code)
	}

	// --- index initializes; update one phase with real dates ---
	rec = hECall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedules = %d %s", rec.Code, rec.Body.String())
	}
	var buildID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_schedules WHERE project_id = $1 AND phase_slug = 'build'`, hEProjectID).Scan(&buildID)
	sp := map[string]string{"project": int64String(hEProjectID), "schedule": int64String(buildID)}

	// Bare {"errors"} envelope pins: no message key on validation failure.
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"progress_percentage":101}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("schedule progress 101 = %d, want 422", rec.Code)
	}
	var envelope struct {
		Errors  map[string][]string `json:"errors"`
		Message *string             `json:"message"`
	}
	if err := decodeHE(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("envelope decode: %v", err)
	}
	if envelope.Message != nil {
		t.Fatalf("schedule envelope must not carry message, got %q", *envelope.Message)
	}
	if len(envelope.Errors["progress_percentage"]) != 1 || envelope.Errors["progress_percentage"][0] != "The progress percentage field must not be greater than 100." {
		t.Fatalf("schedule envelope errors = %v", envelope.Errors)
	}
	for _, tc := range []struct{ name, body, field, want string }{
		{"progress-neg", `{"progress_percentage":-1}`, "progress_percentage", "The progress percentage field must be at least 0."},
		{"progress-word", `{"progress_percentage":"lots"}`, "progress_percentage", "The progress percentage field must be an integer."},
		{"notes-long", `{"notes":"` + longStr(5001) + `"}`, "notes", "The notes field must not be greater than 5000 characters."},
		{"notes-number", `{"notes":5}`, "notes", "The notes field must be a string."},
		{"end-bad", `{"target_end_date":"soon"}`, "target_end_date", "The target end date field must be a valid date."},
		{"end-before-start", `{"target_start_date":"2026-12-01","target_end_date":"2026-11-01"}`, "target_end_date", "The target end date field must be a date after or equal to target start date."},
	} {
		rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", tc.body, &fx.owner, sp)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("schedule %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	// Happy: dates + status + progress + notes, cleared start via null.
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x",
		`{"status":"active","progress_percentage":10,"target_start_date":"2026-11-01","target_end_date":"2026-12-01","notes":"hE on track"}`, &fx.pm, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedule update = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Phase updated successfully." {
		t.Fatalf("schedule message = %q", got)
	}
	var status, startDate, endDate, notes string
	var progress int64
	_ = pool.QueryRow(ctx, `SELECT status::text, target_start_date::text, target_end_date::text, progress_percentage, notes
		FROM project_schedules WHERE id = $1`, buildID).Scan(&status, &startDate, &endDate, &progress, &notes)
	if status != "active" || startDate != "2026-11-01" || endDate != "2026-12-01" || progress != 10 || notes != "hE on track" {
		t.Fatalf("schedule row = %q/%q/%q/%d/%q", status, startDate, endDate, progress, notes)
	}

	// --- delay validation twins (bare envelope, no message) ---
	for _, tc := range []struct{ name, body, want string }{
		{"days-zero", `{"phase_slug":"build","days":0,"reason":"hE","category":"hE"}`, "The days field must be at least 1."},
		{"days-word", `{"phase_slug":"build","days":"many","reason":"hE","category":"hE"}`, "The days field must be an integer."},
		{"phase-missing", `{"days":1,"reason":"hE","category":"hE"}`, "The phase slug field is required."},
		{"phase-number", `{"phase_slug":5,"days":1,"reason":"hE","category":"hE"}`, "The phase slug field must be a string."},
		{"reason-missing", `{"phase_slug":"build","days":1,"category":"hE"}`, "The reason field is required."},
		{"reason-number", `{"phase_slug":"build","days":1,"reason":5,"category":"hE"}`, "The reason field must be a string."},
		{"category-blank", `{"phase_slug":"build","days":1,"reason":"hE","category":""}`, "The category field is required."},
	} {
		rec = hECall(t, LogDelayHandler(pool), http.MethodPost, "/x", tc.body, &fx.pm, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("delay %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	// --- delay build by 5 with string days: shifts build+later, keeps baseline ---
	rec = hECall(t, LogDelayHandler(pool), http.MethodPost, "/x",
		`{"phase_slug":"build","days":"5","reason":"hE rain","category":"weather"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("delay = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Delay logged and stakeholders notified." {
		t.Fatalf("delay message = %q", got)
	}
	_ = pool.QueryRow(ctx, `SELECT target_start_date::text, target_end_date::text, original_target_end_date::text, shifted_days
		FROM project_schedules WHERE project_id = $1 AND phase_slug = 'build'`, hEProjectID).Scan(&startDate, &endDate, &notes, &progress)
	if startDate != "2026-11-06" || endDate != "2026-12-06" || notes != "2026-12-01" || progress != 5 {
		t.Fatalf("build shifted = %q/%q/%q/%d, want 2026-11-06/2026-12-06/2026-12-01/5", startDate, endDate, notes, progress)
	}
	// A dateless later phase shifts its counter but keeps NULL dates.
	var mStart, mEnd, mOrig *string
	var mShifted int64
	_ = pool.QueryRow(ctx, `SELECT target_start_date::text, target_end_date::text, original_target_end_date::text, shifted_days
		FROM project_schedules WHERE project_id = $1 AND phase_slug = 'handover'`, hEProjectID).Scan(&mStart, &mEnd, &mOrig, &mShifted)
	if mStart != nil || mEnd != nil || mOrig != nil || mShifted != 5 {
		t.Fatalf("handover shifted = %v/%v/%v/%d, want NULL/NULL/NULL/5", mStart, mEnd, mOrig, mShifted)
	}
	var delayDays int64
	_ = pool.QueryRow(ctx, `SELECT days FROM project_delays WHERE project_id = $1`, hEProjectID).Scan(&delayDays)
	if delayDays != 5 {
		t.Fatalf("delay days = %d, want 5", delayDays)
	}

	// --- store an unlinked report, then index: delays + reports + summary ---
	rec = hECall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hE free note","progress_percentage":30,"budget_health":"warning"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report store = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedules after = %d %s", rec.Code, rec.Body.String())
	}
	var full struct {
		Schedules []struct {
			PhaseSlug   string `json:"phase_slug"`
			ReportCount int64  `json:"report_count"`
			ShiftedDays int64  `json:"shifted_days"`
			Status      string `json:"status"`
		} `json:"schedules"`
		Delays []struct {
			Days   int64  `json:"days"`
			Reason string `json:"reason"`
		} `json:"delays"`
		Unlinked []struct {
			Summary string `json:"summary"`
		} `json:"unlinked_reports"`
		Summary struct {
			Completion   int64  `json:"completion_percentage"`
			PhasesDone   int64  `json:"phases_done"`
			TotalPhases  int64  `json:"total_phases"`
			CurrentPhase string `json:"current_phase"`
			TotalDelay   string `json:"total_delay_days"`
		} `json:"summary"`
	}
	if err := decodeHE(rec.Body.Bytes(), &full); err != nil {
		t.Fatalf("full decode: %v", err)
	}
	if len(full.Schedules) != 6 {
		t.Fatalf("schedules = %d, want 6", len(full.Schedules))
	}
	if len(full.Delays) != 1 || full.Delays[0].Days != 5 || full.Delays[0].Reason != "hE rain" {
		t.Fatalf("delays = %+v, want one 5-day hE rain", full.Delays)
	}
	if len(full.Unlinked) != 1 || full.Unlinked[0].Summary != "hE free note" {
		t.Fatalf("unlinked = %+v, want one hE free note", full.Unlinked)
	}
	if full.Summary.PhasesDone != 0 || full.Summary.TotalPhases != 6 || full.Summary.TotalDelay != "5" {
		t.Fatalf("summary = %+v, want 0/6/\"5\"", full.Summary)
	}
	// Mark build completed, then the summary counts it.
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"completed","progress_percentage":100}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedule complete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if err := decodeHE(rec.Body.Bytes(), &full); err != nil {
		t.Fatalf("full decode2: %v", err)
	}
	if full.Summary.PhasesDone != 1 || full.Summary.Completion != 17 || full.Summary.CurrentPhase != "design" {
		t.Fatalf("summary2 = %+v, want done 1, completion 17, current design", full.Summary)
	}

	// --- null the start date through the update ---
	rec = hECall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"target_start_date":null}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedule null start = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT target_start_date::text FROM project_schedules WHERE id = $1`, buildID).Scan(&mStart)
	if mStart != nil {
		t.Fatalf("start = %q, want NULL", *mStart)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func decodeHE(data []byte, v any) error {
	return json.Unmarshal(data, v)
}
