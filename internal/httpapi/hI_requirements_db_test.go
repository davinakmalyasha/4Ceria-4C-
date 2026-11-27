package httpapi

// hI requirements leftovers: store/update/delete validation twins,
// cross-project 404s, forbidden twins and literal post-state.

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestHIRequirementsListGate(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	p := hIProjectPath(fx.projectID)

	rec := hICall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("list owner = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("list hired kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("list stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("list anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, RequirementsHandler(pool), http.MethodGet, "/abc", "", &fx.owner, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("list bad id = %d, want 404", rec.Code)
	}
	rec = hICall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("list ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Record not found.") {
		t.Fatalf("list ghost body = %s", rec.Body.String())
	}
}

func TestHIRequirementStoreUpdateDelete(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	body := `{"name":"hI Semen","quantity_required":100,"unit":"sak","bom_type":"raw","estimated_unit_cost":75000}`
	rec := hICall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("store = %d %s", rec.Code, rec.Body.String())
	}
	data := hIDecode(t, rec)["data"].(map[string]any)
	reqID := int64(data["id"].(float64))
	if data["name"] != "hI Semen" {
		t.Fatalf("store name = %v", data["name"])
	}

	// Validation twins: missing name, bad bom, negative quantity, non-string unit.
	cases := []struct{ name, payload string }{
		{"missing-name", `{"quantity_required":1,"unit":"sak","bom_type":"raw"}`},
		{"bad-bom", `{"name":"hI","quantity_required":1,"unit":"sak","bom_type":"bogus"}`},
		{"neg-qty", `{"name":"hI","quantity_required":-1,"unit":"sak","bom_type":"raw"}`},
		{"unit-num", `{"name":"hI","quantity_required":1,"unit":123,"bom_type":"raw"}`},
		{"name-long", `{"name":"` + strings.Repeat("x", 256) + `","quantity_required":1,"unit":"sak","bom_type":"raw"}`},
		{"unit-long", `{"name":"hI","quantity_required":1,"unit":"` + strings.Repeat("u", 51) + `","bom_type":"raw"}`},
		{"quality-bad", `{"name":"hI","quantity_required":1,"unit":"sak","bom_type":"raw","quality_level":"bogus"}`},
		{"category-bad", `{"name":"hI","quantity_required":1,"unit":"sak","bom_type":"raw","category":"bogus"}`},
		{"est-neg", `{"name":"hI","quantity_required":1,"unit":"sak","bom_type":"raw","estimated_unit_cost":-5}`},
		{"folder-bad", `{"name":"hI","quantity_required":1,"unit":"pcs","bom_type":"raw","folder_id":"abc"}`},
	}
	for _, tc := range cases {
		rec = hICall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", tc.payload, &fx.owner, p)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("store %s = %d, want 422 %s", tc.name, rec.Code, rec.Body.String())
		}
	}
	// Forbidden: stranger cannot mint.
	rec = hICall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("store stranger = %d, want 403", rec.Code)
	}
	// Anon 401, bad project 404, ghost 404.
	rec = hICall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("store anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("store bad project = %d, want 404", rec.Code)
	}
	rec = hICall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("store ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}
	rec = hICall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x",
		`{"name":"hI Semen Plus","quantity_required":120}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("update = %d %s", rec.Code, rec.Body.String())
	}
	var name string
	if err := pool.QueryRow(ctx, `SELECT name FROM project_requirements WHERE id = $1`, reqID).Scan(&name); err != nil || name != "hI Semen Plus" {
		t.Fatalf("update post-state = %q %v", name, err)
	}
	// Update validation twins.
	updateCases := []struct{ name, payload string }{
		{"bom-bogus", `{"bom_type":"bogus"}`},
		{"qty-neg", `{"quantity_required":-2}`},
		{"qty-alpha", `{"quantity_required":"abc"}`},
		{"unit-long", `{"unit":"` + strings.Repeat("u", 51) + `"}`},
		{"bom-num", `{"bom_type":123}`},
		{"quality-bad", `{"quality_level":"bogus"}`},
		{"category-bad", `{"category":"bogus"}`},
		{"est-neg", `{"estimated_unit_cost":-1}`},
		{"folder-alpha", `{"folder_id":"xyz"}`},
		{"name-long", `{"name":"` + strings.Repeat("y", 256) + `"}`},
	}
	for _, tc := range updateCases {
		rec = hICall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", tc.payload, &fx.owner, rp)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("update %s = %d, want 422 %s", tc.name, rec.Code, rec.Body.String())
		}
	}
	// Cross-project binding 404 with plain Not found.
	var otherReq int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, created_at, updated_at)
		VALUES ($1, 'hI Other', 1, 'pcs', 'raw', now(), now()) RETURNING id`, fx.project2ID).Scan(&otherReq); err != nil {
		t.Fatalf("other requirement: %v", err)
	}
	xp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(otherReq)}
	rec = hICall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hI Hijack"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("update cross-project = %d, want 404", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Not found.") {
		t.Fatalf("update cross body = %s", rec.Body.String())
	}
	// Forbidden update.
	rec = hICall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hI No"}`, &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("update stranger = %d, want 403", rec.Code)
	}
	// Bad ids.
	rec = hICall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hI"}`, &fx.owner,
		map[string]string{"project": "abc", "requirement": int64String(reqID)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("update bad project = %d, want 404", rec.Code)
	}
	rec = hICall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hI"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "requirement": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("update bad req = %d, want 404", rec.Code)
	}
	// Missing requirement → 404 model.
	rec = hICall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hI"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "requirement": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("update missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// Delete forbidden, then happy, then missing 404.
	rec = hICall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delete stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Deleted") {
		t.Fatalf("delete body = %s", rec.Body.String())
	}
	rec = hICall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete again = %d, want 404", rec.Code)
	}
	var left int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_requirements WHERE id = $1`, reqID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("delete post-state = %d %v", left, err)
	}
}
