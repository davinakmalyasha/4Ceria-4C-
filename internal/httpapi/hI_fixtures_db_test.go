package httpapi

// hI fixtures — this worker's throwaway world on the REAL seeded DB.
//
// Every id lives in the 990000+ range and every label carries the hI
// prefix, so nothing here can collide with the seed or with another
// worker's rows. Setup wipes hI rows first, inserts users, profiles and
// two projects, and registers a cleanup that deletes every hI row
// child-first — zero leftovers, seed rows never touched.

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
	hIOwnerID      int64 = 990001
	hIArsitekID    int64 = 990002
	hIKontraktorID int64 = 990003
	hIPMUserID     int64 = 990004
	hIStrangerID   int64 = 990005
	hINotarisID    int64 = 990006
	hISupplierID   int64 = 990007
	hIGhostID      int64 = 990099

	hIArsitekProfileID    int64 = 991001
	hIKontraktorProfileID int64 = 991002
	hIPMProfileID         int64 = 991003
	hINotarisProfileID    int64 = 991004
	hISupplierProfileID   int64 = 991005

	hIProjectID  int64 = 992001
	hIProject2ID int64 = 992002
)

var hIUserIDs = []int64{hIOwnerID, hIArsitekID, hIKontraktorID, hIPMUserID, hIStrangerID, hINotarisID, hISupplierID}
var hIProjectIDs = []int64{hIProjectID, hIProject2ID}

type hIFixture struct {
	owner      roadmapCaller
	arsitek    roadmapCaller
	kontraktor roadmapCaller
	pm         roadmapCaller
	stranger   roadmapCaller
	notaris    roadmapCaller
	supplier   roadmapCaller
	ghost      roadmapCaller
	projectID  int64
	project2ID int64
}

func hIPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

// hICall builds a JSON request, binds path values, injects the caller and
// serves it through the handler.
func hICall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
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

func hIDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hIProjectPath(id int64) map[string]string {
	return map[string]string{"project": int64String(id)}
}

