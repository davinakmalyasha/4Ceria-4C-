package httpapi

// hF fixtures — the verify/edges worker's throwaway world on the REAL seeded DB.
//
// Every id this file mints lives in the 960000+ range and every label
// carries the hF prefix, so nothing here can collide with the seed or with
// another worker's rows. Setup registers a cleanup that deletes everything
// hF from the child tables first, then the projects, profiles and users —
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
	hFOwnerID      int64 = 960001
	hFArsitekID    int64 = 960002
	hFKontraktorID int64 = 960003
	hFPMUserID     int64 = 960004
	hFStrangerID   int64 = 960005
	hFNotarisID    int64 = 960006
	hFSupplierID   int64 = 960007
	hFAdminID      int64 = 960008
	hFProjectID    int64 = 960001
	hFProject2ID   int64 = 960002
	hFProject3ID   int64 = 960003

	hFArsitekProfileID    int64 = 961001
	hFKontraktorProfileID int64 = 961002
	hFPMProfileID         int64 = 961003
	hFNotarisProfileID    int64 = 961004
	hFSupplierProfileID   int64 = 961005
)

var hFUserIDs = []int64{hFOwnerID, hFArsitekID, hFKontraktorID, hFPMUserID, hFStrangerID, hFNotarisID, hFSupplierID, hFAdminID}
var hFProjectIDs = []int64{hFProjectID, hFProject2ID, hFProject3ID}

type hFFixture struct {
	owner      roadmapCaller
	arsitek    roadmapCaller
	kontraktor roadmapCaller
	pm         roadmapCaller
	stranger   roadmapCaller
	notaris    roadmapCaller
	supplier   roadmapCaller
	admin      roadmapCaller
	projectID  int64
	project2ID int64
	project3ID int64
}

func hFPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

// hFCall builds a JSON request, binds path values, injects the caller and
// serves it through the handler.
func hFCall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
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

func hFDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hFProjectPath(id int64) map[string]string {
	return map[string]string{"project": int64String(id)}
}

