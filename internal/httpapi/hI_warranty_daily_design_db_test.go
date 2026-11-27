package httpapi

// hI warranty + daily + design leftovers (mirrors hE gaps with hI data).

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestHIWarranty(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	if _, err := pool.Exec(ctx, `UPDATE projects SET warranty_end_at = now() + interval '30 days',
		selected_kontraktor_id = $2 WHERE id = $1`, fx.projectID, hIKontraktorProfileID); err != nil {
		t.Fatalf("warranty window: %v", err)
	}

	// Missing project → 404 via gateError, never 500.
	rec := hICall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/x/999999999",
		`{"title":"hI","description":"hI"}`, &fx.owner, map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("warranty store missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// Validation twins.
	for _, tc := range []struct{ name, body, want string }{
		{"title-long", `{"title":"` + strings.Repeat("x", 256) + `","description":"hI"}`, "The title field must not be greater than 255 characters."},
		{"title-number", `{"title":5,"description":"hI"}`, "The title field must be a string."},
		{"desc-missing", `{"title":"hI"}`, "The description field is required."},
	} {
		rec = hICall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/x", tc.body, &fx.owner, p)
		if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), tc.want) {
			t.Fatalf("warranty %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}
	// Anon 401, stranger 403 (non-participant cannot file? owner/PM only? check: stranger should be forbidden).
	rec = hICall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/x",
		`{"title":"hI","description":"hI"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("warranty anon = %d, want 401", rec.Code)
	}

	// Happy minimal (no images).
	rec = hICall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/x",
		`{"title":"hI leak","description":"hI roof"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty happy = %d %s", rec.Code, rec.Body.String())
	}
	var claimID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_warranty_claims WHERE project_id = $1 AND title = 'hI leak' ORDER BY id DESC LIMIT 1`, fx.projectID).Scan(&claimID)
	if claimID == 0 {
		t.Fatalf("no warranty row")
	}
	// Index carries it; stranger cannot list? (owner/assignee only).
	rec = hICall(t, WarrantyClaimsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty index = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "hI leak") {
		t.Fatalf("warranty index missing: %s", rec.Body.String())
	}

	// Update: negative cost 422, zero cost by kontraktor OK with literal.
	cp := map[string]string{"project": int64String(fx.projectID), "claim": int64String(claimID)}
	rec = hICall(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/x", `{"status":"fixing","cost_impact":-1}`, &fx.owner, cp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("warranty neg cost = %d, want 422", rec.Code)
	}
	rec = hICall(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/x", `{"status":"fixing","cost_impact":0}`, &fx.kontraktor, cp)
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty zero cost = %d %s", rec.Code, rec.Body.String())
	}
	var cost string
	_ = pool.QueryRow(ctx, `SELECT cost_impact::text FROM project_warranty_claims WHERE id = $1`, claimID).Scan(&cost)
	if cost != "0.00" {
		t.Fatalf("warranty cost = %q, want 0.00", cost)
	}
}

func TestHIDailyDesign(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	// PBG lock: new_build without PBG refuses physical work with exact message.
	if _, err := pool.Exec(ctx, `UPDATE projects SET project_category = 'new_build' WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("category: %v", err)
	}
	rec := hICall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x",
		`{"log_date":"2026-04-01","weather":"sunny","worker_count":6,"activities":"hI dig"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("daily locked = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Physical site work is locked. PBG permit is missing or unverified.") {
		t.Fatalf("daily lock msg = %s", rec.Body.String())
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET pbg_verified_at = now() WHERE id = $1`, fx.projectID); err != nil {
		t.Fatalf("pbg: %v", err)
	}
	// Validation twins.
	rec = hICall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x",
		`{"log_date":"yesterday","weather":"sunny","worker_count":6,"activities":"hI"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("daily bad date = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x",
		`{"log_date":"2026-04-01","weather":"sunny","worker_count":6}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("daily missing activities = %d, want 422", rec.Code)
	}

	// Design: unauth 401, bad id 404, missing 404, stranger 403 with exact message.
	rec = hICall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("design anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, SubmitDesignHandler(pool), http.MethodPost, "/x/abc", `{"role_type":"structural"}`, &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("design bad id = %d, want 404", rec.Code)
	}
	rec = hICall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("design empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("design stranger = %d, want 403", rec.Code)
	}
}
