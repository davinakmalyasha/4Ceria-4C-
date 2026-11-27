package httpapi

// hI requirement history / procurement / stock leftovers.

import (
	"context"
	"net/http"
	"testing"
)

func TestHIRequirementHistoryProcureStock(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	var reqID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, estimated_unit_cost, created_at, updated_at, user_id)
		VALUES ($1, 'hI Besi', 50, 'btg', 'raw', 200000, now(), now(), $2) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&reqID); err != nil {
		t.Fatalf("seed requirement: %v", err)
	}
	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}

	// History: owner happy, stranger forbidden, cross-project 404, bad ids.
	rec := hICall(t, ProjectHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("history = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("req history = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("req history stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", nil, rp)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("req history anon = %d, want 401", rec.Code)
	}
	var otherReq int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, created_at, updated_at)
		VALUES ($1, 'hI Other', 1, 'pcs', 'raw', now(), now()) RETURNING id`, fx.project2ID).Scan(&otherReq); err != nil {
		t.Fatalf("other: %v", err)
	}
	xp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(otherReq)}
	rec = hICall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("req history cross = %d, want 404", rec.Code)
	}

	// Procurement list: owner happy, stranger 403, anon 401.
	rec = hICall(t, ProcurementListHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("procure list = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, ProcurementListHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("procure list stranger = %d, want 403", rec.Code)
	}
	// Request as hired kontraktor.
	rec = hICall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":10,"message":"hI need"}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("procure request = %d %s", rec.Code, rec.Body.String())
	}
	// Validation: quantity below minimum.
	rec = hICall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":0}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("procure invalid = %d, want 422", rec.Code)
	}
	// Forbidden stranger.
	rec = hICall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":2}`, &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("procure stranger = %d, want 403", rec.Code)
	}
	// Missing quantity → 422.
	rec = hICall(t, RequestProcurementHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("procure empty = %d, want 422", rec.Code)
	}

	// Stock: restock/use/usage with literal post-state.
	var stockReq int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, quantity_on_site, quantity_used, created_at, updated_at, user_id)
		VALUES ($1, 'hI Bata', 1000, 'pcs', 'raw', 100, 10, now(), now(), $2) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&stockReq); err != nil {
		t.Fatalf("stock seed: %v", err)
	}
	sp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(stockReq)}
	rec = hICall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":50}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("restock = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":10}`, &fx.kontraktor, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("restock kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":10}`, &fx.arsitek, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("restock arsitek = %d, want 403", rec.Code)
	}
	rec = hICall(t, RestockHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("restock empty = %d, want 422", rec.Code)
	}
	// Use more than on site → 422.
	rec = hICall(t, UseHandler(pool), http.MethodPost, "/x", `{"quantity":999999}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("use over = %d, want 422", rec.Code)
	}
	rec = hICall(t, UseHandler(pool), http.MethodPost, "/x", `{"quantity":20}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("use = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, UsageHandler(pool), http.MethodPost, "/x", `{"quantity":5}`, &fx.arsitek, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("usage = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, UsageHandler(pool), http.MethodPost, "/x", `{"quantity":5}`, &fx.stranger, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("usage stranger = %d, want 403", rec.Code)
	}
	var onSite, used string
	if err := pool.QueryRow(ctx, `SELECT quantity_on_site::text, quantity_used::text FROM project_requirements WHERE id = $1`,
		stockReq).Scan(&onSite, &used); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if onSite != "135.00" || used != "35.00" {
		t.Fatalf("stock = on_site %s used %s, want 135.00/35.00", onSite, used)
	}
}
