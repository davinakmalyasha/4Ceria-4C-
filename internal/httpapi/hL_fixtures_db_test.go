package httpapi

// hL fixtures — this worker's throwaway world on the REAL seeded DB.
//
// Every id lives in the 1030000+ range and every label carries the hL
// prefix, so nothing here can collide with the seed or with another
// worker's rows. Setup wipes hL rows first, inserts users, profiles and
// two projects, and registers a cleanup that deletes every hL row
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
	hLOwnerID      int64 = 1030001
	hLArsitekID    int64 = 1030002
	hLKontraktorID int64 = 1030003
	hLPMUserID     int64 = 1030004
	hLStrangerID   int64 = 1030005
	hLNotarisID    int64 = 1030006
	hLSupplierID   int64 = 1030007
	hLGhostID      int64 = 1030099

	hLArsitekProfileID    int64 = 1031001
	hLKontraktorProfileID int64 = 1031002
	hLPMProfileID         int64 = 1031003
	hLNotarisProfileID    int64 = 1031004
	hLSupplierProfileID   int64 = 1031005

	hLProjectID  int64 = 1032001
	hLProject2ID int64 = 1032002
)

var hLUserIDs = []int64{hLOwnerID, hLArsitekID, hLKontraktorID, hLPMUserID, hLStrangerID, hLNotarisID, hLSupplierID}
var hLProjectIDs = []int64{hLProjectID, hLProject2ID}

// hLExtraUserIDs are auxiliary users some hL tests mint (trade-role and
// logistics profiles). They are cleaned alongside the core fixture.
var hLExtraUserIDs = []int64{1030008, 1030009}

type hLFixture struct {
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

func hLPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

// hLClosedPool returns a pool that is already closed: every query fails,
// so handlers take their DB-down branches (500 via gateError/serverError).
func hLClosedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	pool.Close()
	return pool
}

// hLCall builds a JSON request, binds path values, injects the caller and
// serves it through the handler.
func hLCall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
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

func hLDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hLProjectPath(id int64) map[string]string {
	return map[string]string{"project": int64String(id)}
}