// hFSetup inserts hF users, their profiles and three hF projects, and
// registers a cleanup that removes every hF row from every table this
// worker touches.
func hFSetup(t *testing.T, pool *pgxpool.Pool) hFFixture {
	t.Helper()
	ctx := context.Background()

	hFClean(ctx, pool)

	users := []struct {
		id    int64
		name  string
		email string
		role  string
	}{
		{hFOwnerID, "hF Owner", "hf-owner@example.test", "user"},
		{hFArsitekID, "hF Arsitek", "hf-arsitek@example.test", "arsitek"},
		{hFKontraktorID, "hF Kontraktor", "hf-kontraktor@example.test", "kontraktor"},
		{hFPMUserID, "hF PM", "hf-pm@example.test", "project_manager"},
		{hFStrangerID, "hF Stranger", "hf-stranger@example.test", "user"},
		{hFNotarisID, "hF Notaris", "hf-notaris@example.test", "notaris"},
		{hFSupplierID, "hF Supplier", "hf-supplier@example.test", "supplier"},
		{hFAdminID, "hF Admin", "hf-admin@example.test", "admin"},
	}
	for _, u := range users {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES ($1, $2, $3, 'hF-secret', $4::role_type)`,
			u.id, u.name, u.email, u.role); err != nil {
			t.Fatalf("hF user %d: %v", u.id, err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (id, user_id, nama) VALUES ($1, $2, 'hF Arsitek')`,
		hFArsitekProfileID, hFArsitekID); err != nil {
		t.Fatalf("hF arsitek profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO kontraktors (id, user_id, nama) VALUES ($1, $2, 'hF Kontraktor')`,
		hFKontraktorProfileID, hFKontraktorID); err != nil {
		t.Fatalf("hF kontraktor profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_managers (id, user_id, nama) VALUES ($1, $2, 'hF PM')`,
		hFPMProfileID, hFPMUserID); err != nil {
		t.Fatalf("hF pm profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO notaris_profiles (id, user_id, nama) VALUES ($1, $2, 'hF Notaris')`,
		hFNotarisProfileID, hFNotarisID); err != nil {
		t.Fatalf("hF notaris profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO suppliers (id, user_id, store_name) VALUES ($1, $2, 'hF Store')`,
		hFSupplierProfileID, hFSupplierID); err != nil {
		t.Fatalf("hF supplier profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_arsitek_id, selected_kontraktor_id, pm_id)
		VALUES ($1, $2, 'hF Tower', 'hF build', 50000000, 'hF City', 'in_progress', '2027-01-01', $3, $4, $5)`,
		hFProjectID, hFOwnerID, hFArsitekProfileID, hFKontraktorProfileID, hFPMProfileID); err != nil {
		t.Fatalf("hF project: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline, selected_kontraktor_id)
		VALUES ($1, $2, 'hF Annex', 'hF second', 1000000, 'hF Town', 'open', '2027-02-01', $3)`,
		hFProject2ID, hFOwnerID, hFKontraktorProfileID); err != nil {
		t.Fatalf("hF project2: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, description, budget, lokasi, status, deadline)
		VALUES ($1, $2, 'hF Third', 'hF third', 2000000, 'hF Ville', 'open', '2027-03-01')`,
		hFProject3ID, hFOwnerID); err != nil {
		t.Fatalf("hF project3: %v", err)
	}

	t.Cleanup(func() { hFClean(context.Background(), pool) })

	return hFFixture{
		owner:      roadmapCaller{id: hFOwnerID, role: "user"},
		arsitek:    roadmapCaller{id: hFArsitekID, role: "arsitek"},
		kontraktor: roadmapCaller{id: hFKontraktorID, role: "kontraktor"},
		pm:         roadmapCaller{id: hFPMUserID, role: "project_manager"},
		stranger:   roadmapCaller{id: hFStrangerID, role: "user"},
		notaris:    roadmapCaller{id: hFNotarisID, role: "notaris"},
		supplier:   roadmapCaller{id: hFSupplierID, role: "supplier"},
		admin:      roadmapCaller{id: hFAdminID, role: "admin", admin: true},
		projectID:  hFProjectID,
		project2ID: hFProject2ID,
		project3ID: hFProject3ID,
	}
}

// hFClean deletes every hF row the worker may have created. Children
// first, then the projects, profiles, users.
func hFClean(ctx context.Context, pool *pgxpool.Pool) {
	_, _ = pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN
		(SELECT id FROM project_disputes WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirement_histories WHERE project_requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE requirement_id IN
		(SELECT id FROM project_requirements WHERE project_id IN (SELECT id FROM projects WHERE user_id = ANY($1)))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM project_requirements WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hFUserIDs)
	for _, table := range []string{
		"project_comments", "sticky_notes", "project_reports", "project_change_orders",
		"project_timeline_extensions", "project_schedules", "project_delays",
		"project_activity_logs", "project_disputes", "project_terminations",
		"project_milestones", "project_payment_termins", "project_addendums",
		"project_sub_professionals", "project_material_folders", "project_external_vendors",
		"project_images", "project_budget_transactions",
	} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE project_id IN
			(SELECT id FROM projects WHERE user_id = ANY($1))`, hFUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = ANY($1)`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id = ANY($1)`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM delivery_jobs WHERE quote_id IN
		(SELECT id FROM material_quotes WHERE supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1)) OR user_id = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_orders WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_quotes WHERE user_id = ANY($1)
		OR supplier_id IN (SELECT id FROM suppliers WHERE user_id = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM suppliers WHERE user_id = ANY($1) AND id >= 961000`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_answers WHERE question_id IN
		(SELECT id FROM house_questions WHERE house_id IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house_questions WHERE house_id IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms_pic WHERE id_room IN
		(SELECT id FROM rooms WHERE id_house IN (SELECT id FROM house WHERE id_user = ANY($1)))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM rooms WHERE id_house IN
		(SELECT id FROM house WHERE id_user = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM house WHERE id_user = ANY($1)`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM material_order_reviews WHERE user_id = ANY($1)`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user = ANY($1)`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM kontraktor_ratings WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM arsitek_ratings WHERE project_id IN
		(SELECT id FROM projects WHERE user_id = ANY($1))`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE user_id = ANY($1)`, hFUserIDs)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id = ANY($1)`, hFProjectIDs)
	for _, table := range []string{"arsiteks", "kontraktors", "project_managers", "notaris_profiles", "interior_profiles", "structural_engineers", "mep_engineers"} {
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE user_id = ANY($1)`, hFUserIDs)
		_, _ = pool.Exec(ctx, `DELETE FROM `+table+` WHERE id >= 961000 AND id < 962000`, hFUserIDs)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, hFUserIDs)
}