// hISetup inserts hI users, their profiles and two hI projects, and
// registers a cleanup that removes every hI row from every table this
// worker touches.
func hISetup(t *testing.T, pool *pgxpool.Pool) hIFixture {
	t.Helper()
	ctx := context.Background()

	hIClean(ctx, pool)

	users := []struct {
		id    int64
		name  string
		email string
		role  string
	}{
		{hIOwnerID, "hI Owner", "hi-owner@example.test", "user"},
		{hIArsitekID, "hI Arsitek", "hi-arsitek@example.test", "arsitek"},
		{hIKontraktorID, "hI Kontraktor", "hi-kontraktor@example.test", "kontraktor"},
		{hIPMUserID, "hI PM", "hi-pm@example.test", "project_manager"},
		{hIStrangerID, "hI Stranger", "hi-stranger@example.test", "user"},
		{hINotarisID, "hI Notaris", "hi-notaris@example.test", "notaris"},
		{hISupplierID, "hI Supplier", "hi-supplier@example.test", "supplier"},
	}
	for _, u := range users {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES ($1, $2, $3, 'hI-secret', $4::role_type)`,
			u.id, u.name, u.email, u.role); err != nil {
			t.Fatalf("hI user %d: %v", u.id, err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (id, user_id, nama) VALUES ($1, $2, 'hI Arsitek')`,
		hIArsitekProfileID, hIArsitekID); err != nil {
		t.Fatalf("hI arsitek profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO kontraktors (id, user_id, nama) VALUES ($1, $2, 'hI Kontraktor')`,
		hIKontraktorProfileID, hIKontraktorID); err != nil {
		t.Fatalf("hI kontraktor profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_managers (id, user_id, nama) VALUES ($1, $2, 'hI PM')`,
		hIPMProfileID, hIPMUserID); err != nil {
		t.Fatalf("hI pm profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO notaris_profiles (id, user_id, nama) VALUES ($1, $2, 'hI Notaris')`,
		hINotarisProfileID, hINotarisID); err != nil {
		t.Fatalf("hI notaris profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO suppliers (id, user_id, store_name) VALUES ($1, $2, 'hI Store')`,
		hISupplierProfileID, hISupplierID); err != nil {
		t.Fatalf("hI supplier profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_arsitek_id, selected_kontraktor_id, pm_id)
		VALUES ($1, $2, 'hI Tower', 'hI build', 50000000, 'hI City', 'in_progress', '2027-01-01', $3, $4, $5)`,
		hIProjectID, hIOwnerID, hIArsitekProfileID, hIKontraktorProfileID, hIPMProfileID); err != nil {
		t.Fatalf("hI project: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_kontraktor_id)
		VALUES ($1, $2, 'hI Annex', 'hI second', 1000000, 'hI Town', 'open', '2027-02-01', $3)`,
		hIProject2ID, hIOwnerID, hIKontraktorProfileID); err != nil {
		t.Fatalf("hI project2: %v", err)
	}

	t.Cleanup(func() { hIClean(context.Background(), pool) })

	return hIFixture{
		owner:      roadmapCaller{id: hIOwnerID, role: "user"},
		arsitek:    roadmapCaller{id: hIArsitekID, role: "arsitek"},
		kontraktor: roadmapCaller{id: hIKontraktorID, role: "kontraktor"},
		pm:         roadmapCaller{id: hIPMUserID, role: "project_manager"},
		stranger:   roadmapCaller{id: hIStrangerID, role: "user"},
		notaris:    roadmapCaller{id: hINotarisID, role: "notaris"},
		supplier:   roadmapCaller{id: hISupplierID, role: "supplier"},
		ghost:      roadmapCaller{id: hIGhostID, role: "user"},
		projectID:  hIProjectID,
		project2ID: hIProject2ID,
	}
}

// hIClean deletes every hI row the worker may have created. Children
// first, then the projects, profiles, users.
func hIClean(ctx context.Context, pool *pgxpool.Pool) {
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirement_histories WHERE project_requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirements WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hIUserIDs)
	for _, table := range []string{
		"project_comments", "sticky_notes", "project_reports", "project_change_orders",
		"project_timeline_extensions", "project_schedules", "project_delays",
		"project_activity_logs", "project_disputes", "project_terminations",
		"project_milestones", "project_payment_termins", "project_addendums",
		"project_sub_professionals", "project_material_folders", "project_external_vendors",
		"project_images", "project_budget_transactions", "project_daily_logs",
		"project_warranty_claims", "project_documents",
	} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE project_id IN
			(SELECT id FROM projects WHERE user_id = ANY($1))`, hIUserIDs)
	}
	// Child tables keyed by project id directly (no user join needed).
	for _, table := range []string{
		"project_comments", "sticky_notes", "project_reports", "project_change_orders",
		"project_timeline_extensions", "project_schedules", "project_delays",
		"project_activity_logs", "project_disputes", "project_terminations",
		"project_milestones", "project_payment_termins", "project_addendums",
		"project_sub_professionals", "project_material_folders", "project_external_vendors",
		"project_images", "project_budget_transactions", "project_daily_logs",
		"project_warranty_claims", "project_documents",
	} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE project_id = ANY($1)`, hIProjectIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirement_histories WHERE project_requirement_id = ANY($1)`, []int64{990001, 990002})
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id = ANY($1)`, hIProjectIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1)`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id = ANY($1)`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM delivery_jobs WHERE quote_id IN
		(SELECT id FROM material_quotes WHERE supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1)) OR user_id = ANY($1))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_orders WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_quotes WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM suppliers WHERE user_id = ANY($1) AND id >= 991000`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_answers WHERE question_id IN
		(SELECT id FROM house_questions WHERE house_id IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_questions WHERE house_id IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms_pic WHERE id_room IN
		(SELECT id FROM rooms WHERE id_house IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms WHERE id_house IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house WHERE id_user = ANY($1)`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_order_reviews WHERE user_id = ANY($1)`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user = ANY($1)`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM team_members WHERE owner_user_id = ANY($1)`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM arsitek_ratings WHERE project_id = ANY($1)`, hIProjectIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM kontraktor_ratings WHERE project_id = ANY($1)`, hIProjectIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE user_id = ANY($1)`, hIUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id = ANY($1)`, hIProjectIDs)
	for _, table := range []string{"arsiteks", "kontraktors", "project_managers", "notaris_profiles", "interior_profiles", "structural_engineers", "mep_engineers"} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE user_id = ANY($1)`, hIUserIDs)
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE id >= 991000 AND id < 992000`, hIUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, hIUserIDs)
}

// hIAssertNoLeftovers fails when any hI row survives the test.
func hIAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id = ANY($1)`, hIProjectIDs).Scan(&n); err != nil || n != 0 {
		t.Fatalf("hI projects leftover: n=%d err=%v", n, err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id = ANY($1)`, hIUserIDs).Scan(&n); err != nil || n != 0 {
		t.Fatalf("hI users leftover: n=%d err=%v", n, err)
	}
}
