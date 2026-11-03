package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestAdminForceTerminateIdempotent pins the hardened force-terminate:
// terminal states are a 422 (not a silent re-terminate), the mutation,
// activity log and owner notification commit atomically, and a retry after
// success learns nothing changed.
func TestAdminForceTerminateIdempotent(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := t.Context()

	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email = 'admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no seeded admin")
	}
	admin := roadmapCaller{id: adminID, role: "admin", admin: true}

	var ownerID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Terminate Owner','termownt1','termowner@example.test','x','user','TRMOW1',NOW(),NOW()) RETURNING id`).Scan(&ownerID); err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, ownerID)

	var projectID int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status) VALUES ($1, 'Terminate Me', 'open') RETURNING id`, ownerID).Scan(&projectID); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id = $1`, projectID)
	defer pool.Exec(ctx, `DELETE FROM notifications WHERE user_id = $1`, ownerID)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id = $1`, projectID)

	terminate := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/admin/projects/1/force-terminate", nil)
		req.SetPathValue("project", itoaTest(projectID))
		req = req.WithContext(withCaller(req.Context(), admin))
		rec := httptest.NewRecorder()
		AdminForceTerminateHandler(pool)(rec, req)
		return rec
	}

	// First terminate: 200, cancelled, log row, owner notified.
	if rec := terminate(); rec.Code != http.StatusOK {
		t.Fatalf("terminate = %d, %s", rec.Code, rec.Body.String())
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, projectID).Scan(&status); err != nil || status != "cancelled" {
		t.Fatalf("status = %q, err = %v", status, err)
	}
	var logCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM project_activity_logs WHERE project_id = $1 AND action = 'admin_force_terminate'`, projectID).Scan(&logCount); err != nil || logCount != 1 {
		t.Fatalf("activity log rows = %d, err = %v", logCount, err)
	}
	var notifCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'contract_terminated'`, ownerID).Scan(&notifCount); err != nil || notifCount != 1 {
		t.Fatalf("owner notifications = %d, err = %v", notifCount, err)
	}

	// Retry: 422, no duplicate log or notification.
	if rec := terminate(); rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "already") {
		t.Fatalf("re-terminate = %d, %s", rec.Code, rec.Body.String())
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM project_activity_logs WHERE project_id = $1 AND action = 'admin_force_terminate'`, projectID).Scan(&logCount); err != nil || logCount != 1 {
		t.Fatalf("activity log rows after retry = %d, err = %v", logCount, err)
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'contract_terminated'`, ownerID).Scan(&notifCount); err != nil || notifCount != 1 {
		t.Fatalf("owner notifications after retry = %d, err = %v", notifCount, err)
	}

	// A completed project is equally untouchable.
	var doneID int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status) VALUES ($1, 'Already Done', 'completed') RETURNING id`, ownerID).Scan(&doneID); err != nil {
		t.Fatalf("seed done project: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id = $1`, doneID)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/projects/1/force-terminate", nil)
	req.SetPathValue("project", itoaTest(doneID))
	req = req.WithContext(withCaller(req.Context(), admin))
	rec := httptest.NewRecorder()
	AdminForceTerminateHandler(pool)(rec, req)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("terminate completed = %d, %s", rec.Code, rec.Body.String())
	}
}
