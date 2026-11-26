package httpapi

// hB requirements surface: list, store, update, delete, the two history
// reads, procurement list/request and the three stock writes.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHBRequirementsListAndGate(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	p := hBProjectPath(fx.projectID)

	rec := hBCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("list owner = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("list hired kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("list stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.notaris, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("list notary = %d, want 403", rec.Code)
	}
	rec = hBCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("list anon = %d, want 401", rec.Code)
	}
	rec = hBCall(t, RequirementsHandler(pool), http.MethodGet, "/abc", "", &fx.owner, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("list bad id = %d, want 404", rec.Code)
	}
}

func TestHBRequirementStoreUpdateDelete(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	body := `{"name":"hB Semen","quantity_required":100,"unit":"sak","bom_type":"raw","estimated_unit_cost":75000}`
	rec := hBCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("store = %d %s", rec.Code, rec.Body.String())
	}
	data := hBDecode(t, rec)["data"].(map[string]any)
	reqID := int64(data["id"].(float64))

	// Validation: missing name, bad bom, negative quantity.
	rec = hBCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x",
		`{"quantity_required":-1,"unit":"sak","bom_type":"bogus"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store invalid = %d, want 422", rec.Code)
	}
	// Forbidden: stranger and notary cannot mint BOM rows.
	rec = hBCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("store stranger = %d, want 403", rec.Code)
	}
	// Bad folder id.
	rec = hBCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x",
		`{"name":"hB X","quantity_required":1,"unit":"pcs","bom_type":"raw","folder_id":999999999}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store bad folder = %d, want 422, got %s", rec.Code, rec.Body.String())
	}

	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}
	rec = hBCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x",
		`{"name":"hB Semen Plus","quantity_required":120}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("update = %d %s", rec.Code, rec.Body.String())
	}
	// Update validation.
	rec = hBCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x",
		`{"bom_type":"bogus"}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update invalid = %d, want 422", rec.Code)
	}
	// Cross-project binding: requirement of another project 404s.
	var otherReq int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, created_at, updated_at)
		VALUES ($1, 'hB Other', 1, 'pcs', 'raw', now(), now()) RETURNING id`, fx.project2ID).Scan(&otherReq); err != nil {
		t.Fatalf("other requirement: %v", err)
	}
	xp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(otherReq)}
	rec = hBCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hB Hijack"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("update cross-project = %d, want 404", rec.Code)
	}
	// Forbidden update.
	rec = hBCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hB No"}`, &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("update stranger = %d, want 403", rec.Code)
	}

	// History surfaces see the creation restock row.
	rec = hBCall(t, ProjectHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("history = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("requirement history = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("requirement history stranger = %d, want 403", rec.Code)
	}
	rp2 := map[string]string{"project": int64String(fx.project2ID), "requirement": int64String(otherReq)}
	rec = hBCall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, rp2)
	if rec.Code != http.StatusOK {
		t.Fatalf("requirement history other project = %d %s", rec.Code, rec.Body.String())
	}
	// Requirement bound to a different project than the path: 404.
	rec = hBCall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("requirement history cross-project = %d, want 404", rec.Code)
	}

	// Delete forbidden, then happy.
	rec = hBCall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delete stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete again = %d, want 404", rec.Code)
	}
}

