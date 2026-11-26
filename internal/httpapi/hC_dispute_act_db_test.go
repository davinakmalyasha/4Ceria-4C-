package httpapi

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

var hCSeq int64 = 930000

func hCIDs(prefix string) (email, uname, code string) {
	v := atomic.AddInt64(&hCSeq, 1)
	// unique_code max 6 chars
	code = fmt.Sprintf("hC%04d", v%10000)
	email = strings.ToLower(fmt.Sprintf("%s-%s@example.test", prefix, code))
	uname = strings.ToLower(fmt.Sprintf("%s-%s", prefix, code))
	return email, uname, code
}

func hCMkUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool, tag, role string) int64 {
	t.Helper()
	email, uname, code := hCIDs("hC-" + tag)
	// ensure code uniqueness across parallel runs: append retry on conflict
	var id int64
	for i := 0; i < 5; i++ {
		err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ($1,$2,$3,'x',$4,$5,NOW(),NOW()) RETURNING id`, "hC "+tag, uname, email, role, code).Scan(&id)
		if err == nil {
			return id
		}
		// collision on code: bump
		email, uname, code = hCIDs("hC-" + tag + "-r")
	}
	t.Fatalf("seed user %s: failed after retries", tag)
	return 0
}

func hCMkProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, ownerID int64, title string) int64 {
	t.Helper()
	var pid int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,$2,'open',10000000) RETURNING id`, ownerID, title).Scan(&pid); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	return pid
}

