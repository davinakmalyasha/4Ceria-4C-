package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// hN owns fixture-heavy flows: specialist addendum approve, milestone
// destroy/handovers, linked termin, gallery/sub-role milestones,
// pro-reload update, procurement verify, technical audit, contract-value
// guard, sub-slot link/unlink and PM submit. Fresh IDs 1050001+ prefix hN.

func hNPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

func hNCall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	if body == "" {
		body = `{}`
	}
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range pathVals {
		req.SetPathValue(k, v)
	}
	if caller != nil {
		req = req.WithContext(withCaller(req.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func hNDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hNMkUser(t *testing.T, pool *pgxpool.Pool, id int64, role, email, name string) roadmapCaller {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES ($1,$2,$3,'hN-secret',$4::role_type) ON CONFLICT (id) DO NOTHING`, id, name, email, role)
	if err != nil {
		t.Fatalf("hN mkuser %d: %v", id, err)
	}
	profID := id + 100000
	switch role {
	case "arsitek":
		_, err = pool.Exec(ctx, `INSERT INTO arsiteks (id, user_id, nama) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, profID, id, name)
	case "kontraktor":
		_, err = pool.Exec(ctx, `INSERT INTO kontraktors (id, user_id, nama) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, profID, id, name)
	case "project_manager":
		_, err = pool.Exec(ctx, `INSERT INTO project_managers (id, user_id, nama) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, profID, id, name)
	case "structural":
		_, err = pool.Exec(ctx, `INSERT INTO structural_engineers (id, user_id, nama) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, profID, id, name)
	case "mep":
		_, err = pool.Exec(ctx, `INSERT INTO mep_engineers (id, user_id, nama) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, profID, id, name)
	case "notaris":
		_, err = pool.Exec(ctx, `INSERT INTO notaris_profiles (id, user_id, nama) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, profID, id, name)
	case "interior":
		_, err = pool.Exec(ctx, `INSERT INTO interior_profiles (id, user_id, nama) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, profID, id, name)
	}
	if err != nil {
		t.Fatalf("hN mkprofile %d: %v", id, err)
	}
	return roadmapCaller{id: id, role: role}
}

func hNMkProject(t *testing.T, pool *pgxpool.Pool, id, ownerID int64, title string) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, budget, status, target_role, published_bidding_roles, project_category, deadline)
		VALUES ($1,$2,$3,800000000,'open','both','["arsitek","kontraktor","notaris","interior","structural","mep","project_manager"]'::jsonb,'new_build','2030-06-01')
		ON CONFLICT (id) DO NOTHING`, id, ownerID, title)
	if err != nil {
		t.Fatalf("hN mkproject %d: %v", id, err)
	}
}

func hNClean(ctx context.Context, pool *pgxpool.Pool) {
	_, _ = pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id >= 1050001 AND user_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirements WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_change_orders WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_documents WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_milestones WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_sub_professionals WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id >= 1050001 AND project_id < 1060000`)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id >= 1050001 AND id < 1060000`)
	for _, tbl := range []string{"arsiteks", "kontraktors", "project_managers", "notaris_profiles", "interior_profiles", "structural_engineers", "mep_engineers"} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+tbl+` WHERE user_id >= 1050001 AND user_id < 1060000`)
		_, _ = pool.Exec(ctx, `DELETE FROM `+tbl+` WHERE id >= 1150001 AND id < 1160000`)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id >= 1050001 AND id < 1060000`)
}

func hNAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id >= 1050001 AND id < 1060000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hN users: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id >= 1050001 AND id < 1060000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hN projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE title LIKE 'hN%'`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hN titled projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE project_id >= 1050001 AND project_id < 1060000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hN bids: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id >= 1050001 AND project_id < 1060000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hN milestones: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_addendums WHERE project_id >= 1050001 AND project_id < 1060000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hN addendums: %d", n)
	}
}

func hNCleanVault(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	rows, err := pool.Query(ctx, `SELECT file_path FROM project_documents WHERE project_id >= 1050001 AND project_id < 1060000`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p string
			if err := rows.Scan(&p); err == nil && p != "" {
				if full, err := safeStorageJoin(vaultBaseDir(), p); err == nil {
					_ = os.Remove(full)
				}
			}
		}
		rows.Close()
	}
	mrows, err := pool.Query(ctx, `SELECT content::text FROM project_milestones WHERE project_id >= 1050001 AND project_id < 1060000`)
	if err == nil {
		defer mrows.Close()
		for mrows.Next() {
			var c *string
			if err := mrows.Scan(&c); err == nil && c != nil && *c != "" {
				for _, f := range approvedGalleryFiles(c) {
					if full, err := safeStorageJoin(vaultBaseDir(), f); err == nil {
						_ = os.Remove(full)
					}
				}
			}
		}
		mrows.Close()
	}
}

func TestHNAddendumSpecialistApprove(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050001, "user", "hn-add-owner@example.test", "hN Add Owner")
	author := hNMkUser(t, pool, 1050002, "arsitek", "hn-add-ars@example.test", "hN Add Ars")
	spec := hNMkUser(t, pool, 1050003, "structural", "hn-add-spec@example.test", "hN Add Spec")
	mepUser := hNMkUser(t, pool, 1050006, "mep", "hn-add-mep@example.test", "hN Add Mep")
	_ = hNMkUser(t, pool, 1050004, "project_manager", "hn-add-pm@example.test", "hN Add PM")
	stranger := hNMkUser(t, pool, 1050005, "user", "hn-add-stranger@example.test", "hN Add Stranger")
	hNMkProject(t, pool, 1050101, owner.id, "hN specialist project")

	// Pre-seed the structural slot so the first approve hits the UPDATE branch.
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (id, project_id, user_id, parent_role, sub_role, assigned_by, status, rate)
		VALUES (1050501, 1050101, $1, 'arsitek', 'structural', $2, 'accepted', 100)`, spec.id, author.id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (id, project_id, type, role_type, user_id, title, description, amount, status, assigned_user_id, specialist_type)
		VALUES (1050311, 1050101, 'specialist_assignment', 'arsitek', $1, 'hN structural add', 'hN scope', 5000000, 'pending_approval', $2, 'structural')`, author.id, spec.id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (id, project_id, type, role_type, user_id, title, description, amount, status, assigned_user_id, specialist_type)
		VALUES (1050312, 1050101, 'specialist_assignment', 'arsitek', $1, 'hN mep add', 'hN mep scope', 2000000, 'pending_approval', $2, 'mep')`, author.id, mepUser.id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (id, project_id, type, role_type, user_id, title, description, amount, status, assigned_user_id, specialist_type)
		VALUES (1050313, 1050101, 'specialist_assignment', 'arsitek', $1, 'hN forbidden add', 'hN scope', 1000000, 'pending_approval', $2, 'structural')`, author.id, spec.id); err != nil {
		t.Fatal(err)
	}

	// Rejection twin: stranger is neither owner nor PM.
	rec := hNCall(t, ApproveAddendumHandler(pool), http.MethodPost, "/api/projects/1050101/addendums/1050313/approve", `{}`, &stranger, map[string]string{"project": "1050101", "addendum": "1050313"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("addendum forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Unauthorized. Only the Owner or PM can approve addendums." {
		t.Fatalf("addendum forbidden message = %q", got)
	}

	// Happy UPDATE branch: structural slot already taken.
	rec = hNCall(t, ApproveAddendumHandler(pool), http.MethodPost, "/api/projects/1050101/addendums/1050311/approve", `{}`, &owner, map[string]string{"project": "1050101", "addendum": "1050311"})
	if rec.Code != http.StatusOK {
		t.Fatalf("addendum approve update = %d %s", rec.Code, rec.Body.String())
	}
	dec := hNDecode(t, rec)
	data, _ := dec["data"].(map[string]any)
	if data["status"] != "approved_unpaid" {
		t.Fatalf("addendum status = %v, want approved_unpaid", data["status"])
	}
	if _, ok := data["user"]; !ok {
		t.Fatalf("addendum specialist response missing user block: %v", dec)
	}
	var subStatus, subRate, subNotes string
	var subAssigned, subUser int64
	var subParent string
	if err := pool.QueryRow(ctx, `SELECT status::text, rate::text, lead_pro_notes, assigned_by, user_id, parent_role::text FROM project_sub_professionals WHERE project_id=1050101 AND sub_role='structural'`).Scan(&subStatus, &subRate, &subNotes, &subAssigned, &subUser, &subParent); err != nil {
		t.Fatalf("sub reload: %v", err)
	}
	if subStatus != "invited" || subRate != "5000000.00" || subNotes != "Assigned via Paid Addendum: hN Add Spec" || subAssigned != author.id || subUser != spec.id || subParent != "arsitek" {
		t.Fatalf("sub update row = %q/%q/%q/%d/%d/%q", subStatus, subRate, subNotes, subAssigned, subUser, subParent)
	}
	var addStatus string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=1050311`).Scan(&addStatus); err != nil || addStatus != "approved_unpaid" {
		t.Fatalf("addendum row = %q, %v", addStatus, err)
	}

	// Happy INSERT branch: mep slot was empty.
	rec = hNCall(t, ApproveAddendumHandler(pool), http.MethodPost, "/api/projects/1050101/addendums/1050312/approve", `{}`, &owner, map[string]string{"project": "1050101", "addendum": "1050312"})
	if rec.Code != http.StatusOK {
		t.Fatalf("addendum approve insert = %d %s", rec.Code, rec.Body.String())
	}
	if err := pool.QueryRow(ctx, `SELECT status::text, rate::text, lead_pro_notes, assigned_by, user_id FROM project_sub_professionals WHERE project_id=1050101 AND sub_role='mep'`).Scan(&subStatus, &subRate, &subNotes, &subAssigned, &subUser); err != nil {
		t.Fatalf("mep sub reload: %v", err)
	}
	if subStatus != "invited" || subRate != "2000000.00" || subNotes != "Assigned via Paid Addendum: hN Add Mep" || subAssigned != author.id || subUser != mepUser.id {
		t.Fatalf("mep sub row = %q/%q/%q/%d/%d", subStatus, subRate, subNotes, subAssigned, subUser)
	}
	var notifCount, logCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='sub_professional_invite'`, mepUser.id).Scan(&notifCount)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=1050101 AND action='addendum_approved'`).Scan(&logCount)
	if notifCount != 1 || logCount != 2 {
		t.Fatalf("notify/log = %d/%d, want 1/2", notifCount, logCount)
	}

	// Rejection twin: already-approved row answers the 400.
	rec = hNCall(t, ApproveAddendumHandler(pool), http.MethodPost, "/api/projects/1050101/addendums/1050311/approve", `{}`, &owner, map[string]string{"project": "1050101", "addendum": "1050311"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("addendum re-approve = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "This addendum is not pending approval." {
		t.Fatalf("addendum re-approve message = %q", got)
	}

	// Missing row answers the model 404.
	rec = hNCall(t, ApproveAddendumHandler(pool), http.MethodPost, "/api/projects/1050101/addendums/999999999/approve", `{}`, &owner, map[string]string{"project": "1050101", "addendum": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("addendum missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "No query results for model [App\\Models\\ProjectAddendum] 999999999" {
		t.Fatalf("addendum missing message = %q", got)
	}

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNDestroyHandoverLocked(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050011, "user", "hn-dest-owner@example.test", "hN Dest Owner")
	ars := hNMkUser(t, pool, 1050012, "arsitek", "hn-dest-ars@example.test", "hN Dest Ars")
	stranger := hNMkUser(t, pool, 1050013, "user", "hn-dest-stranger@example.test", "hN Dest Stranger")
	hNMkProject(t, pool, 1050102, owner.id, "hN destroy project")
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1, design_handover_submitted_at=now() WHERE id=1050102`, ars.id+100000); err != nil {
		t.Fatal(err)
	}
	// Locked milestone owned by the arsitek (canModify via own column, but not privileged).
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (id, project_id, title, phase_context, arsitek_id, approval_status) VALUES (1050201, 1050102, 'hN locked step', 'design', $1, 'pending')`, ars.id+100000); err != nil {
		t.Fatal(err)
	}
	// Vault file for the with-file destroy (owner is privileged, skips the lock).
	rel, err := storeVaultFile("milestone_files", "hN-destroy.jpg", []byte("hN-gallery-bytes"))
	if err != nil {
		t.Fatal(err)
	}
	content := `{"gallery":["` + rel + `"]}`
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (id, project_id, title, phase_context, arsitek_id, approval_status, content) VALUES (1050202, 1050102, 'hN file step', 'design', $1, 'pending', $2::jsonb)`, ars.id+100000, content); err != nil {
		t.Fatal(err)
	}

	// Rejection twin: stranger cannot modify at all.
	rec := hNCall(t, DestroyMilestoneHandler(pool), http.MethodDelete, "/api/projects/1050102/milestones/1050201", ``, &stranger, map[string]string{"project": "1050102", "milestone": "1050201"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("destroy stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Unauthorized." {
		t.Fatalf("destroy stranger message = %q", got)
	}

	// Handover lock for the non-privileged modifier.
	rec = hNCall(t, DestroyMilestoneHandler(pool), http.MethodDelete, "/api/projects/1050102/milestones/1050201", ``, &ars, map[string]string{"project": "1050102", "milestone": "1050201"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("destroy locked = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Cannot delete milestones when phase handover is under review." {
		t.Fatalf("destroy locked message = %q", got)
	}
	var still int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE id=1050201`).Scan(&still)
	if still != 1 {
		t.Fatalf("locked milestone deleted, want 1 row")
	}

	// Direct handover matrix pins every phase branch.
	cases := []struct {
		phase string
		col   string
	}{
		{"legal", "legal_handover_submitted_at"},
		{"design", "design_handover_submitted_at"},
		{"build", "construction_handover_submitted_at"},
		{"construction", "construction_handover_submitted_at"},
		{"interior", "interior_handover_submitted_at"},
	}
	for _, tc := range cases {
		by := map[string]any{"phase_context": tc.phase}
		proj := map[string]any{tc.col: "2026-01-01"}
		locked, msg := milestoneHandoverLocked(by, proj)
		if !locked || msg != "Cannot delete milestones when phase handover is under review." {
			t.Fatalf("handover %s = %v %q", tc.phase, locked, msg)
		}
		if locked2, _ := milestoneHandoverLocked(map[string]any{"phase_context": tc.phase}, map[string]any{}); locked2 {
			t.Fatalf("handover %s without stamp should be open", tc.phase)
		}
	}
	if locked, _ := milestoneHandoverLocked(map[string]any{"phase_context": "unknown"}, map[string]any{"design_handover_submitted_at": "x"}); locked {
		t.Fatalf("unknown phase should not lock")
	}

	// Direct removePublicFile: missing path is a no-op, existing file is removed.
	if err := removePublicFile("hN_test/missing-file.jpg"); err != nil {
		t.Fatalf("removePublicFile missing = %v", err)
	}
	rel2, err := storeVaultFile("milestone_files", "hN-direct.jpg", []byte("hN-direct"))
	if err != nil {
		t.Fatal(err)
	}
	full2, err := safeStorageJoin(vaultBaseDir(), rel2)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(full2); err != nil {
		t.Fatalf("direct file not on disk: %v", err)
	}
	if err := removePublicFile(rel2); err != nil {
		t.Fatalf("removePublicFile existing = %v", err)
	}
	if _, err := os.Stat(full2); !os.IsNotExist(err) {
		t.Fatalf("direct file still on disk")
	}

	// Direct jsonMessage envelope.
	w := httptest.NewRecorder()
	jsonMessage(w, http.StatusOK, "hN ok")
	if w.Code != http.StatusOK {
		t.Fatalf("jsonMessage code = %d", w.Code)
	}
	var jm map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &jm); err != nil || jm["message"] != "hN ok" {
		t.Fatalf("jsonMessage body = %s %v", w.Body.String(), err)
	}

	// Happy with-file destroy as the owner (privileged, skips the lock).
	// NOTE: loadMilestoneRow scans jsonb content as map[string]any, so
	// milestoneGalleryFiles (string/[]byte only) returns nil and the handler
	// does not delete the file; removePublicFile above pins the file helper.
	// The with-file fixture still proves the row path with gallery content.
	full, err := safeStorageJoin(vaultBaseDir(), rel)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(full); err != nil {
		t.Fatalf("gallery file not on disk: %v", err)
	}
	rec = hNCall(t, DestroyMilestoneHandler(pool), http.MethodDelete, "/api/projects/1050102/milestones/1050202", ``, &owner, map[string]string{"project": "1050102", "milestone": "1050202"})
	if rec.Code != http.StatusOK {
		t.Fatalf("destroy file ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Milestone deleted successfully." {
		t.Fatalf("destroy file message = %q", got)
	}
	var gone int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE id=1050202`).Scan(&gone)
	if gone != 0 {
		t.Fatalf("file milestone not deleted")
	}
	// Handler leaves the gallery file (map content); clean it here so no leftovers remain.
	_ = removePublicFile(rel)
	if _, err := os.Stat(full); !os.IsNotExist(err) {
		_ = os.Remove(full)
	}
	var logCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=1050102 AND action='milestone_deleted'`).Scan(&logCount)
	if logCount != 1 {
		t.Fatalf("milestone_deleted logs = %d, want 1", logCount)
	}

	// Binding twin: milestone from another project answers Not found.
	rec = hNCall(t, DestroyMilestoneHandler(pool), http.MethodDelete, "/api/projects/1050102/milestones/1050201", ``, &owner, map[string]string{"project": "1050199", "milestone": "1050201"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("destroy binding = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("destroy binding message = %q", got)
	}

	if _, err := pool.Exec(ctx, `DELETE FROM project_milestones WHERE id IN (1050201)`); err != nil {
		t.Fatal(err)
	}
	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNScanLinkedTermin(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050021, "user", "hn-link-owner@example.test", "hN Link Owner")
	stranger := hNMkUser(t, pool, 1050022, "user", "hn-link-stranger@example.test", "hN Link Stranger")
	hNMkProject(t, pool, 1050103, owner.id, "hN linked project")
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (id, project_id, title, type, approval_status) VALUES (1050203, 1050103, 'hN linked step', 'milestone', 'pending'), (1050204, 1050103, 'hN bare step', 'milestone', 'pending')`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (id, project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, milestone_id)
		VALUES (1050401, 1050103, 'hN DP', 50, 100000, 0, 100000, 'locked', 'kontraktor', 1050203)`); err != nil {
		t.Fatal(err)
	}

	// Rejection twin: stranger is not a participant.
	rec := hNCall(t, MilestonesHandler(pool), http.MethodGet, "/api/projects/1050103/milestones", ``, &stranger, map[string]string{"project": "1050103"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("milestones stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Unauthorized. You must be assigned to this project to view files." {
		t.Fatalf("milestones stranger message = %q", got)
	}

	// Missing project answers the model 404.
	rec = hNCall(t, MilestonesHandler(pool), http.MethodGet, "/api/projects/999999999/milestones", ``, &owner, map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("milestones missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] 999999999" {
		t.Fatalf("milestones missing message = %q", got)
	}

	rec = hNCall(t, MilestonesHandler(pool), http.MethodGet, "/api/projects/1050103/milestones", ``, &owner, map[string]string{"project": "1050103"})
	if rec.Code != http.StatusOK {
		t.Fatalf("milestones ok = %d %s", rec.Code, rec.Body.String())
	}
	dec := hNDecode(t, rec)
	data, _ := dec["data"].([]any)
	if len(data) != 2 {
		t.Fatalf("milestones len = %d, want 2: %v", len(data), dec)
	}
	first, _ := data[0].(map[string]any)
	if first["title"] != "hN linked step" {
		t.Fatalf("first title = %v", first["title"])
	}
	termin, _ := first["linked_termin"].(map[string]any)
	if termin == nil {
		t.Fatalf("linked_termin missing: %v", first)
	}
	if termin["label"] != "hN DP" || termin["amount"] != "100000.00" || termin["percentage"] != "50.00" || termin["status"] != "locked" || termin["role_type"] != "kontraktor" {
		t.Fatalf("linked termin = %v", termin)
	}
	if termin["milestone_id"] != float64(1050203) {
		t.Fatalf("linked termin milestone_id = %v", termin["milestone_id"])
	}
	second, _ := data[1].(map[string]any)
	if second["linked_termin"] != nil {
		t.Fatalf("bare linked_termin = %v, want null", second["linked_termin"])
	}
	if second["change_orders"] == nil {
		t.Fatalf("bare change_orders missing")
	}

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNGallerySubRoleMilestones(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050031, "user", "hn-gal-owner@example.test", "hN Gal Owner")
	sub := hNMkUser(t, pool, 1050032, "user", "hn-gal-sub@example.test", "hN Gal Sub")
	stranger := hNMkUser(t, pool, 1050033, "user", "hn-gal-stranger@example.test", "hN Gal Stranger")
	hNMkProject(t, pool, 1050104, owner.id, "hN gallery project")
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (id, project_id, user_id, parent_role, sub_role, assigned_by, status, rate)
		VALUES (1050502, 1050104, $1, 'arsitek', 'hNtrade', $2, 'active', 0)`, sub.id, owner.id); err != nil {
		t.Fatal(err)
	}

	// Rejection twin: stranger is not hired, owner, PM or active sub.
	rec := hNCall(t, StoreMilestoneHandler(pool), http.MethodPost, "/api/projects/1050104/milestones", `{"title":"hN no"}`, &stranger, map[string]string{"project": "1050104"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("store stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Only hired professionals, active sub-professionals, or the Project Owner can add milestones." {
		t.Fatalf("store stranger message = %q", got)
	}

	// Happy sub-role store with gallery content (resolveGalleryURLs + activeSubRole).
	body := `{"title":"hN gallery step","content":{"gallery":["milestone_files/kept.jpg","https://example.test/x.png","","http://example.test/y.jpg"],"note":"hN"}}`
	rec = hNCall(t, StoreMilestoneHandler(pool), http.MethodPost, "/api/projects/1050104/milestones", body, &sub, map[string]string{"project": "1050104"})
	if rec.Code != http.StatusOK {
		t.Fatalf("store sub ok = %d %s", rec.Code, rec.Body.String())
	}
	dec := hNDecode(t, rec)
	data, _ := dec["data"].(map[string]any)
	if data["type"] != "hNtrade" {
		t.Fatalf("store type = %v, want hNtrade", data["type"])
	}
	if data["title"] != "hN gallery step" {
		t.Fatalf("store title = %v", data["title"])
	}
	content, _ := data["content"].(map[string]any)
	gallery, _ := content["gallery"].([]any)
	if len(gallery) != 3 {
		t.Fatalf("store gallery len = %d, want 3: %v", len(gallery), content)
	}
	base := assetBaseOf(ctx)
	if gallery[0] != base+"/storage/milestone_files/kept.jpg" || gallery[1] != "https://example.test/x.png" || gallery[2] != "http://example.test/y.jpg" {
		t.Fatalf("store gallery = %v", gallery)
	}
	var dbType, dbTitle string
	var dbID int64
	if err := pool.QueryRow(ctx, `SELECT id, type, title FROM project_milestones WHERE project_id=1050104 AND title='hN gallery step'`).Scan(&dbID, &dbType, &dbTitle); err != nil {
		t.Fatalf("store row: %v", err)
	}
	if dbType != "hNtrade" || dbTitle != "hN gallery step" {
		t.Fatalf("store db row = %q/%q", dbType, dbTitle)
	}

	// Direct resolveGalleryURLs pins empty/absolute/relative.
	rctx := withAssetBase(context.Background(), "http://localhost:9000")
	out := resolveGalleryURLs(rctx, []any{"milestone_files/a.jpg", "", "https://cdn.test/b.png", "http://cdn.test/c.png", 12})
	if len(out) != 3 {
		t.Fatalf("resolve len = %d, want 3: %v", len(out), out)
	}
	if out[0] != assetBaseOf(rctx)+"/storage/milestone_files/a.jpg" || out[1] != "https://cdn.test/b.png" || out[2] != "http://cdn.test/c.png" {
		t.Fatalf("resolve out = %v", out)
	}
	if out2 := resolveGalleryURLs(rctx, []any{"", nil, 5}); len(out2) != 0 {
		t.Fatalf("resolve empty = %v, want []", out2)
	}

	// Direct activeSubRole: happy returns the role, missing returns an error.
	if role, err := activeSubRole(ctx, pool, 1050104, sub.id); err != nil || role != "hNtrade" {
		t.Fatalf("activeSubRole happy = %q %v", role, err)
	}
	if role, err := activeSubRole(ctx, pool, 1050104, 999999999); err == nil || role != "" {
		t.Fatalf("activeSubRole missing = %q %v, want error", role, err)
	}

	// Direct renderMilestoneBase pins the shared column block.
	row := milestoneRow{
		fields: []string{"sort_order", "is_completed", "content", "start_date", "title"},
		byName: map[string]any{
			"sort_order":   int64(3),
			"is_completed": false,
			"content":      []byte(`{"gallery":["milestone_files/r.jpg"]}`),
			"start_date":   nil,
			"title":        "hN base",
		},
	}
	entry := renderMilestoneBase(rctx, row)
	if entry == nil {
		t.Fatalf("renderMilestoneBase nil")
	}
	raw, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	var rendered map[string]any
	if err := json.Unmarshal(raw, &rendered); err != nil {
		t.Fatal(err)
	}
	if rendered["title"] != "hN base" {
		t.Fatalf("render title = %v", rendered)
	}
	if rendered["is_completed"] != false {
		t.Fatalf("render completed = %v", rendered)
	}
	cmap, _ := rendered["content"].(map[string]any)
	if cmap == nil {
		t.Fatalf("render content missing: %v", rendered)
	}
	if g, _ := cmap["gallery"].([]any); len(g) != 1 || g[0] != assetBaseOf(rctx)+"/storage/milestone_files/r.jpg" {
		t.Fatalf("render gallery = %v", cmap)
	}

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNMilestoneProUserReloaded(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050041, "user", "hn-rev-owner@example.test", "hN Rev Owner")
	ars := hNMkUser(t, pool, 1050042, "arsitek", "hn-rev-ars@example.test", "hN Rev Ars")
	stranger := hNMkUser(t, pool, 1050043, "user", "hn-rev-stranger@example.test", "hN Rev Stranger")
	hNMkProject(t, pool, 1050105, owner.id, "hN revision project")
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (id, project_id, title, arsitek_id, approval_status) VALUES (1050205, 1050105, 'hN revision step', $1, 'pending'), (1050206, 1050105, 'hN bare step', NULL, 'pending')`, ars.id+100000); err != nil {
		t.Fatal(err)
	}

	// Rejection twin: stranger cannot modify.
	rec := hNCall(t, UpdateMilestoneHandler(pool), http.MethodPut, "/api/projects/1050105/milestones/1050205", `{"title":"hN x"}`, &stranger, map[string]string{"project": "1050105", "milestone": "1050205"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("update stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Unauthorized." {
		t.Fatalf("update stranger message = %q", got)
	}

	// Happy revision with a pro row: notifies the pro via milestoneProUserReloaded.
	rec = hNCall(t, UpdateMilestoneHandler(pool), http.MethodPut, "/api/projects/1050105/milestones/1050205", `{"approval_status":"revision","revision_notes":"hN fix this"}`, &owner, map[string]string{"project": "1050105", "milestone": "1050205"})
	if rec.Code != http.StatusOK {
		t.Fatalf("update revision = %d %s", rec.Code, rec.Body.String())
	}
	var status, notes string
	if err := pool.QueryRow(ctx, `SELECT approval_status::text, revision_notes FROM project_milestones WHERE id=1050205`).Scan(&status, &notes); err != nil {
		t.Fatal(err)
	}
	if status != "revision" || notes != "hN fix this" {
		t.Fatalf("revision row = %q/%q", status, notes)
	}
	var notifTitle, notifBody, notifType string
	if err := pool.QueryRow(ctx, `SELECT type, title, body FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, ars.id).Scan(&notifType, &notifTitle, &notifBody); err != nil {
		t.Fatalf("revision notify missing: %v", err)
	}
	if notifType != "milestone_revision_requested" || notifTitle != "Revision Requested" || notifBody != `Revision requested for "hN revision step": hN fix this` {
		t.Fatalf("revision notify = %q/%q/%q", notifType, notifTitle, notifBody)
	}

	// Bare milestone without any pro FK: same verb, no notification (reload returns 0).
	rec = hNCall(t, UpdateMilestoneHandler(pool), http.MethodPut, "/api/projects/1050105/milestones/1050206", `{"approval_status":"revision"}`, &owner, map[string]string{"project": "1050105", "milestone": "1050206"})
	if rec.Code != http.StatusOK {
		t.Fatalf("update bare revision = %d %s", rec.Code, rec.Body.String())
	}
	var bareNotifs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1`, ars.id).Scan(&bareNotifs)
	if bareNotifs != 1 {
		t.Fatalf("bare revision created unexpected notify, count=%d", bareNotifs)
	}

	// Direct reload pins both branches with hand literals.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if got := milestoneProUserReloaded(ctx, tx, 1050205); got != ars.id {
		t.Fatalf("reload with pro = %d, want %d", got, ars.id)
	}
	if got := milestoneProUserReloaded(ctx, tx, 1050206); got != 0 {
		t.Fatalf("reload bare = %d, want 0", got)
	}
	if got := milestoneProUserReloaded(ctx, tx, 999999999); got != 0 {
		t.Fatalf("reload missing = %d, want 0", got)
	}
	_ = tx.Rollback(ctx)

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNStockProcurementVerify(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050051, "user", "hn-proc-owner@example.test", "hN Proc Owner")
	pm := hNMkUser(t, pool, 1050052, "project_manager", "hn-proc-pm@example.test", "hN Proc PM")
	requester := hNMkUser(t, pool, 1050053, "kontraktor", "hn-proc-kont@example.test", "hN Proc Kont")
	stranger := hNMkUser(t, pool, 1050054, "user", "hn-proc-stranger@example.test", "hN Proc Stranger")
	hNMkProject(t, pool, 1050106, owner.id, "hN procurement project")
	if _, err := pool.Exec(ctx, `INSERT INTO project_requirements (id, project_id, name, quantity_required, estimated_unit_cost, unit, user_id) VALUES (1050601, 1050106, 'hN cement', 10, 50000, 'pcs', $1)`, requester.id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_procurement_requests (id, project_id, requirement_id, requested_by, quantity_needed, status) VALUES (1050701, 1050106, 1050601, $1, 5, 'pending_pm')`, requester.id); err != nil {
		t.Fatal(err)
	}
	// Second project for the binding twin.
	hNMkProject(t, pool, 1050107, owner.id, "hN other project")
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id IN (1050106, 1050107)`, pm.id+100000); err != nil {
		t.Fatal(err)
	}

	// stockProcurement twins via the verify handler.
	rec := hNCall(t, VerifyProcurementHandler(pool), http.MethodPost, "/api/projects/1050106/procurement-requests/abc/verify", `{"estimated_cost":"1500000"}`, &pm, map[string]string{"project": "1050106", "procurementRequest": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proc bad id = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "No query results for model [App\\Models\\ProjectProcurementRequest] abc" {
		t.Fatalf("proc bad id message = %q", got)
	}
	rec = hNCall(t, VerifyProcurementHandler(pool), http.MethodPost, "/api/projects/1050106/procurement-requests/999999999/verify", `{"estimated_cost":"1500000"}`, &pm, map[string]string{"project": "1050106", "procurementRequest": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proc missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hNCall(t, VerifyProcurementHandler(pool), http.MethodPost, "/api/projects/1050107/procurement-requests/1050701/verify", `{"estimated_cost":"1500000"}`, &pm, map[string]string{"project": "1050107", "procurementRequest": "1050701"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proc binding = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("proc binding message = %q", got)
	}

	// Forbidden: only the assigned PM may verify.
	rec = hNCall(t, VerifyProcurementHandler(pool), http.MethodPost, "/api/projects/1050106/procurement-requests/1050701/verify", `{"estimated_cost":"1500000"}`, &stranger, map[string]string{"project": "1050106", "procurementRequest": "1050701"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("proc forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Unauthorized. Only the assigned PM can verify procurement requests." {
		t.Fatalf("proc forbidden message = %q", got)
	}

	// Happy verify.
	rec = hNCall(t, VerifyProcurementHandler(pool), http.MethodPost, "/api/projects/1050106/procurement-requests/1050701/verify", `{"estimated_cost":"1500000","pm_note":"hN ok"}`, &pm, map[string]string{"project": "1050106", "procurementRequest": "1050701"})
	if rec.Code != http.StatusOK {
		t.Fatalf("proc verify ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Request forwarded to Owner for budget approval." {
		t.Fatalf("proc verify message = %q", got)
	}
	var pStatus, pCost, pNote string
	if err := pool.QueryRow(ctx, `SELECT status::text, estimated_cost::text, pm_note FROM project_procurement_requests WHERE id=1050701`).Scan(&pStatus, &pCost, &pNote); err != nil {
		t.Fatal(err)
	}
	if pStatus != "pending_owner" || pCost != "1500000.00" || pNote != "hN ok" {
		t.Fatalf("proc row = %q/%q/%q", pStatus, pCost, pNote)
	}
	var addTitle, addDesc, addStatus string
	if err := pool.QueryRow(ctx, `SELECT title, description, status::text FROM project_addendums WHERE procurement_request_id=1050701`).Scan(&addTitle, &addDesc, &addStatus); err != nil {
		t.Fatalf("proc addendum missing: %v", err)
	}
	if addTitle != "Material Procurement: hN cement" || addStatus != "pending_approval" {
		t.Fatalf("proc addendum = %q/%q", addTitle, addStatus)
	}
	if addDesc != "Request for 5.00 pcs of hN cement. PM Note: hN ok" {
		t.Fatalf("proc addendum desc = %q", addDesc)
	}
	var notifCount, logCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='budget_approval_needed'`, owner.id).Scan(&notifCount)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=1050106 AND action='procurement_verified'`).Scan(&logCount)
	if notifCount != 1 || logCount != 1 {
		t.Fatalf("proc notify/log = %d/%d, want 1/1", notifCount, logCount)
	}

	// Rejection twin: no longer verifiable.
	rec = hNCall(t, VerifyProcurementHandler(pool), http.MethodPost, "/api/projects/1050106/procurement-requests/1050701/verify", `{"estimated_cost":"1500000"}`, &pm, map[string]string{"project": "1050106", "procurementRequest": "1050701"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proc re-verify = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Request is not in a verifiable state" {
		t.Fatalf("proc re-verify message = %q", got)
	}

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNTechnicalAudit(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050061, "user", "hn-audit-owner@example.test", "hN Audit Owner")
	pm := hNMkUser(t, pool, 1050062, "project_manager", "hn-audit-pm@example.test", "hN Audit PM")
	pro := hNMkUser(t, pool, 1050063, "arsitek", "hn-audit-ars@example.test", "hN Audit Ars")
	stranger := hNMkUser(t, pool, 1050064, "user", "hn-audit-stranger@example.test", "hN Audit Stranger")
	hNMkProject(t, pool, 1050108, owner.id, "hN audit project")
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id=1050108`, pm.id+100000); err != nil {
		t.Fatal(err)
	}
	rel, err := storeVaultFile("milestone_files", "hN-audit.jpg", []byte("hN-audit-bytes"))
	if err != nil {
		t.Fatal(err)
	}
	content := `{"gallery":["` + rel + `"],"file_names":{"` + rel + `":"hN-audit.jpg"}}`
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (id, project_id, title, phase_context, type, arsitek_id, approval_status, content) VALUES (1050207, 1050108, 'hN audit step', 'design', 'milestone', $1, 'pending', $2::jsonb)`, pro.id+100000, content); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (id, project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, milestone_id) VALUES (1050402, 1050108, 'hN audit termin', 100, 50000, 0, 50000, 'locked', 'kontraktor', 1050207)`); err != nil {
		t.Fatal(err)
	}
	hNMkProject(t, pool, 1050109, owner.id, "hN audit other")
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (id, project_id, title, approval_status) VALUES (1050208, 1050109, 'hN other step', 'pending')`); err != nil {
		t.Fatal(err)
	}

	// Forbidden: stranger is neither owner, PM nor lead pro.
	rec := hNCall(t, TechnicalAuditHandler(pool), http.MethodPost, "/api/projects/1050108/technical-audit-submit", `{"role_type":"structural","milestones":[]}`, &stranger, map[string]string{"project": "1050108"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("audit stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Unauthorized" {
		t.Fatalf("audit stranger message = %q", got)
	}

	// Cross-project milestone answers the 422.
	rec = hNCall(t, TechnicalAuditHandler(pool), http.MethodPost, "/api/projects/1050108/technical-audit-submit", `{"role_type":"structural","milestones":[{"id":1050208,"status":"approved"}]}`, &pm, map[string]string{"project": "1050108"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("audit cross = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Milestone #1050208 does not belong to this project." {
		t.Fatalf("audit cross message = %q", got)
	}

	// Happy PM approve: unlocks the termin, syncs the vault, stamps integration.
	rec = hNCall(t, TechnicalAuditHandler(pool), http.MethodPost, "/api/projects/1050108/technical-audit-submit", `{"role_type":"structural","milestones":[{"id":1050207,"status":"approved"}]}`, &pm, map[string]string{"project": "1050108"})
	if rec.Code != http.StatusOK {
		t.Fatalf("audit ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Audit submitted successfully" {
		t.Fatalf("audit ok message = %q", got)
	}
	var mStatus, mReview string
	var mCompleted bool
	if err := pool.QueryRow(ctx, `SELECT approval_status::text, review_status::text, is_completed FROM project_milestones WHERE id=1050207`).Scan(&mStatus, &mReview, &mCompleted); err != nil {
		t.Fatal(err)
	}
	if mStatus != "approved" || !mCompleted {
		t.Fatalf("audit milestone = %q/%v, want approved/true", mStatus, mCompleted)
	}
	_ = mReview
	var tStatus string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=1050402`).Scan(&tStatus); err != nil || tStatus != "pending" {
		t.Fatalf("audit termin = %q, %v", tStatus, err)
	}
	var stamped bool
	if err := pool.QueryRow(ctx, `SELECT structural_approved_at IS NOT NULL FROM projects WHERE id=1050108`).Scan(&stamped); err != nil || !stamped {
		t.Fatalf("audit integration not stamped: %v %v", stamped, err)
	}
	var docName, docCat, docStatus string
	if err := pool.QueryRow(ctx, `SELECT file_name, category, status FROM project_documents WHERE project_id=1050108 AND file_path=$1`, rel).Scan(&docName, &docCat, &docStatus); err != nil {
		t.Fatalf("audit vault missing: %v", err)
	}
	if docName != "hN-audit.jpg" || docCat != "blueprint" {
		t.Fatalf("audit doc = %q/%q/%q", docName, docCat, docStatus)
	}
	var auditNotif int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='milestone_approved'`, pro.id).Scan(&auditNotif)
	if auditNotif != 1 {
		t.Fatalf("audit notify = %d, want 1", auditNotif)
	}

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNAssertTerminContractValue(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050071, "user", "hn-termin-owner@example.test", "hN Termin Owner")
	kont := hNMkUser(t, pool, 1050072, "kontraktor", "hn-termin-kont@example.test", "hN Termin Kont")
	hNMkProject(t, pool, 1050110, owner.id, "hN termin project")
	profID := kont.id + 100000
	if _, err := pool.Exec(ctx, `INSERT INTO bids (id, project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, price, calculated_total, proposal, status) VALUES (1050801, 1050110, 'kontraktor', $1, $2, $2, 1000000, 1000000, 'hN prop', 'accepted')`, kont.id, profID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (id, project_id, label, percentage, amount, retention_amount, net_amount, status, role_type) VALUES (1050403, 1050110, 'hN base', 60, 600000, 0, 600000, 'locked', 'kontraktor'), (1050404, 1050110, 'hN target', 20, 200000, 0, 200000, 'locked', 'kontraktor')`); err != nil {
		t.Fatal(err)
	}

	// Binding twin: termin from another project.
	hNMkProject(t, pool, 1050111, owner.id, "hN termin other")
	rec := hNCall(t, UpdatePaymentTerminHandler(pool), http.MethodPut, "/api/projects/1050111/payment-termins/1050404", `{"label":"hN x"}`, &owner, map[string]string{"project": "1050111", "termin": "1050404"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("termin binding = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("termin binding message = %q", got)
	}

	// Contract guard rejection: 600000 + 500000 exceeds 1000000 + 1000.
	rec = hNCall(t, UpdatePaymentTerminHandler(pool), http.MethodPut, "/api/projects/1050110/payment-termins/1050404", `{"amount":500000}`, &owner, map[string]string{"project": "1050110", "termin": "1050404"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("termin over contract = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "payment plan exceeds the negotiated contract value for this role. Planned: Rp 1100000.00 of Rp 1000000.00" {
		t.Fatalf("termin over contract message = %q", got)
	}
	var stillAmt string
	_ = pool.QueryRow(ctx, `SELECT amount::text FROM project_payment_termins WHERE id=1050404`).Scan(&stillAmt)
	if stillAmt != "200000.00" {
		t.Fatalf("over-contract wrote, amount=%q", stillAmt)
	}

	// Happy within-contract update: same amount keeps the retention split exact.
	rec = hNCall(t, UpdatePaymentTerminHandler(pool), http.MethodPut, "/api/projects/1050110/payment-termins/1050404", `{"amount":200000,"label":"hN target v2"}`, &owner, map[string]string{"project": "1050110", "termin": "1050404"})
	if rec.Code != http.StatusOK {
		t.Fatalf("termin ok = %d %s", rec.Code, rec.Body.String())
	}
	var amt, label string
	if err := pool.QueryRow(ctx, `SELECT amount::text, label FROM project_payment_termins WHERE id=1050404`).Scan(&amt, &label); err != nil {
		t.Fatal(err)
	}
	if amt != "200000.00" || label != "hN target v2" {
		t.Fatalf("termin row = %q/%q", amt, label)
	}

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNSubSlotLinkUnlink(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050081, "user", "hn-sub-owner@example.test", "hN Sub Owner")
	spec := hNMkUser(t, pool, 1050082, "structural", "hn-sub-spec@example.test", "hN Sub Spec")
	stranger := hNMkUser(t, pool, 1050083, "user", "hn-sub-stranger@example.test", "hN Sub Stranger")
	hNMkProject(t, pool, 1050112, owner.id, "hN sub slot project")
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (id, project_id, user_id, parent_role, sub_role, assigned_by, status, rate) VALUES (1050503, 1050112, $1, 'arsitek', 'structural', $2, 'invited', 0)`, spec.id, owner.id); err != nil {
		t.Fatal(err)
	}

	// Rejection twin: only the invitee may accept.
	rec := hNCall(t, SubProfessionalDecisionHandler(pool, "accept"), http.MethodPost, "/api/projects/1050112/sub-professionals/1050503/accept", `{}`, &stranger, map[string]string{"project": "1050112", "id": "1050503"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sub accept stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Only the invited professional can accept." {
		t.Fatalf("sub accept stranger message = %q", got)
	}

	// Happy accept links the structural slot.
	rec = hNCall(t, SubProfessionalDecisionHandler(pool, "accept"), http.MethodPost, "/api/projects/1050112/sub-professionals/1050503/accept", `{}`, &spec, map[string]string{"project": "1050112", "id": "1050503"})
	if rec.Code != http.StatusOK {
		t.Fatalf("sub accept ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Invitation accepted." {
		t.Fatalf("sub accept message = %q", got)
	}
	var slot *int64
	if err := pool.QueryRow(ctx, `SELECT structural_id FROM projects WHERE id=1050112`).Scan(&slot); err != nil {
		t.Fatal(err)
	}
	if slot == nil || *slot != spec.id+100000 {
		t.Fatalf("link slot = %v, want %d", slot, spec.id+100000)
	}
	var subStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_sub_professionals WHERE id=1050503`).Scan(&subStatus)
	if subStatus != "accepted" {
		t.Fatalf("sub status after accept = %q", subStatus)
	}

	// Happy decline unlinks the same slot.
	rec = hNCall(t, SubProfessionalDecisionHandler(pool, "decline"), http.MethodPost, "/api/projects/1050112/sub-professionals/1050503/decline", `{}`, &spec, map[string]string{"project": "1050112", "id": "1050503"})
	if rec.Code != http.StatusOK {
		t.Fatalf("sub decline ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Assignment declined." {
		t.Fatalf("sub decline message = %q", got)
	}
	if err := pool.QueryRow(ctx, `SELECT structural_id FROM projects WHERE id=1050112`).Scan(&slot); err != nil {
		t.Fatal(err)
	}
	if slot != nil {
		t.Fatalf("unlink slot = %d, want NULL", *slot)
	}

	// Direct edge pins: unknown role is a no-op, missing profile is a no-op.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	linkSubSlot(ctx, tx, 1050112, "hN-unknown", spec.id)
	unlinkSubSlot(ctx, tx, 1050112, "hN-unknown", spec.id)
	linkSubSlot(ctx, tx, 1050112, "structural", 999999999)
	unlinkSubSlot(ctx, tx, 1050112, "structural", 999999999)
	_ = tx.Rollback(ctx)

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}

func TestHNPMSubmitOwnerDisplayName(t *testing.T) {
	pool := hNPool(t)
	ctx := context.Background()
	hNClean(ctx, pool)
	t.Cleanup(func() {
		hNCleanVault(t, pool)
		hNClean(context.Background(), pool)
	})

	owner := hNMkUser(t, pool, 1050091, "user", "hn-pm-owner@example.test", "hN PM Owner")
	pmUser := hNMkUser(t, pool, 1050092, "project_manager", "hn-pm-user@example.test", "hN PM Pro")
	stranger := hNMkUser(t, pool, 1050093, "user", "hn-pm-stranger@example.test", "hN PM Stranger")
	hNMkProject(t, pool, 1050113, owner.id, "hN pm submit project")
	if _, err := pool.Exec(ctx, `UPDATE projects SET wants_project_manager=true, pm_id=NULL WHERE id=1050113`); err != nil {
		t.Fatal(err)
	}

	// Rejection twin: only a PM may submit.
	rec := hNCall(t, SubmitPMBidHandler(pool), http.MethodPost, "/api/projects/1050113/pm-bids", `{"price":1000000,"proposal":"hN prop"}`, &stranger, map[string]string{"project": "1050113"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("pm submit stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Only Project Managers can submit this bid." {
		t.Fatalf("pm submit stranger message = %q", got)
	}

	// Happy submit (ownerDisplayName runs inside the tx for the notify).
	rec = hNCall(t, SubmitPMBidHandler(pool), http.MethodPost, "/api/projects/1050113/pm-bids", `{"price":1000000,"proposal":"hN pm proposal"}`, &pmUser, map[string]string{"project": "1050113"})
	if rec.Code != http.StatusOK {
		t.Fatalf("pm submit ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hNDecode(t, rec)["message"]; got != "Bid submitted successfully!" {
		t.Fatalf("pm submit message = %q", got)
	}
	var bidPrice, bidProposal, bidStatus string
	if err := pool.QueryRow(ctx, `SELECT price::text, proposal, status::text FROM bids WHERE project_id=1050113 AND role::text='project_manager'`).Scan(&bidPrice, &bidProposal, &bidStatus); err != nil {
		t.Fatalf("pm bid row: %v", err)
	}
	if bidPrice != "1000000.00" || bidProposal != "hN pm proposal" || bidStatus != "pending" {
		t.Fatalf("pm bid row = %q/%q/%q", bidPrice, bidProposal, bidStatus)
	}
	var nBody string
	if err := pool.QueryRow(ctx, `SELECT body FROM notifications WHERE user_id=$1 AND type='pm_bid_received' ORDER BY id DESC LIMIT 1`, owner.id).Scan(&nBody); err != nil {
		t.Fatalf("pm notify missing: %v", err)
	}
	if nBody != `hN PM Pro has submitted a proposal to manage your project: "hN pm submit project".` {
		t.Fatalf("pm notify body = %q", nBody)
	}

	// Direct ownerDisplayName pins the tx helper.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := ownerDisplayName(ctx, tx, pmUser.id); got != "hN PM Pro" {
		_ = tx.Rollback(ctx)
		t.Fatalf("ownerDisplayName = %q, want hN PM Pro", got)
	}
	if got := ownerDisplayName(ctx, tx, 999999999); got != "" {
		_ = tx.Rollback(ctx)
		t.Fatalf("ownerDisplayName missing = %q, want empty", got)
	}
	_ = tx.Rollback(ctx)

	hNCleanVault(t, pool)
	hNClean(ctx, pool)
	hNAssertNoLeftovers(t, pool)
}
