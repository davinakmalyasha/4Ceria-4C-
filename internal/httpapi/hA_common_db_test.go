package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hAPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

func hACaller(t *testing.T, pool *pgxpool.Pool, id int64) roadmapCaller {
	t.Helper()
	var role string
	if err := pool.QueryRow(context.Background(), `SELECT COALESCE(role_type::text,'user') FROM users WHERE id = $1`, id).Scan(&role); err != nil {
		t.Fatalf("hA user %d missing: %v", id, err)
	}
	return roadmapCaller{id: id, role: role}
}

func hACall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathID string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader(`{}`)
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("Content-Type", "application/json")
	h1AllPathKeys(req, pathID)
	if caller != nil {
		req = req.WithContext(withCaller(req.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func hACallWithPaths(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, kv map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader(`{}`)
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("Content-Type", "application/json")
	h1AllPathKeys(req, "999999999")
	for k, v := range kv {
		req.SetPathValue(k, v)
	}
	if caller != nil {
		req = req.WithContext(withCaller(req.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func hADecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

// hAMkUser inserts a user with explicit high ID and a verified profile for role.
// Caller must DELETE users afterwards (cascade cleans profiles/projects/bids).
func hAMkUser(t *testing.T, pool *pgxpool.Pool, id int64, role, email, name string) roadmapCaller {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES ($1,$2,$3,'hA-secret-hash',$4::role_type) ON CONFLICT (id) DO NOTHING`, id, name, email, role)
	if err != nil {
		t.Fatalf("mkuser %d: %v", id, err)
	}
	switch role {
	case "arsitek":
		_, err = pool.Exec(ctx, `INSERT INTO arsiteks (id, user_id, nama, verification_status) VALUES ($1,$2,$3,'verified') ON CONFLICT (id) DO NOTHING`, id+100000, id, name)
	case "kontraktor":
		_, err = pool.Exec(ctx, `INSERT INTO kontraktors (id, user_id, nama, verification_status) VALUES ($1,$2,$3,'verified') ON CONFLICT (id) DO NOTHING`, id+100000, id, name)
	case "notaris":
		_, err = pool.Exec(ctx, `INSERT INTO notaris_profiles (id, user_id, nama, verification_status) VALUES ($1,$2,$3,'verified') ON CONFLICT (id) DO NOTHING`, id+100000, id, name)
	case "interior":
		_, err = pool.Exec(ctx, `INSERT INTO interior_profiles (id, user_id, nama, verification_status) VALUES ($1,$2,$3,'verified') ON CONFLICT (id) DO NOTHING`, id+100000, id, name)
	case "project_manager":
		_, err = pool.Exec(ctx, `INSERT INTO project_managers (id, user_id, verification_status) VALUES ($1,$2,'verified') ON CONFLICT (id) DO NOTHING`, id+100000, id)
	case "structural":
		_, err = pool.Exec(ctx, `INSERT INTO structural_engineers (id, user_id, verification_status) VALUES ($1,$2,'verified') ON CONFLICT (id) DO NOTHING`, id+100000, id)
	case "mep":
		_, err = pool.Exec(ctx, `INSERT INTO mep_engineers (id, user_id, verification_status) VALUES ($1,$2,'verified') ON CONFLICT (id) DO NOTHING`, id+100000, id)
	}
	if err != nil {
		t.Fatalf("mkprofile %d: %v", id, err)
	}
	return roadmapCaller{id: id, role: role}
}

func hAMkProject(t *testing.T, pool *pgxpool.Pool, id, ownerID int64, title, status, targetRole string, budget int64) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO projects (id, user_id, title, budget, status, target_role, published_bidding_roles, project_category, deadline)
		VALUES ($1,$2,$3,$4,$5::project_status,$6,'["arsitek","kontraktor","notaris","interior","structural","mep","project_manager"]'::jsonb,'new_build','2030-06-01')
		ON CONFLICT (id) DO NOTHING`, id, ownerID, title, budget, status, targetRole)
	if err != nil {
		t.Fatalf("mkproject %d: %v", id, err)
	}
}

// hACleanupUsers deletes all hA users (>=910000) — cascades projects/bids/etc.
func hACleanupUsers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, _ = pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id >= 910000`)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id >= 910000`)
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id >= 910000`)
}

// hAAssertNoLeftovers fails if any hA fixture remains.
func hAAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id >= 910000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hA users: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id >= 910000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hA projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE title LIKE 'hA%'`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hA titled projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE project_id >= 910000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hA bids: %d", n)
	}
}
