package httpapi

// hJ worker helpers — throwaway fixtures on the REAL seeded DB.
//
// Every id minted here starts at 1010001 and every label carries the hJ
// prefix, so nothing here can collide with the seed or with another
// worker's rows. Tests delete everything they create (child tables
// first, then projects, profiles and users) — zero leftovers, seed rows
// never touched.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

var hJSeq int64 = 1010000

func hJNextID() int64 {
	return atomic.AddInt64(&hJSeq, 1)
}

func hJMkUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool, tag, role string) int64 {
	t.Helper()
	id := hJNextID()
	email := strings.ToLower(fmt.Sprintf("hj-%d-%s@example.test", id, tag))
	uname := strings.ToLower(fmt.Sprintf("hj-%d-%s", id, tag))
	code := fmt.Sprintf("j%05d", id%100000)
	var got int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (id, name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ($1,$2,$3,$4,'x',$5,$6,NOW(),NOW()) RETURNING id`,
		id, "hJ "+tag, uname, email, role, code).Scan(&got); err != nil {
		t.Fatalf("hJ seed user %s: %v", tag, err)
	}
	return got
}

func hJMkProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, ownerID int64, title string) int64 {
	t.Helper()
	var pid int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,$2,'open',10000000) RETURNING id`, ownerID, title).Scan(&pid); err != nil {
		t.Fatalf("hJ seed project: %v", err)
	}
	return pid
}

func hJMkDispute(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID, openedBy int64, title string) int64 {
	t.Helper()
	var did int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES ($1,$2,'quality',$3,'hJ desc','open') RETURNING id`, projectID, openedBy, title).Scan(&did); err != nil {
		t.Fatalf("hJ seed dispute: %v", err)
	}
	return did
}

func hJAdmin(t *testing.T, ctx context.Context, pool *pgxpool.Pool) roadmapCaller {
	t.Helper()
	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email='admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no admin")
	}
	return roadmapCaller{id: adminID, role: "admin", admin: true}
}

// hJCall serves a JSON handler with path values and a caller.
func hJCall(h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
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

func hJDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("hJ decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hJErr(t *testing.T, rec *httptest.ResponseRecorder, field, wantMsg string) {
	t.Helper()
	body := hJDecode(t, rec)
	errs, ok := body["errors"].(map[string]any)
	if !ok {
		t.Fatalf("hJ no errors object in %s", rec.Body.String())
	}
	items, ok := errs[field].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("hJ no errors[%s] in %s", field, rec.Body.String())
	}
	if items[0].(string) != wantMsg {
		t.Fatalf("hJ errors[%s][0] = %q want %q (%s)", field, items[0].(string), wantMsg, rec.Body.String())
	}
}

func hJContains(s, sub string) bool {
	return strings.Contains(s, sub)
}
