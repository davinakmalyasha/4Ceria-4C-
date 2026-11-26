package httpapi

// hF remainder edges, part two: requirements, procurement, stock,
// histories, disputes (user + admin act + withdraw), reports, activity,
// project store extras and the admin list edges.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHFRequirementEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	// Absolute image URLs pass through verbatim.
	if _, err := pool.Exec(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, image_path, created_at, updated_at, user_id)
		VALUES ($1, 'hF Cdn', 3, 'pcs', 'raw', 'https://cdn.test/hF.jpg', now(), now(), $2)`,
		fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("cdn requirement: %v", err)
	}
	rec := hFCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("requirements list = %d %s", rec.Code, rec.Body.String())
	}
	found := false
	for _, item := range hFDecode(t, rec)["data"].([]any) {
		row, _ := item.(map[string]any)
		if row["name"] == "hF Cdn" {
			found = true
			if row["image_url"] != "https://cdn.test/hF.jpg" {
				t.Fatalf("image_url = %v", row["image_url"])
			}
		}
	}
	if !found {
		t.Fatalf("cdn requirement missing: %s", rec.Body.String())
	}

	// A folder renders on the stored requirement.
	var folderID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_material_folders (project_id, name, bom_type, created_by, created_at, updated_at)
		VALUES ($1, 'hF Folder', 'raw', $2, now(), now()) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&folderID); err != nil {
		t.Fatalf("folder: %v", err)
	}
	rec = hFCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x",
		`{"name":"hF Folded","quantity_required":2,"unit":"pcs","bom_type":"raw","folder_id":`+int64String(folderID)+`}`,
		&fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("store folder = %d %s", rec.Code, rec.Body.String())
	}
	// The store answer carries the folder id; the list renders the folder.
	if got := hFDecode(t, rec)["data"].(map[string]any)["folder_id"]; got != float64(folderID) {
		t.Fatalf("store folder_id = %v, want %d", got, folderID)
	}
	rec = hFCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("requirements list = %d %s", rec.Code, rec.Body.String())
	}
	folded := false
	for _, item := range hFDecode(t, rec)["data"].([]any) {
		row, _ := item.(map[string]any)
		if row["name"] == "hF Folded" {
			folded = true
			folder, _ := row["folder"].(map[string]any)
			if folder["name"] != "hF Folder" {
				t.Fatalf("folder render = %v", row)
			}
		}
	}
	if !folded {
		t.Fatalf("folded requirement missing: %s", rec.Body.String())
	}

	// Gates: anonymous, malformed project, stranger.
	if rec := hFCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("requirements anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("requirements bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, RequirementsHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p); rec.Code != http.StatusForbidden {
		t.Fatalf("requirements stranger = %d, want 403", rec.Code)
	}

	// Store validation: non-numeric estimated cost.
	rec = hFCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x",
		`{"name":"hF","quantity_required":1,"unit":"pcs","bom_type":"raw","estimated_unit_cost":"abc"}`,
		&fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store cost type = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Update validation twins: non-string unit, invalid quality, unknown folder.
	var reqID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, created_at, updated_at, user_id)
		VALUES ($1, 'hF Upd', 1, 'pcs', 'raw', now(), now(), $2) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&reqID); err != nil {
		t.Fatalf("seed requirement: %v", err)
	}
	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}
	rec = hFCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"unit":123}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update unit type = %d, want 422", rec.Code)
	}
	rec = hFCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"quality_level":"ultra"}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update quality = %d, want 422", rec.Code)
	}
	rec = hFCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"folder_id":999999999}`, &fx.owner, rp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update folder = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Missing rows answer the binding 404, never 500.
	missing := map[string]string{"project": int64String(fx.projectID), "requirement": "999999999"}
	if rec := hFCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hF"}`,
		&fx.owner, missing); rec.Code != http.StatusNotFound {
		t.Fatalf("update missing = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\ProjectRequirement] 999999999` {
		t.Fatalf("update missing message = %q", got)
	}
	if rec := hFCall(t, UpdateRequirementHandler(pool), http.MethodPut, "/x", `{"name":"hF"}`,
		&fx.owner, map[string]string{"project": int64String(fx.projectID), "requirement": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("update bad id = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.owner, missing); rec.Code != http.StatusNotFound {
		t.Fatalf("delete missing = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\ProjectRequirement] 999999999` {
		t.Fatalf("delete missing message = %q", got)
	}
	if rec := hFCall(t, DeleteRequirementHandler(pool), http.MethodDelete, "/x", "", &fx.owner,
		map[string]string{"project": int64String(fx.project2ID), "requirement": int64String(reqID)}); rec.Code != http.StatusNotFound {
		t.Fatalf("delete cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	} else if got := hFDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("delete cross-project message = %q", got)
	}
}

func TestHFRequirementStoreValidation(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	p := hFProjectPath(fx.projectID)

	bodies := []string{
		`{"name":123,"quantity_required":1,"unit":"pcs","bom_type":"raw"}`,
		`{"name":"","quantity_required":1,"unit":"pcs","bom_type":"raw"}`,
		`{"name":"` + strings.Repeat("n", 256) + `","quantity_required":1,"unit":"pcs","bom_type":"raw"}`,
		`{"name":"hF","quantity_required":"abc","unit":"pcs","bom_type":"raw"}`,
		`{"name":"hF","quantity_required":-2,"unit":"pcs","bom_type":"raw"}`,
		`{"name":"hF","quantity_required":1,"unit":123,"bom_type":"raw"}`,
		`{"name":"hF","quantity_required":1,"unit":"","bom_type":"raw"}`,
		`{"name":"hF","quantity_required":1,"unit":"` + strings.Repeat("u", 51) + `","bom_type":"raw"}`,
		`{"name":"hF","quantity_required":1,"unit":"pcs","bom_type":123}`,
		`{"name":"hF","quantity_required":1,"unit":"pcs","bom_type":"raw","quality_level":123}`,
		`{"name":"hF","quantity_required":1,"unit":"pcs","bom_type":"raw","category":123}`,
		`{"name":"hF","quantity_required":1,"unit":"pcs","bom_type":"raw","estimated_unit_cost":-3}`,
		`{"name":"hF","quantity_required":1,"unit":"pcs","bom_type":"raw","notes":123,"purpose":123}`,
		`{"name":"hF","quantity_required":1,"unit":"pcs","bom_type":"raw","folder_id":"abc"}`,
	}
	for i, body := range bodies {
		if rec := hFCall(t, StoreRequirementHandler(pool), http.MethodPost, "/x", body, &fx.owner, p); rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("store invalid %d = %d, want 422 %s", i, rec.Code, rec.Body.String())
		}
	}

	// Image validation: a non-image fails both rules; an oversize image
	// fails the size rule.
	for i, tc := range []struct {
		name string
		data []byte
	}{
		{"hF.txt", []byte("hF plain text")},
		{"hF-big.png", append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 6<<20)...)},
	} {
		reader, ctype := hFMultipart(t,
			map[string]string{"name": "hF Img", "quantity_required": "1", "unit": "pcs", "bom_type": "raw"},
			"image", tc.name, tc.data)
		req := httptest.NewRequest(http.MethodPost, "/x", reader)
		req.Header.Set("Content-Type", ctype)
		for k, v := range p {
			req.SetPathValue(k, v)
		}
		req = req.WithContext(withCaller(req.Context(), fx.owner))
		rec := httptest.NewRecorder()
		StoreRequirementHandler(pool)(rec, req)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("store image %d = %d, want 422 %s", i, rec.Code, rec.Body.String())
		}
	}

	// Requirement history via the URL fallback: no PathValue set, the id
	// comes from the path itself.
	var reqID int64
	if err := pool.QueryRow(context.Background(), `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, created_at, updated_at, user_id)
		VALUES ($1, 'hF Fallback', 1, 'pcs', 'raw', now(), now(), $2) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&reqID); err != nil {
		t.Fatalf("seed requirement: %v", err)
	}
	fallbackReq := httptest.NewRequest(http.MethodGet,
		"/api/projects/"+int64String(fx.projectID)+"/requirements/"+int64String(reqID)+"/history", nil)
	fallbackReq = fallbackReq.WithContext(withCaller(fallbackReq.Context(), fx.owner))
	fallbackRec := httptest.NewRecorder()
	RequirementHistoryHandler(pool)(fallbackRec, fallbackReq)
	if fallbackRec.Code != http.StatusOK {
		t.Fatalf("history fallback = %d %s", fallbackRec.Code, fallbackRec.Body.String())
	}
}

func TestHFProcurementStockHistoryEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	var reqID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, estimated_unit_cost, created_at, updated_at, user_id)
		VALUES ($1, 'hF Besi', 50, 'btg', 'raw', 200000, now(), now(), $2) RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&reqID); err != nil {
		t.Fatalf("seed requirement: %v", err)
	}
	rp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(reqID)}

	// Procurement validation twins.
	for _, tc := range []struct {
		name string
		body string
	}{
		{"missing quantity", `{}`},
		{"non-numeric quantity", `{"quantity_needed":"abc"}`},
		{"negative cost", `{"quantity_needed":2,"estimated_unit_cost":-5}`},
		{"non-numeric cost", `{"quantity_needed":2,"estimated_unit_cost":"abc"}`},
		{"long message", `{"quantity_needed":2,"message":"` + strings.Repeat("m", 501) + `"}`},
		{"bad offer", `{"quantity_needed":2,"offer_to_buy":"maybe"}`},
	} {
		if rec := hFCall(t, RequestProcurementHandler(pool), http.MethodPost, "/x", tc.body, &fx.kontraktor, rp); rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("procure %s = %d, want 422 %s", tc.name, rec.Code, rec.Body.String())
		}
	}
	// Anonymous and malformed project twins.
	if rec := hFCall(t, RequestProcurementHandler(pool), http.MethodPost, "/x", `{"quantity_needed":1}`, nil, rp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("procure anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, ProcurementListHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("procure list bad = %d, want 404", rec.Code)
	}

	// Stock validation twins.
	if rec := hFCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":0}`, &fx.owner, rp); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("restock zero = %d, want 422", rec.Code)
	}
	if rec := hFCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":"abc"}`, &fx.owner, rp); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("restock type = %d, want 422", rec.Code)
	}
	if rec := hFCall(t, RestockHandler(pool), http.MethodPost, "/x",
		`{"quantity":1,"notes":"`+strings.Repeat("n", 1001)+`"}`, &fx.owner, rp); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("restock notes = %d, want 422", rec.Code)
	}
	if rec := hFCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":1}`, nil, rp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("restock anon = %d, want 401", rec.Code)
	}
	// Cross-project requirement: 404 "Not found.".
	var otherReq int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, created_at, updated_at, user_id)
		VALUES ($1, 'hF Other', 1, 'pcs', 'raw', now(), now(), $2) RETURNING id`,
		fx.project2ID, fx.owner.id).Scan(&otherReq); err != nil {
		t.Fatalf("other requirement: %v", err)
	}
	xp := map[string]string{"project": int64String(fx.projectID), "requirement": int64String(otherReq)}
	if rec := hFCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":1}`, &fx.owner, xp); rec.Code != http.StatusNotFound {
		t.Fatalf("restock cross = %d, want 404 %s", rec.Code, rec.Body.String())
	} else if got := hFDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("restock cross message = %q", got)
	}

	// Restock with explicit notes pins the history copy verbatim.
	rec := hFCall(t, RestockHandler(pool), http.MethodPost, "/x", `{"quantity":7,"notes":"hF noted"}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("restock notes = %d %s", rec.Code, rec.Body.String())
	}
	var historyNotes string
	if err := pool.QueryRow(ctx, `SELECT notes FROM project_requirement_histories WHERE project_requirement_id = $1 ORDER BY id DESC LIMIT 1`,
		reqID).Scan(&historyNotes); err != nil || historyNotes != "hF noted" {
		t.Fatalf("history notes = %q, %v", historyNotes, err)
	}
	var onSite string
	if err := pool.QueryRow(ctx, `SELECT quantity_on_site::text FROM project_requirements WHERE id = $1`, reqID).Scan(&onSite); err != nil || onSite != "7.00" {
		t.Fatalf("on_site = %q, %v", onSite, err)
	}

	// History gates: anonymous, malformed project, missing project, stranger.
	if rec := hFCall(t, ProjectHistoryHandler(pool), http.MethodGet, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("history anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, ProjectHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("history bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, ProjectHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "999999999"}); rec.Code != http.StatusNotFound {
		t.Fatalf("history missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if rec := hFCall(t, ProjectHistoryHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p); rec.Code != http.StatusForbidden {
		t.Fatalf("history stranger = %d, want 403", rec.Code)
	}
	if rec := hFCall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", nil, rp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("req history anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "requirement": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("req history bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, RequirementHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "requirement": "999999999"}); rec.Code != http.StatusNotFound {
		t.Fatalf("req history missing = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\ProjectRequirement] 999999999` {
		t.Fatalf("req history missing message = %q", got)
	}
}

func TestHFDisputesEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	// Gates on the index: anonymous and malformed project.
	if rec := hFCall(t, ProjectDisputesIndexHandler(pool), http.MethodGet, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("disputes index anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, ProjectDisputesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("disputes index bad = %d, want 404", rec.Code)
	}

	// Store validation twins.
	for _, tc := range []struct {
		name string
		body string
	}{
		{"empty", `{}`},
		{"bad category", `{"category":"wizard","title":"hF","description":"hF"}`},
		{"type without id", `{"category":"payment","title":"hF","description":"hF","payment_type":"termin"}`},
		{"negative amount", `{"category":"payment","title":"hF","description":"hF","disputed_amount":-1}`},
		{"zero payment id", `{"category":"payment","title":"hF","description":"hF","payment_id":0}`},
	} {
		if rec := hFCall(t, ProjectDisputeStoreHandler(pool), http.MethodPost, "/x", tc.body, &fx.owner, p); rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("dispute store %s = %d, want 422 %s", tc.name, rec.Code, rec.Body.String())
		}
	}

	// Happy open on the fixture project.
	rec := hFCall(t, ProjectDisputeStoreHandler(pool), http.MethodPost, "/x",
		`{"category":"payment","title":"hF open","description":"hF frozen"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("dispute store = %d %s", rec.Code, rec.Body.String())
	}
	disputeID := int64(hFDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	dp := hFDisputePaths(fx.projectID, disputeID)

	// A second open dispute conflicts, naming the first.
	rec = hFCall(t, ProjectDisputeStoreHandler(pool), http.MethodPost, "/x",
		`{"category":"quality","title":"hF dup","description":"hF"}`, &fx.owner, p)
	if rec.Code != http.StatusConflict {
		t.Fatalf("dispute dup = %d, want 409 %s", rec.Code, rec.Body.String())
	}
	want := "Project already has open dispute #" + int64String(disputeID) + ` ("hF open"). Payments stay frozen until it is resolved.`
	if got := hFDecode(t, rec)["message"]; got != want {
		t.Fatalf("dispute dup message = %q want %q", got, want)
	}

	// Show twins: malformed, missing, cross-project, stranger.
	badDispute := map[string]string{"project": int64String(fx.projectID), "dispute": "abc"}
	if rec := hFCall(t, ProjectDisputeShowHandler(pool), http.MethodGet, "/x", "", &fx.owner, badDispute); rec.Code != http.StatusNotFound {
		t.Fatalf("dispute show bad = %d, want 404", rec.Code)
	}
	noDispute := map[string]string{"project": int64String(fx.projectID), "dispute": "999999999"}
	if rec := hFCall(t, ProjectDisputeShowHandler(pool), http.MethodGet, "/x", "", &fx.owner, noDispute); rec.Code != http.StatusNotFound {
		t.Fatalf("dispute show missing = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\ProjectDispute] 999999999` {
		t.Fatalf("dispute show missing message = %q", got)
	}
	if rec := hFCall(t, ProjectDisputeShowHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		hFDisputePaths(fx.project2ID, disputeID)); rec.Code != http.StatusNotFound {
		t.Fatalf("dispute show cross = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("dispute show cross message = %q", got)
	}
	if rec := hFCall(t, ProjectDisputeShowHandler(pool), http.MethodGet, "/x", "", &fx.stranger, dp); rec.Code != http.StatusForbidden {
		t.Fatalf("dispute show stranger = %d, want 403", rec.Code)
	}

	// Reply twins: empty, non-participant, cross-project.
	if rec := hFCall(t, ProjectDisputeReplyHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, dp); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply empty = %d, want 422", rec.Code)
	}
	if rec := hFCall(t, ProjectDisputeReplyHandler(pool), http.MethodPost, "/x", `{"body":"hF"}`,
		&fx.stranger, dp); rec.Code != http.StatusForbidden {
		t.Fatalf("reply stranger = %d, want 403", rec.Code)
	}
	if rec := hFCall(t, ProjectDisputeReplyHandler(pool), http.MethodPost, "/x", `{"body":"hF"}`,
		&fx.owner, hFDisputePaths(fx.project2ID, disputeID)); rec.Code != http.StatusNotFound {
		t.Fatalf("reply cross = %d, want 404", rec.Code)
	}

	// A reply renders in the thread: index and show carry one message.
	rec = hFCall(t, ProjectDisputeReplyHandler(pool), http.MethodPost, "/x", `{"body":"hF noted"}`,
		&fx.kontraktor, dp)
	if rec.Code != http.StatusCreated {
		t.Fatalf("reply = %d %s", rec.Code, rec.Body.String())
	}
	rec = hFCall(t, ProjectDisputesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("disputes index = %d %s", rec.Code, rec.Body.String())
	}
	list := hFDecode(t, rec)["data"].([]any)
	if len(list) != 1 {
		t.Fatalf("disputes index len = %d", len(list))
	}
	rec = hFCall(t, ProjectDisputeShowHandler(pool), http.MethodGet, "/x", "", &fx.owner, dp)
	if rec.Code != http.StatusOK {
		t.Fatalf("dispute show = %d %s", rec.Code, rec.Body.String())
	}

	// A reply with an evidence file stores to the vault and names the file.
	vault := t.TempDir()
	t.Setenv("EVIDENCE_DIR", vault)
	var evBody bytes.Buffer
	evWriter := multipart.NewWriter(&evBody)
	if err := evWriter.WriteField("body", "hF with proof"); err != nil {
		t.Fatal(err)
	}
	evPart, err := evWriter.CreateFormFile("evidence", "hF-ev.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := evPart.Write([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}); err != nil {
		t.Fatal(err)
	}
	if err := evWriter.Close(); err != nil {
		t.Fatal(err)
	}
	evReq := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(evBody.String()))
	evReq.Header.Set("Content-Type", evWriter.FormDataContentType())
	evReq.SetPathValue("project", int64String(fx.projectID))
	evReq.SetPathValue("dispute", int64String(disputeID))
	evReq = evReq.WithContext(withCaller(evReq.Context(), fx.kontraktor))
	evRec := httptest.NewRecorder()
	ProjectDisputeReplyHandler(pool)(evRec, evReq)
	if evRec.Code != http.StatusCreated {
		t.Fatalf("reply evidence = %d %s", evRec.Code, evRec.Body.String())
	}
	evData := hFDecode(t, evRec)["data"].(map[string]any)
	if evData["evidence_original_name"] != "hF-ev.png" {
		t.Fatalf("evidence name = %v", evData)
	}
	evPath, _ := evData["evidence_path"].(string)
	if evPath == "" {
		t.Fatalf("evidence path empty: %v", evData)
	}
	if _, err := os.Stat(filepath.Join(vault, filepath.FromSlash(evPath))); err != nil {
		t.Fatalf("evidence file missing: %v", err)
	}

	// Withdraw twins: anonymous, malformed project, missing dispute,
	// non-participant, non-opener participant, cross-project.
	if rec := hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", nil, dp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("withdraw anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", &fx.owner,
		map[string]string{"project": "abc", "dispute": int64String(disputeID)}); rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw bad project = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "dispute": "999999999"}); rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw missing = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", &fx.stranger, dp); rec.Code != http.StatusForbidden {
		t.Fatalf("withdraw stranger = %d, want 403", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != "Unauthorized. Only project participants can view disputes." {
		t.Fatalf("withdraw stranger message = %q", got)
	}
	if rec := hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", &fx.kontraktor, dp); rec.Code != http.StatusForbidden {
		t.Fatalf("withdraw non-opener = %d, want 403", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != "Only the dispute opener can withdraw it." {
		t.Fatalf("withdraw non-opener message = %q", got)
	}
	if rec := hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", &fx.owner,
		hFDisputePaths(fx.project2ID, disputeID)); rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw cross = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("withdraw cross message = %q", got)
	}

	// Happy withdraw by the opener: status flips, the kontraktor is told.
	rec = hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", &fx.owner, dp)
	if rec.Code != http.StatusOK {
		t.Fatalf("withdraw = %d %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "Dispute withdrawn. Payments are unfrozen." {
		t.Fatalf("withdraw message = %q", got)
	}
	var status string
	var kontraktorNotified int
	if err := pool.QueryRow(ctx, `SELECT status::text,
		(SELECT count(*) FROM notifications WHERE user_id = $2 AND type = 'dispute_resolved') FROM project_disputes WHERE id = $1`,
		disputeID, hFKontraktorID).Scan(&status, &kontraktorNotified); err != nil {
		t.Fatalf("withdraw post: %v", err)
	}
	if status != "withdrawn" || kontraktorNotified != 1 {
		t.Fatalf("withdraw post = %s notified %d, want withdrawn/1", status, kontraktorNotified)
	}

	// A closed thread refuses replies and second withdrawals.
	if rec := hFCall(t, ProjectDisputeReplyHandler(pool), http.MethodPost, "/x", `{"body":"hF late"}`,
		&fx.owner, dp); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply closed = %d, want 422", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != "This dispute is closed; the thread no longer accepts messages." {
		t.Fatalf("reply closed message = %q", got)
	}
	if rec := hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "", &fx.owner, dp); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("withdraw again = %d, want 422", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != "This dispute is already closed." {
		t.Fatalf("withdraw again message = %q", got)
	}

	// An admin who participates (owner) withdraws a dispute opened by the
	// hired kontraktor: the not-opener-but-admin branch.
	const adminProject = 960012
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_kontraktor_id)
		VALUES ($1, $2, 'hF Admin Owned', 'hF ao', 3000000, 'hF Ville', 'open', '2027-05-01', $3)`,
		adminProject, hFAdminID, hFKontraktorProfileID); err != nil {
		t.Fatalf("admin project: %v", err)
	}
	var dispute3 int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
		VALUES ($1, $2, 'delay', 'hF d3', 'hF dd3', 'open') RETURNING id`,
		adminProject, fx.kontraktor.id).Scan(&dispute3); err != nil {
		t.Fatalf("dispute3: %v", err)
	}
	rec = hFCall(t, ProjectDisputeWithdrawHandler(pool), http.MethodPost, "/x/withdraw", "",
		&fx.admin, hFDisputePaths(adminProject, dispute3))
	if rec.Code != http.StatusOK {
		t.Fatalf("admin withdraw = %d %s", rec.Code, rec.Body.String())
	}
	var withdrawn string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM project_disputes WHERE id = $1`, dispute3).Scan(&withdrawn); err != nil || withdrawn != "withdrawn" {
		t.Fatalf("admin withdraw status = %q, %v", withdrawn, err)
	}
}

func TestHFAdminDisputeActEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()

	newDispute := func(title string) int64 {
		t.Helper()
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
			VALUES ($1, $2, 'payment', $3, 'hF d', 'open') RETURNING id`,
			fx.projectID, fx.owner.id, title).Scan(&id); err != nil {
			t.Fatalf("dispute %s: %v", title, err)
		}
		return id
	}
	act := func(disputeID int64, body string, caller *roadmapCaller) map[string]any {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("dispute", int64String(disputeID))
		if caller != nil {
			req = req.WithContext(withCaller(req.Context(), *caller))
		}
		rec := httptest.NewRecorder()
		AdminDisputeActHandler(pool)(rec, req)
		return map[string]any{"code": rec.Code, "body": rec.Body.String()}
	}

	// Anonymous, malformed id, missing row: 401/404 twins.
	if got := act(1, `{"action":"dismiss"}`, nil); got["code"] != http.StatusUnauthorized {
		t.Fatalf("act anon = %v", got)
	}
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"dismiss"}`))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("dispute", "abc")
	rec := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("act bad id = %d, want 404", rec.Code)
	}
	req = httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"dismiss"}`))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("dispute", "999999999")
	req = req.WithContext(withCaller(req.Context(), fx.admin))
	rec = httptest.NewRecorder()
	AdminDisputeActHandler(pool)(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("act missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// Validation twins on a live dispute.
	live := newDispute("hF live")
	if got := act(live, `{}`, &fx.admin); got["code"] != http.StatusUnprocessableEntity {
		t.Fatalf("act empty = %v", got)
	}
	if got := act(live, `{"action":"explode"}`, &fx.admin); got["code"] != http.StatusUnprocessableEntity {
		t.Fatalf("act invalid = %v", got)
	}
	if got := act(live, `{"action":"dismiss","notes":123}`, &fx.admin); got["code"] != http.StatusUnprocessableEntity {
		t.Fatalf("act notes type = %v", got)
	}
	if got := act(live, `{"action":"dismiss","amount":"abc"}`, &fx.admin); got["code"] != http.StatusUnprocessableEntity {
		t.Fatalf("act amount type = %v", got)
	}
	if got := act(live, `{"action":"custom"}`, &fx.admin); got["code"] != http.StatusUnprocessableEntity {
		t.Fatalf("act custom notes = %v", got)
	} else if !strings.Contains(got["body"].(string), "Resolution notes are required for a custom resolution.") {
		t.Fatalf("act custom body = %s", got["body"])
	}
	if got := act(live, `{"action":"record_refund"}`, &fx.admin); got["code"] != http.StatusUnprocessableEntity {
		t.Fatalf("act refund amount = %v", got)
	} else if !strings.Contains(got["body"].(string), "A positive refund amount is required.") {
		t.Fatalf("act refund body = %s", got["body"])
	}

	// Dismiss happy: exact message, status, activity and owner notice.
	if got := act(live, `{"action":"dismiss","notes":"hF reviewed"}`, &fx.admin); got["code"] != http.StatusOK {
		t.Fatalf("act dismiss = %v", got)
	} else if !strings.Contains(got["body"].(string), "Dispute dismissed. Payments are unfrozen.") {
		t.Fatalf("act dismiss body = %s", got["body"])
	}
	var status string
	var logCount, ownerNotified int
	if err := pool.QueryRow(ctx, `SELECT (SELECT status::text FROM project_disputes WHERE id = $3),
		(SELECT count(*) FROM project_activity_logs WHERE project_id = $1 AND action = 'dispute_resolved'),
		(SELECT count(*) FROM notifications WHERE user_id = $2 AND type = 'dispute_resolved')`,
		fx.projectID, hFOwnerID, live).Scan(&status, &logCount, &ownerNotified); err != nil {
		t.Fatalf("dismiss post: %v", err)
	}
	if status != "dismissed" || logCount != 1 || ownerNotified != 1 {
		t.Fatalf("dismiss post = %s logs %d notified %d, want dismissed/1/1", status, logCount, ownerNotified)
	}

	// A closed dispute refuses further action.
	if got := act(live, `{"action":"dismiss"}`, &fx.admin); got["code"] != http.StatusUnprocessableEntity {
		t.Fatalf("act closed = %v", got)
	} else if !strings.Contains(got["body"].(string), "This dispute is already closed.") {
		t.Fatalf("act closed body = %s", got["body"])
	}

	// Terminate-project happy: the project is cancelled.
	live2 := newDispute("hF live2")
	if got := act(live2, `{"action":"terminate_project"}`, &fx.admin); got["code"] != http.StatusOK {
		t.Fatalf("act terminate = %v", got)
	} else if !strings.Contains(got["body"].(string), "Project force-terminated. Dispute closed.") {
		t.Fatalf("act terminate body = %s", got["body"])
	}
	var projectStatus string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, fx.projectID).Scan(&projectStatus); err != nil || projectStatus != "cancelled" {
		t.Fatalf("project status = %q, %v", projectStatus, err)
	}
}

func TestHFStoreReportActivityAdminEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	// Report gates: anonymous store and malformed project twins.
	if rec := hFCall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hF","progress_percentage":10,"budget_health":"on_track"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("report store anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hF","progress_percentage":10,"budget_health":"on_track"}`, &fx.owner,
		map[string]string{"project": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("report store bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("reports index bad = %d, want 404", rec.Code)
	}

	// Report binding 404s: malformed and missing ids.
	rec := hFCall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hF week","progress_percentage":20,"budget_health":"on_track"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report store = %d %s", rec.Code, rec.Body.String())
	}
	reportID := int64(hFDecode(t, rec)["report"].(map[string]any)["id"].(float64))
	rp := map[string]string{"project": int64String(fx.projectID), "report": int64String(reportID)}
	badRP := map[string]string{"project": int64String(fx.projectID), "report": "abc"}
	if rec := hFCall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hF"}`, &fx.owner, badRP); rec.Code != http.StatusNotFound {
		t.Fatalf("report update bad = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\ProjectReport] abc` {
		t.Fatalf("report update bad message = %q", got)
	}
	missingRP := map[string]string{"project": int64String(fx.projectID), "report": "999999999"}
	if rec := hFCall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hF"}`, &fx.owner, missingRP); rec.Code != http.StatusNotFound {
		t.Fatalf("report update missing = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, badRP); rec.Code != http.StatusNotFound {
		t.Fatalf("report delete bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, missingRP); rec.Code != http.StatusNotFound {
		t.Fatalf("report delete missing = %d, want 404", rec.Code)
	}
	// Forbidden edit: a hired non-creator, non-owner professional.
	if rec := hFCall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hF hijack"}`,
		&fx.kontraktor, rp); rec.Code != http.StatusForbidden {
		t.Fatalf("report update kontraktor = %d, want 403", rec.Code)
	}
	if rec := hFCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp); rec.Code != http.StatusOK {
		t.Fatalf("report delete = %d %s", rec.Code, rec.Body.String())
	}

	// Activity: a missing project answers the binding 404, never 500.
	if rec := hFCall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "999999999"}); rec.Code != http.StatusNotFound {
		t.Fatalf("activity missing = %d, want 404 %s", rec.Code, rec.Body.String())
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Project] 999999999` {
		t.Fatalf("activity missing message = %q", got)
	}

	// Project store extras: needed-phases publish, skipped vendors,
	// slash deadline, explicit target role.
	base := `{"title":"hF Phased","description":"hF p","budget":4000000,"lokasi":"hF","project_category":"new_build",` +
		`"deadline":"2027/01/02","needed_phases":"[\"design\",\"build\"]"}`
	rec = hFCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", base, &fx.owner, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store phased = %d %s", rec.Code, rec.Body.String())
	}
	pid := int64(hFDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	var published string
	if err := pool.QueryRow(ctx, `SELECT published_bidding_roles::text FROM projects WHERE id = $1`, pid).Scan(&published); err != nil || published != `["arsitek", "kontraktor"]` {
		t.Fatalf("published = %q, %v", published, err)
	}

	vendor := `{"title":"hF Vend","description":"hF v","budget":100000,"lokasi":"hF","project_category":"renovation",` +
		`"deadline":"2027-02-02","external_vendors":"{\"kontraktor\":{\"contact_person\":\"hF\",\"phone_number\":\"\"}}"}`
	rec = hFCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", vendor, &fx.owner, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store vendor = %d %s", rec.Code, rec.Body.String())
	}
	vendorID := int64(hFDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	var vendorCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_external_vendors WHERE project_id = $1`, vendorID).Scan(&vendorCount); err != nil || vendorCount != 0 {
		t.Fatalf("vendors = %d, %v", vendorCount, err)
	}

	role := `{"title":"hF Role","description":"hF r","budget":100000,"lokasi":"hF","project_category":"new_build",` +
		`"deadline":"2027-03-03","target_role":"kontraktor"}`
	rec = hFCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", role, &fx.owner, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store role = %d %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["data"].(map[string]any)["target_role"]; got != "kontraktor" {
		t.Fatalf("target_role = %v", got)
	}

	// Admin list edges: role/status filters, paging and the verified-history leg.
	for _, path := range []string{"/api/admin/users?role=user", "/api/admin/users?status=suspended", "/api/admin/users?page=2"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		AdminUsersHandler(pool)(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s = %d %s", path, rec.Code, rec.Body.String())
		}
	}
	if _, err := pool.Exec(ctx, `UPDATE arsiteks SET verification_status = 'verified' WHERE id = $1`, hFArsitekProfileID); err != nil {
		t.Fatalf("verify arsitek: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/admin/professionals/history", nil)
	rec = httptest.NewRecorder()
	AdminProfessionalsHistoryHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("history = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "hF Arsitek") {
		t.Fatalf("history missing hF Arsitek: %s", rec.Body.String()[:400])
	}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/professionals/history?page=abc", nil)
	rec = httptest.NewRecorder()
	AdminProfessionalsHistoryHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("history bad page = %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/professionals", nil)
	rec = httptest.NewRecorder()
	AdminProfessionalsIndexHandler(pool)(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "arsiteks") {
		t.Fatalf("professionals = %d %s", rec.Code, rec.Body.String()[:200])
	}
	req = httptest.NewRequest(http.MethodGet, "/api/admin/projects?page=2", nil)
	rec = httptest.NewRecorder()
	AdminProjectsHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin projects p2 = %d %s", rec.Code, rec.Body.String())
	}
}