func TestHBRequirementFolders(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	var folderA, folderB int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_material_folders (project_id, name, bom_type, created_by, created_at, updated_at)
		VALUES ($1, 'hB Folder A', 'raw', $2, now(), now()) RETURNING id`, fx.projectID, fx.owner.id).Scan(&folderA); err != nil {
		t.Fatalf("folder A: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO project_material_folders (project_id, name, bom_type, created_by, created_at, updated_at)
		VALUES ($1, 'hB Folder B', 'finishing', $2, now(), now()) RETURNING id`, fx.projectID, fx.owner.id).Scan(&folderB); err != nil {
		t.Fatalf("folder B: %v", err)
	}

	// Store inside a folder exercises the folder render branch.
	rec := hBCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x",
		`{"name":"hB Folded","quantity_required":5,"unit":"pcs","bom_type":"raw","folder_id":`+int64String(folderA)+`}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("store folder = %d %s", rec.Code, rec.Body.String())
	}
	reqID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}

	// Move tab (bom) and folder in one update: both history quirks fire.
	rec = hBCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x",
		`{"bom_type":"finishing","folder_id":`+int64String(folderB)+`}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("update folder = %d %s", rec.Code, rec.Body.String())
	}
	// Same folder id still logs the move.
	rec = hBCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x",
		`{"folder_id":`+int64String(folderB)+`}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("update same folder = %d %s", rec.Code, rec.Body.String())
	}
	// Move back to A with an explicit null note: another move logs.
	rec = hBCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x",
		`{"folder_id":`+int64String(folderA)+`,"notes":null}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("update back = %d %s", rec.Code, rec.Body.String())
	}
	var histories int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_requirement_histories WHERE project_requirement_id = $1 AND notes LIKE 'Moved from%'`,
		reqID).Scan(&histories); err != nil || histories != 4 {
		t.Fatalf("folder histories = %d, %v", histories, err)
	}
	// Deleted-folder placeholder (unreachable through the API behind the
	// SET NULL foreign key, so pinned directly).
	if got := folderNameOrDeleted(ctx, pool, folderA); got != "hB Folder A" {
		t.Fatalf("folder name = %q", got)
	}
	if got := folderNameOrDeleted(ctx, pool, 999999999); got != "Deleted Folder" {
		t.Fatalf("deleted folder = %q", got)
	}
}

func TestHBRequirementStoreFull(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	p := hBProjectPath(fx.projectID)

	vault := t.TempDir()
	t.Setenv("EVIDENCE_DIR", vault)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for k, v := range map[string]string{
		"name": "hB Full", "quantity_required": "7", "unit": "zak",
		"bom_type": "finishing", "quality_level": "premium", "category": "interior",
		"estimated_unit_cost": "90000", "notes": "hB n", "purpose": "hB p",
	} {
		if err := writer.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	part, err := writer.CreateFormFile("image", "hB.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	b := body.String()
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(b))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	for k, v := range p {
		req.SetPathValue(k, v)
	}
	req = req.WithContext(withCaller(req.Context(), fx.owner))
	rec := httptest.NewRecorder()
	StoreRequirementHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("store full = %d %s", rec.Code, rec.Body.String())
	}
	data := hBDecode(t, rec)["data"].(map[string]any)
	if data["quality_level"] != "premium" || data["image_url"] == nil {
		t.Fatalf("full fields = %v", data)
	}
}

func TestHBRequirementStock(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()

	var reqID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, quantity_on_site, quantity_used, created_at, updated_at, user_id)
		VALUES ($1, 'hB Bata', 1000, 'pcs', 'raw', 100, 10, now(), now(), $2) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&reqID); err != nil {
		t.Fatalf("seed requirement: %v", err)
	}
	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}

	// Restock as owner: narrow gate admits owner.
	rec := hBCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":50}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("restock = %d %s", rec.Code, rec.Body.String())
	}
	// Restock as hired kontraktor; forbidden for the arsitek colleague.
	rec = hBCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":10}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("restock kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":10}`, &fx.arsitek, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("restock arsitek = %d, want 403", rec.Code)
	}
	// Validation: missing quantity.
	rec = hBCall(t, RestockHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("restock empty = %d, want 422", rec.Code)
	}

	// Use more than on site: 422.
	rec = hBCall(t, UseHandler(pool), http.MethodPost, "/x", `{"quantity":999999}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("use over stock = %d, want 422", rec.Code)
	}
	rec = hBCall(t, UseHandler(pool), http.MethodPost, "/x", `{"quantity":20}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("use = %d %s", rec.Code, rec.Body.String())
	}

	// Usage keeps the full BOM gate (arsitek passes) and answers bare data.
	rec = hBCall(t, UsageHandler(pool), http.MethodPost, "/x", `{"quantity":5}`, &fx.arsitek, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("usage = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UsageHandler(pool), http.MethodPost, "/x", `{"quantity":5}`, &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("usage stranger = %d, want 403", rec.Code)
	}

	var onSite, used string
	if err := pool.QueryRow(ctx, `SELECT quantity_on_site::text, quantity_used::text FROM project_requirements WHERE id = $1`,
		reqID).Scan(&onSite, &used); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if onSite != "135.00" || used != "35.00" {
		t.Fatalf("stock = on_site %s used %s, want 135.00/35.00", onSite, used)
	}
}

func TestHBProcurement(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	var reqID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, estimated_unit_cost, created_at, updated_at, user_id)
		VALUES ($1, 'hB Besi', 50, 'btg', 'raw', 200000, now(), now(), $2) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&reqID); err != nil {
		t.Fatalf("seed requirement: %v", err)
	}
	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}

	// Empty list for the owner.
	rec := hBCall(t, ProcurementListHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("procure list = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, ProcurementListHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("procure list stranger = %d, want 403", rec.Code)
	}

	// Request as hired kontraktor: project has a PM, so pending_pm.
	rec = hBCall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":10,"message":"hB need"}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("procure request = %d %s", rec.Code, rec.Body.String())
	}
	list := hBDecode(t, hBCall(t, ProcurementListHandler(pool), http.MethodGet, "/x", "", &fx.owner, p))
	if data, _ := list["data"].([]any); len(data) != 1 {
		t.Fatalf("procure list len = %v", list)
	}

	// Validation: quantity below minimum.
	rec = hBCall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":0}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("procure invalid = %d, want 422", rec.Code)
	}
	// Forbidden: stranger.
	rec = hBCall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":2}`, &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("procure stranger = %d, want 403", rec.Code)
	}

	// Frozen: an open dispute blocks new payables.
	if _, err := pool.Exec(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
		VALUES ($1, $2, 'payment', 'hB freeze', 'hB frozen', 'open')`, fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("dispute: %v", err)
	}
	rec = hBCall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":2}`, &fx.kontraktor, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("procure frozen = %d, want 422", rec.Code)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id = $1`, fx.projectID); err != nil {
		t.Fatalf("dispute cleanup: %v", err)
	}

	// No-PM project takes the owner-approval addendum path.
	var req2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, estimated_unit_cost, created_at, updated_at, user_id)
		VALUES ($1, 'hB Cat', 20, 'kaleng', 'finishing', 150000, now(), now(), $2) RETURNING id`,
		fx.project2ID, fx.owner.id).Scan(&req2); err != nil {
		t.Fatalf("seed requirement2: %v", err)
	}
	rp2 := map[string]string{"project": int64String(fx.project2ID), "requirement": int64String(req2)}
	rec = hBCall(t, RequestProcurementHandler(pool), http.MethodPost, "/x",
		`{"quantity_needed":4}`, &fx.owner, rp2)
	if rec.Code != http.StatusOK {
		t.Fatalf("procure no-pm = %d %s", rec.Code, rec.Body.String())
	}
}
