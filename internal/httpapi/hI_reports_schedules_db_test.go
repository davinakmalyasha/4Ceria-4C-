package httpapi

// hI reports/schedules leftovers: ghost 404s, validation twins, literal post-state.

import (
	"net/http"
	"strings"
	"testing"
)

func TestHIReports(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	p := hIProjectPath(fx.projectID)

	// Empty index answers a bare array.
	rec := hICall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK || rec.Body.String() != "[]" {
		t.Fatalf("reports empty = %d %s", rec.Code, rec.Body.String())
	}
	// Stranger forbidden with the exact sentence.
	rec = hICall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reports stranger = %d, want 403", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "This action is unauthorized.") {
		t.Fatalf("reports stranger body = %s", rec.Body.String())
	}
	// Anon 401.
	rec = hICall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("reports anon = %d, want 401", rec.Code)
	}
	// Ghost 404 via gateError.
	rec = hICall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("reports ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Record not found.") {
		t.Fatalf("reports ghost body = %s", rec.Body.String())
	}
	// Bad project id format → 404 model binding.
	rec = hICall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("reports bad id = %d, want 404", rec.Code)
	}

	// Store happy path (no files).
	rec = hICall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hI week 1","progress_percentage":25,"budget_health":"on_track","phase_slug":"build"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report store = %d %s", rec.Code, rec.Body.String())
	}
	reportID := int64(hIDecode(t, rec)["report"].(map[string]any)["id"].(float64))

	// Validation uses the custom envelope message.
	rec = hICall(t, StoreReportHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report empty = %d, want 422", rec.Code)
	}
	body := hIDecode(t, rec)
	if body["message"] != "The given data was invalid." {
		t.Fatalf("report envelope = %v", body)
	}
	// Progress out of range and bad health.
	rec = hICall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hI","progress_percentage":101,"budget_health":"bogus"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report invalid = %d, want 422", rec.Code)
	}
	// Non-string summary → 422.
	rec = hICall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":123,"progress_percentage":10,"budget_health":"on_track"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report summary num = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Negative progress → 422.
	rec = hICall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hI","progress_percentage":-1,"budget_health":"on_track"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report negative = %d, want 422", rec.Code)
	}
	// Stranger cannot store.
	rec = hICall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hI","progress_percentage":10,"budget_health":"on_track"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("report store stranger = %d, want 403", rec.Code)
	}

	// Index now carries the row with its creator.
	rec = hICall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if got := rec.Body.String(); !strings.Contains(got, "hI week 1") {
		t.Fatalf("reports index = %d %s", rec.Code, got)
	}

	// Update by the creator; validation; forbidden for a stranger.
	rp := map[string]string{"project": int64String(fx.projectID), "report": int64String(reportID)}
	rec = hICall(t, UpdateReportHandler(pool), http.MethodPut, "/x",
		`{"summary":"hI week 1 revised","phase_slug":"build"}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report update = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Report updated successfully!") {
		t.Fatalf("report update msg = %s", rec.Body.String())
	}
	rec = hICall(t, UpdateReportHandler(pool), http.MethodPut, "/x",
		`{"progress_percentage":999}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report update invalid = %d, want 422", rec.Code)
	}
	rec = hICall(t, UpdateReportHandler(pool), http.MethodPut, "/x",
		`{"summary":"hI hijack"}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("report update kontraktor = %d, want 403", rec.Code)
	}
	// Bad report id → 404 model binding.
	rec = hICall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hI"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "report": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("report update bad id = %d, want 404", rec.Code)
	}
	// Missing report → 404.
	rec = hICall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hI"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "report": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("report update missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// Delete: stranger refused, creator succeeds, missing 404s.
	rec = hICall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("report delete stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report delete = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Report deleted successfully.") {
		t.Fatalf("report delete msg = %s", rec.Body.String())
	}
	rec = hICall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("report delete again = %d, want 404", rec.Code)
	}
}

func TestHISchedules(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	p := hIProjectPath(fx.projectID)

	// Index initializes the six phases.
	rec := hICall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedules = %d %s", rec.Code, rec.Body.String())
	}
	schedules := hIDecode(t, rec)["schedules"].([]any)
	if len(schedules) != 6 {
		t.Fatalf("phases = %d", len(schedules))
	}
	phaseID := int64(schedules[0].(map[string]any)["id"].(float64))
	// Stranger forbidden, anon 401, bad id 404, ghost 404.
	rec = hICall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("schedules stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("schedules anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("schedules ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, SchedulesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("schedules bad id = %d, want 404", rec.Code)
	}

	// Update the phase: happy, bad date, bad status, wrong project.
	sp := map[string]string{"project": int64String(fx.projectID), "schedule": int64String(phaseID)}
	rec = hICall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x",
		`{"status":"active","progress_percentage":10,"target_start_date":"2026-11-01","target_end_date":"2026-12-01"}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("schedule update = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x",
		`{"target_start_date":"not-a-date"}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("schedule bad date = %d, want 422", rec.Code)
	}
	rec = hICall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"warp"}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("schedule bad status = %d, want 422", rec.Code)
	}
	xp := map[string]string{"project": int64String(fx.project2ID), "schedule": int64String(phaseID)}
	rec = hICall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"active"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("schedule cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"active"}`, &fx.stranger, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("schedule stranger = %d, want 403", rec.Code)
	}
	// Bad schedule id → 404.
	rec = hICall(t, UpdateScheduleHandler(pool), http.MethodPut, "/x", `{"status":"active"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "schedule": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("schedule bad id = %d, want 404", rec.Code)
	}

	// Delay: only the assigned PM logs; owner (not PM) is refused.
	rec = hICall(t, LogDelayHandler(pool), http.MethodPost, "/x",
		`{"phase_slug":"design","days":5,"reason":"hI rain","category":"weather"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("delay = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, LogDelayHandler(pool), http.MethodPost, "/x",
		`{"phase_slug":"design","days":5,"reason":"hI x","category":"y"}`, &fx.owner, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delay owner = %d, want 403", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Only the PM can log delays.") {
		t.Fatalf("delay owner body = %s", rec.Body.String())
	}
	rec = hICall(t, LogDelayHandler(pool), http.MethodPost, "/x", `{}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("delay empty = %d, want 422", rec.Code)
	}
	// Anon and bad project.
	rec = hICall(t, LogDelayHandler(pool), http.MethodPost, "/x",
		`{"phase_slug":"design","days":1,"reason":"hI","category":"weather"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("delay anon = %d, want 401", rec.Code)
	}
}
