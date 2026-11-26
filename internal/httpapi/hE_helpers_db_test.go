package httpapi

// hE fixtures — this worker's throwaway world on the seeded DB.
//
// Every id lives in the 950000+ range and every label carries the hE
// prefix, so nothing here can collide with the seed or with another
// worker's rows. hESetup wipes hE rows first (a previous run may have
// died mid-test), inserts users, profiles and three projects, and
// registers a cleanup that deletes every hE row child-first — zero
// leftovers, seed rows never touched.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	hEOwnerID    int64 = 950001
	hEArsitekID  int64 = 950002
	hEKontrakID  int64 = 950003
	hEPMUserID   int64 = 950004
	hEStrangerID int64 = 950005
	hEStructID   int64 = 950006
	hEMepID      int64 = 950007
	hEInterID    int64 = 950008
	hENotarisID  int64 = 950009

	hEArsitekProfileID int64 = 951001
	hEKontrakProfileID int64 = 951002
	hEPMProfileID      int64 = 951003
	hEStructProfileID  int64 = 951004
	hEMepProfileID     int64 = 951005
	hEInterProfileID   int64 = 951006
	hENotarisProfileID int64 = 951007

	hEProjectID  int64 = 952001
	hEProject2ID int64 = 952002
	hEProject3ID int64 = 952003
)

var hEUserIDs = []int64{hEOwnerID, hEArsitekID, hEKontrakID, hEPMUserID, hEStrangerID, hEStructID, hEMepID, hEInterID, hENotarisID}
var hEProjectIDs = []int64{hEProjectID, hEProject2ID, hEProject3ID}

type hEFixture struct {
	owner      roadmapCaller
	arsitek    roadmapCaller
	kontraktor roadmapCaller
	pm         roadmapCaller
	stranger   roadmapCaller
	structural roadmapCaller
	mep        roadmapCaller
	interior   roadmapCaller
	notaris    roadmapCaller
}

func hEPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

// hECall serves a handler with a JSON body, path values and caller.
func hECall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
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

func hEDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hEProjectPath(id int64) map[string]string {
	return map[string]string{"project": int64String(id)}
}

// newHEFileRequest builds a multipart request with path values and caller.
func newHEFileRequest(t *testing.T, target string, body *strings.Reader, ctype string, pathVals map[string]string, caller *roadmapCaller) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, target, body)
	req.Header.Set("Content-Type", ctype)
	for k, v := range pathVals {
		req.SetPathValue(k, v)
	}
	if caller != nil {
		req = req.WithContext(withCaller(req.Context(), *caller))
	}
	return req
}

