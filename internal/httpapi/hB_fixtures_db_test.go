package httpapi

// hB fixtures — the half-B worker's throwaway world on the REAL seeded DB.
//
// Every id this file mints lives in the 920000+ range and every label
// carries the hB prefix, so nothing here can collide with the seed or with
// another worker's rows. Setup registers a cleanup that deletes everything
// hB from the child tables first, then the projects, profiles and users —
// zero leftovers, seed rows never touched.

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
	hBOwnerID      int64 = 920001
	hBArsitekID    int64 = 920002
	hBKontraktorID int64 = 920003
	hBPMUserID     int64 = 920004
	hBStrangerID   int64 = 920005
	hBNotarisID    int64 = 920006
	hBSupplierID   int64 = 920007
	hBProjectID    int64 = 920001
	hBProject2ID   int64 = 920002

	hBArsitekProfileID    int64 = 921001
	hBKontraktorProfileID int64 = 921002
	hBPMProfileID         int64 = 921003
	hBNotarisProfileID    int64 = 921004
	hBSupplierProfileID   int64 = 921005
)

var hBUserIDs = []int64{hBOwnerID, hBArsitekID, hBKontraktorID, hBPMUserID, hBStrangerID, hBNotarisID, hBSupplierID}
var hBProjectIDs = []int64{hBProjectID, hBProject2ID}

type hBFixture struct {
	owner      roadmapCaller
	arsitek    roadmapCaller
	kontraktor roadmapCaller
	pm         roadmapCaller
	stranger   roadmapCaller
	notaris    roadmapCaller
	supplier   roadmapCaller
	projectID  int64
	project2ID int64
}

func hBPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

// hBCall builds a JSON request, binds path values, injects the caller and
// serves it through the handler.
func hBCall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
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

func hBDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hBProjectPath(id int64) map[string]string {
	return map[string]string{"project": int64String(id)}
}

// hBSetup inserts hB users, their profiles and two hB projects, and
// registers a cleanup that removes every hB row from every table this
// worker touches.
func hBSetup(t *testing.T, pool *pgxpool.Pool) hBFixture {
	t.Helper()
	ctx := context.Background()

	hBClean(ctx, pool)

	users := []struct {
		id    int64
		name  string
		email string
		role  string
	}{
		{hBOwnerID, "hB Owner", "hb-owner@example.test", "user"},
		{hBArsitekID, "hB Arsitek", "hb-arsitek@example.test", "arsitek"},
		{hBKontraktorID, "hB Kontraktor", "hb-kontraktor@example.test", "kontraktor"},
		{hBPMUserID, "hB PM", "hb-pm@example.test", "project_manager"},
		{hBStrangerID, "hB Stranger", "hb-stranger@example.test", "user"},
		{hBNotarisID, "hB Notaris", "hb-notaris@example.test", "notaris"},
		{hBSupplierID, "hB Supplier", "hb-supplier@example.test", "supplier"},
	}
	for _, u := range users {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES ($1, $2, $3, 'hB-secret', $4::role_type)`,
			u.id, u.name, u.email, u.role); err != nil {
			t.Fatalf("hB user %d: %v", u.id, err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (id, user_id, nama) VALUES ($1, $2, 'hB Arsitek')`,
		hBArsitekProfileID, hBArsitekID); err != nil {
		t.Fatalf("hB arsitek profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO kontraktors (id, user_id, nama) VALUES ($1, $2, 'hB Kontraktor')`,
		hBKontraktorProfileID, hBKontraktorID); err != nil {
		t.Fatalf("hB kontraktor profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_managers (id, user_id, nama) VALUES ($1, $2, 'hB PM')`,
		hBPMProfileID, hBPMUserID); err != nil {
		t.Fatalf("hB pm profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO notaris_profiles (id, user_id, nama) VALUES ($1, $2, 'hB Notaris')`,
		hBNotarisProfileID, hBNotarisID); err != nil {
		t.Fatalf("hB notaris profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO suppliers (id, user_id, store_name) VALUES ($1, $2, 'hB Store')`,
		hBSupplierProfileID, hBSupplierID); err != nil {
		t.Fatalf("hB supplier profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_arsitek_id, selected_kontraktor_id, pm_id)
		VALUES ($1, $2, 'hB Tower', 'hB build', 50000000, 'hB City', 'in_progress', '2027-01-01', $3, $4, $5)`,
		hBProjectID, hBOwnerID, hBArsitekProfileID, hBKontraktorProfileID, hBPMProfileID); err != nil {
		t.Fatalf("hB project: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_kontraktor_id)
		VALUES ($1, $2, 'hB Annex', 'hB second', 1000000, 'hB Town', 'open', '2027-02-01', $3)`,
		hBProject2ID, hBOwnerID, hBKontraktorProfileID); err != nil {
		t.Fatalf("hB project2: %v", err)
	}

	t.Cleanup(func() { hBClean(context.Background(), pool) })

	return hBFixture{
		owner:      roadmapCaller{id: hBOwnerID, role: "user"},
		arsitek:    roadmapCaller{id: hBArsitekID, role: "arsitek"},
		kontraktor: roadmapCaller{id: hBKontraktorID, role: "kontraktor"},
		pm:         roadmapCaller{id: hBPMUserID, role: "project_manager"},
		stranger:   roadmapCaller{id: hBStrangerID, role: "user"},
		notaris:    roadmapCaller{id: hBNotarisID, role: "notaris"},
		supplier:   roadmapCaller{id: hBSupplierID, role: "supplier"},
		projectID:  hBProjectID,
		project2ID: hBProject2ID,
	}
}

// hBClean deletes every hB row the worker may have created. Children
// first, then projects, profiles, users.
func hBClean(ctx context.Context, pool *pgxpool.Pool) {
	// Requirement children reference requirements, so clear them first.
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirement_histories WHERE project_requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirements WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hBUserIDs)
	for _, table := range []string{
		"project_comments", "sticky_notes", "project_reports", "project_change_orders",
		"project_timeline_extensions", "project_schedules", "project_delays",
		"project_activity_logs", "project_disputes", "project_terminations",
		"project_milestones", "project_payment_termins", "project_addendums",
		"project_sub_professionals", "project_material_folders", "project_external_vendors",
		"project_images", "project_budget_transactions",
	} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE project_id IN
			(SELECT id FROM projects WHERE user_id = ANY($1))`, hBUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1)`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id = ANY($1)`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM delivery_jobs WHERE quote_id IN
		(SELECT id FROM material_quotes WHERE supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1)) OR user_id = ANY($1))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_orders WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_quotes WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM suppliers WHERE user_id = ANY($1) AND id >= 921000`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_answers WHERE question_id IN
		(SELECT id FROM house_questions WHERE house_id IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_questions WHERE house_id IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms_pic WHERE id_room IN
		(SELECT id FROM rooms WHERE id_house IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms WHERE id_house IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house WHERE id_user = ANY($1)`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_order_reviews WHERE user_id = ANY($1)`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user = ANY($1)`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE user_id = ANY($1)`, hBUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id = ANY($1)`, hBProjectIDs)
	for _, table := range []string{"arsiteks", "kontraktors", "project_managers", "notaris_profiles", "interior_profiles", "structural_engineers", "mep_engineers"} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE user_id = ANY($1)`, hBUserIDs)
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE id >= 921000 AND id < 922000`, hBUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, hBUserIDs)
}