// hLSetup inserts hL users, their profiles and two hL projects, and
// registers a cleanup that removes every hL row from every table this
// worker touches.
func hLSetup(t *testing.T, pool *pgxpool.Pool) hLFixture {
	t.Helper()
	ctx := context.Background()

	hLClean(ctx, pool)

	users := []struct {
		id    int64
		name  string
		email string
		role  string
	}{
		{hLOwnerID, "hL Owner", "hl-owner@example.test", "user"},
		{hLArsitekID, "hL Arsitek", "hl-arsitek@example.test", "arsitek"},
		{hLKontraktorID, "hL Kontraktor", "hl-kontraktor@example.test", "kontraktor"},
		{hLPMUserID, "hL PM", "hl-pm@example.test", "project_manager"},
		{hLStrangerID, "hL Stranger", "hl-stranger@example.test", "user"},
		{hLNotarisID, "hL Notaris", "hl-notaris@example.test", "notaris"},
		{hLSupplierID, "hL Supplier", "hl-supplier@example.test", "supplier"},
	}
	for _, u := range users {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES ($1, $2, $3, 'hL-secret', $4::role_type)`,
			u.id, u.name, u.email, u.role); err != nil {
			t.Fatalf("hL user %d: %v", u.id, err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (id, user_id, nama) VALUES ($1, $2, 'hL Arsitek')`,
		hLArsitekProfileID, hLArsitekID); err != nil {
		t.Fatalf("hL arsitek profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO kontraktors (id, user_id, nama) VALUES ($1, $2, 'hL Kontraktor')`,
		hLKontraktorProfileID, hLKontraktorID); err != nil {
		t.Fatalf("hL kontraktor profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_managers (id, user_id, nama) VALUES ($1, $2, 'hL PM')`,
		hLPMProfileID, hLPMUserID); err != nil {
		t.Fatalf("hL pm profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO notaris_profiles (id, user_id, nama) VALUES ($1, $2, 'hL Notaris')`,
		hLNotarisProfileID, hLNotarisID); err != nil {
		t.Fatalf("hL notaris profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO suppliers (id, user_id, store_name) VALUES ($1, $2, 'hL Store')`,
		hLSupplierProfileID, hLSupplierID); err != nil {
		t.Fatalf("hL supplier profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_arsitek_id, selected_kontraktor_id, pm_id)
		VALUES ($1, $2, 'hL Tower', 'hL build', 50000000, 'hL City', 'in_progress', '2027-01-01', $3, $4, $5)`,
		hLProjectID, hLOwnerID, hLArsitekProfileID, hLKontraktorProfileID, hLPMProfileID); err != nil {
		t.Fatalf("hL project: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_kontraktor_id)
		VALUES ($1, $2, 'hL Annex', 'hL second', 1000000, 'hL Town', 'open', '2027-02-01', $3)`,
		hLProject2ID, hLOwnerID, hLKontraktorProfileID); err != nil {
		t.Fatalf("hL project2: %v", err)
	}

	t.Cleanup(func() { hLClean(context.Background(), pool) })

	return hLFixture{
		owner:      roadmapCaller{id: hLOwnerID, role: "user"},
		arsitek:    roadmapCaller{id: hLArsitekID, role: "arsitek"},
		kontraktor: roadmapCaller{id: hLKontraktorID, role: "kontraktor"},
		pm:         roadmapCaller{id: hLPMUserID, role: "project_manager"},
		stranger:   roadmapCaller{id: hLStrangerID, role: "user"},
		notaris:    roadmapCaller{id: hLNotarisID, role: "notaris"},
		supplier:   roadmapCaller{id: hLSupplierID, role: "supplier"},
		ghost:      roadmapCaller{id: hLGhostID, role: "user"},
		projectID:  hLProjectID,
		project2ID: hLProject2ID,
	}
}

// hLClean deletes every hL row the worker may have created. Children
// first, then the projects, profiles, users.
func hLClean(ctx context.Context, pool *pgxpool.Pool) {
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirement_histories WHERE project_requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirements WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hLUserIDs)
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
			(SELECT id FROM projects WHERE user_id = ANY($1))`, hLUserIDs)
	}
	for _, table := range []string{
		"project_comments", "sticky_notes", "project_reports", "project_change_orders",
		"project_timeline_extensions", "project_schedules", "project_delays",
		"project_activity_logs", "project_disputes", "project_terminations",
		"project_milestones", "project_payment_termins", "project_addendums",
		"project_sub_professionals", "project_material_folders", "project_external_vendors",
		"project_images", "project_budget_transactions", "project_daily_logs",
		"project_warranty_claims", "project_documents",
	} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE project_id = ANY($1)`, hLProjectIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM conversations WHERE user_one_id = ANY($1) OR user_two_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id = ANY($1)`, hLProjectIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE user_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM delivery_jobs WHERE quote_id IN
		(SELECT id FROM material_quotes WHERE supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1)) OR user_id = ANY($1))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_orders WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_quotes WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM suppliers WHERE user_id = ANY($1) AND id >= 1031000`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_answers WHERE question_id IN
		(SELECT id FROM house_questions WHERE house_id IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_questions WHERE house_id IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms_pic WHERE id_room IN
		(SELECT id FROM rooms WHERE id_house IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms WHERE id_house IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house WHERE id_user = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_order_reviews WHERE user_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM team_members WHERE owner_user_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM arsitek_ratings WHERE project_id = ANY($1)`, hLProjectIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM kontraktor_ratings WHERE project_id = ANY($1)`, hLProjectIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM model_has_roles WHERE model_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM personal_access_tokens WHERE tokenable_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE user_id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id = ANY($1)`, hLProjectIDs)
	for _, table := range []string{"arsiteks", "kontraktors", "project_managers", "notaris_profiles", "interior_profiles", "structural_engineers", "mep_engineers", "courier_profiles", "suppliers"} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE user_id = ANY($1)`, hLUserIDs)
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE id >= 1031000 AND id < 1032000`, hLUserIDs)
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE user_id = ANY($1)`, hLExtraUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1)`, hLExtraUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user = ANY($1)`, hLExtraUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM model_has_roles WHERE model_id = ANY($1)`, hLExtraUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, hLUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, hLExtraUserIDs)
}

// hLAssertNoLeftovers fails when any hL row survives the test.
func hLAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id = ANY($1)`, hLProjectIDs).Scan(&n); err != nil || n != 0 {
		t.Fatalf("hL projects leftover: n=%d err=%v", n, err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id = ANY($1)`, hLUserIDs).Scan(&n); err != nil || n != 0 {
		t.Fatalf("hL users leftover: n=%d err=%v", n, err)
	}
}