func hCMkDispute(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID, openedBy int64, title string) int64 {
	t.Helper()
	var did int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES ($1,$2,'quality',$3,'hC desc','open') RETURNING id`, projectID, openedBy, title).Scan(&did); err != nil {
		t.Fatalf("seed dispute: %v", err)
	}
	return did
}

func hCAdmin(t *testing.T, ctx context.Context, pool *pgxpool.Pool) roadmapCaller {
	t.Helper()
	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email='admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no admin")
	}
	return roadmapCaller{id: adminID, role: "admin", admin: true}
}

func hCCallAct(pool *pgxpool.Pool, caller *roadmapCaller, disputeID, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
	r.SetPathValue("dispute", disputeID)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(rec, r)
	return rec
}

func hCDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func hCErrors(t *testing.T, rec *httptest.ResponseRecorder, field, wantMsg string) {
	t.Helper()
	body := hCDecode(t, rec)
	errs, ok := body["errors"].(map[string]any)
	if !ok {
		t.Fatalf("no errors object in %s", rec.Body.String())
	}
	items, ok := errs[field].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("no errors[%s] in %s", field, rec.Body.String())
	}
	if items[0].(string) != wantMsg {
		t.Fatalf("errors[%s][0] = %q want %q (%s)", field, items[0].(string), wantMsg, rec.Body.String())
	}
	// NOTE: body["message"] is the summarize() of ALL errors ("first (and N more)").
	// Callers assert the exact summarized literal separately when multiple
	// fields fail; single-error callers assert message == wantMsg themselves.
}

func TestHCDisputeActValidation(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hCAdmin(t, ctx, pool)
	owner := hCMkUser(t, ctx, pool, "actvown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hCMkProject(t, ctx, pool, owner, "hC Act Validation Project")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
		pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	did := hCMkDispute(t, ctx, pool, pid, owner, "hC Act Validation")
	longNotes := strings.Repeat("n", 5001)

	cases := []struct {
		name  string
		id    string
		body  string
		code  int
		with  *roadmapCaller
		field string
		msg   string
	}{
		{"unauth", itoaTest(did), `{"action":"dismiss"}`, 401, nil, "", ""},
		{"badid", "hC-bad", `{"action":"dismiss"}`, 404, &admin, "", ""},
		{"missing-action", itoaTest(did), `{}`, 422, &admin, "action", "The action field is required."},
		{"invalid-action", itoaTest(did), `{"action":"bogus"}`, 422, &admin, "action", "The selected action is invalid."},
		{"notes-nonstring", itoaTest(did), `{"action":"dismiss","notes":123}`, 422, &admin, "notes", "The notes field must be a string."},
		{"notes-toolong", itoaTest(did), `{"action":"dismiss","notes":"` + longNotes + `"}`, 422, &admin, "notes", "The notes field must not be greater than 5000 characters."},
		{"amount-nonnumeric", itoaTest(did), `{"action":"record_refund","notes":"x","amount":"abc"}`, 422, &admin, "amount", "The amount field must be a number."},
		{"amount-toosmall", itoaTest(did), `{"action":"record_refund","notes":"x","amount":0}`, 422, &admin, "amount", "The amount field must be at least 0.01."},
		{"amount-toobig", itoaTest(did), `{"action":"record_refund","notes":"x","amount":1000000000000000}`, 422, &admin, "amount", "The amount field must not be greater than 999999999999999."},
		{"custom-needs-notes", itoaTest(did), `{"action":"custom"}`, 422, &admin, "", "Resolution notes are required for a custom resolution."},
		{"custom-empty-notes", itoaTest(did), `{"action":"custom","notes":""}`, 422, &admin, "", "Resolution notes are required for a custom resolution."},
		{"refund-needs-amount", itoaTest(did), `{"action":"record_refund","notes":"x"}`, 422, &admin, "", "A positive refund amount is required."},
		{"missing-row", "99009999", `{"action":"dismiss"}`, 404, &admin, "", ""},
	}
	for _, tc := range cases {
		rec := hCCallAct(pool, tc.with, tc.id, tc.body)
		if rec.Code != tc.code {
			t.Fatalf("act %s = %d want %d (%s)", tc.name, rec.Code, tc.code, rec.Body.String())
		}
		if tc.code == 401 {
			if got := hCDecode(t, rec)["message"].(string); got != "Unauthenticated." {
				t.Fatalf("act %s message = %q", tc.name, got)
			}
		}
		if tc.code == 404 {
			if !contains(rec.Body.String(), "No query results for model") {
				t.Fatalf("act %s 404 body = %s", tc.name, rec.Body.String())
			}
		}
		if tc.field != "" {
			hCErrors(t, rec, tc.field, tc.msg)
			// Single-field validation: summarize() == the lone error (literals)
			if got := hCDecode(t, rec)["message"].(string); got != tc.msg {
				t.Fatalf("act %s message = %q want %q", tc.name, got, tc.msg)
			}
		}
		if tc.name == "custom-needs-notes" || tc.name == "custom-empty-notes" || tc.name == "refund-needs-amount" {
			if got := hCDecode(t, rec)["message"].(string); got != tc.msg {
				t.Fatalf("act %s message = %q want %q", tc.name, got, tc.msg)
			}
		}
		// Rejection twin invariant: failed validation must not close the dispute
		var st string
		_ = pool.QueryRow(ctx, `SELECT status::text FROM project_disputes WHERE id=$1`, did).Scan(&st)
		if st != "open" {
			t.Fatalf("act %s mutated dispute to %s", tc.name, st)
		}
	}

	// Closed-thread path: dismiss happy then act again -> 422 already closed
	recD := hCCallAct(pool, &admin, itoaTest(did), `{"action":"dismiss","notes":"hC close"}`)
	if recD.Code != http.StatusOK {
		t.Fatalf("dismiss happy = %d %s", recD.Code, recD.Body.String())
	}
	// Happy post-state — literals hand-written from fixtures
	if got := hCDecode(t, recD)["message"].(string); got != "Dispute dismissed. Payments are unfrozen." {
		t.Fatalf("dismiss message = %q", got)
	}
	var st, res, notes string
	var resolvedBy int64
	if err := pool.QueryRow(ctx, `SELECT status::text, resolution::text, resolution_notes, resolved_by FROM project_disputes WHERE id=$1`, did).Scan(&st, &res, &notes, &resolvedBy); err != nil {
		t.Fatalf("dismiss row: %v", err)
	}
	if st != "dismissed" || res != "dismiss" || notes != "hC close" || resolvedBy != admin.id {
		t.Fatalf("dismiss row = %s %s %q %d want dismissed/dismiss/hC close/%d", st, res, notes, resolvedBy, admin.id)
	}
	var logN int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=$1 AND action='dispute_resolved'`, pid).Scan(&logN)
	if logN != 1 {
		t.Fatalf("dismiss logs = %d want 1", logN)
	}
	recC := hCCallAct(pool, &admin, itoaTest(did), `{"action":"dismiss"}`)
	if recC.Code != http.StatusUnprocessableEntity {
		t.Fatalf("closed = %d %s", recC.Code, recC.Body.String())
	}
	if got := hCDecode(t, recC)["message"].(string); got != "This dispute is already closed." {
		t.Fatalf("closed message = %q", got)
	}
}