// serveHE runs a handler and returns the recorder.
func serveHE(h http.HandlerFunc, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

// hESetup inserts hE users, profiles and three hE projects.
func hESetup(t *testing.T, pool *pgxpool.Pool) hEFixture {
	t.Helper()
	ctx := context.Background()

	hEClean(ctx, pool)

	users := []struct {
		id    int64
		name  string
		email string
		role  string
	}{
		{hEOwnerID, "hE Owner", "he-owner@example.test", "user"},
		{hEArsitekID, "hE Arsitek", "he-arsitek@example.test", "arsitek"},
		{hEKontrakID, "hE Kontraktor", "he-kontraktor@example.test", "kontraktor"},
		{hEPMUserID, "hE PM", "he-pm@example.test", "project_manager"},
		{hEStrangerID, "hE Stranger", "he-stranger@example.test", "user"},
		{hEStructID, "hE Structural", "he-struct@example.test", "structural"},
		{hEMepID, "hE Mep", "he-mep@example.test", "mep"},
		{hEInterID, "hE Interior", "he-interior@example.test", "interior"},
		{hENotarisID, "hE Notaris", "he-notaris@example.test", "notaris"},
	}
	for _, u := range users {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES ($1, $2, $3, 'hE-secret', $4::role_type)`,
			u.id, u.name, u.email, u.role); err != nil {
			t.Fatalf("hE user %d: %v", u.id, err)
		}
	}
	profiles := []struct {
		table string
		id    int64
		user  int64
		name  string
	}{
		{"arsiteks", hEArsitekProfileID, hEArsitekID, "hE Arsitek"},
		{"kontraktors", hEKontrakProfileID, hEKontrakID, "hE Kontraktor"},
		{"project_managers", hEPMProfileID, hEPMUserID, "hE PM"},
		{"structural_engineers", hEStructProfileID, hEStructID, "hE Structural"},
		{"mep_engineers", hEMepProfileID, hEMepID, "hE Mep"},
		{"interior_profiles", hEInterProfileID, hEInterID, "hE Interior"},
		{"notaris_profiles", hENotarisProfileID, hENotarisID, "hE Notaris"},
	}
	for _, p := range profiles {
		if _, err := pool.Exec(ctx, `INSERT INTO `+p.table+` (id, user_id, nama) VALUES ($1, $2, $3)`,
			p.id, p.user, p.name); err != nil {
			t.Fatalf("hE profile %s: %v", p.table, err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, project_category,
		selected_arsitek_id, selected_kontraktor_id, selected_interior_id, pm_id, structural_id, mep_id)
		VALUES ($1, $2, 'hE Tower', 'hE build', 500000000, 'hE City', 'in_progress', '2027-06-01', 'commercial', $3, $4, $5, $6, $7, $8)`,
		hEProjectID, hEOwnerID, hEArsitekProfileID, hEKontrakProfileID, hEInterProfileID, hEPMProfileID, hEStructProfileID, hEMepProfileID); err != nil {
		t.Fatalf("hE project: %v", err)
	}
	// No deadline: the extension owner-approve base-today branch.
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_kontraktor_id)
		VALUES ($1, $2, 'hE Annex', 'hE second', 1000000, 'hE Town', 'open', NULL, $3)`,
		hEProject2ID, hEOwnerID, hEKontrakProfileID); err != nil {
		t.Fatalf("hE project2: %v", err)
	}
	// Completed: the review matrix (kontraktor/pm/notaris/interior bids).
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline)
		VALUES ($1, $2, 'hE Done', 'hE third', 200000000, 'hE Ville', 'completed', '2027-03-01')`,
		hEProject3ID, hEOwnerID); err != nil {
		t.Fatalf("hE project3: %v", err)
	}

	t.Cleanup(func() { hEClean(context.Background(), pool) })

	return hEFixture{
		owner:      roadmapCaller{id: hEOwnerID, role: "user"},
		arsitek:    roadmapCaller{id: hEArsitekID, role: "arsitek"},
		kontraktor: roadmapCaller{id: hEKontrakID, role: "kontraktor"},
		pm:         roadmapCaller{id: hEPMUserID, role: "project_manager"},
		stranger:   roadmapCaller{id: hEStrangerID, role: "user"},
		structural: roadmapCaller{id: hEStructID, role: "structural"},
		mep:        roadmapCaller{id: hEMepID, role: "mep"},
		interior:   roadmapCaller{id: hEInterID, role: "interior"},
		notaris:    roadmapCaller{id: hENotarisID, role: "notaris"},
	}
}

// hEClean deletes every hE row the worker may have created, child-first.
func hEClean(ctx context.Context, pool *pgxpool.Pool) {
	for _, table := range []string{
		"project_comments", "project_reports", "project_change_orders",
		"project_timeline_extensions", "project_schedules", "project_delays",
		"project_activity_logs", "project_disputes", "project_terminations",
		"project_snag_items", "project_milestones", "project_payment_termins",
		"project_addendums", "project_sub_professionals", "project_documents",
		"project_daily_logs", "project_warranty_claims",
		"arsitek_ratings", "kontraktor_ratings", "interior_ratings",
		"notaris_ratings", "p_m_ratings",
	} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1))`, hEUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1))`, hEUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1)`, hEUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM team_members WHERE owner_user_id = ANY($1)`, hEUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE user_id = ANY($1)`, hEUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id = ANY($1)`, hEProjectIDs)
	for _, table := range []string{"arsiteks", "kontraktors", "project_managers", "interior_profiles", "structural_engineers", "mep_engineers", "notaris_profiles"} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE user_id = ANY($1)`, hEUserIDs)
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE id >= 951000 AND id < 952000`, hEUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, hEUserIDs)
}

// hEAssertNoLeftovers fails when any hE row survives the test.
func hEAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	for _, table := range []string{
		"projects", "users", "bids", "project_addendums", "project_milestones",
		"project_payment_termins", "project_documents", "project_daily_logs",
		"project_reports", "project_change_orders", "project_timeline_extensions",
		"project_schedules", "project_delays", "project_warranty_claims",
		"project_activity_logs", "notifications",
	} {
		var n int
		query := `SELECT count(*) FROM ` + table + ` WHERE id = ANY($1)`
		if table == "notifications" || table == "users" {
			query = `SELECT count(*) FROM ` + table + ` WHERE ` + map[string]string{"notifications": "user_id", "users": "id"}[table] + ` = ANY($1)`
		} else if table == "projects" {
			query = `SELECT count(*) FROM projects WHERE id = ANY($1)`
		} else {
			query = `SELECT count(*) FROM ` + table + ` WHERE project_id = ANY($1)`
		}
		ids := hEUserIDs
		if table != "notifications" && table != "users" {
			ids = hEProjectIDs
		}
		if err := pool.QueryRow(ctx, query, ids).Scan(&n); err != nil || n != 0 {
			t.Fatalf("hE leftovers in %s: n=%d err=%v", table, n, err)
		}
	}
}
