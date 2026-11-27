package httpapi

// hL admin batches, brief gates and role promotion: grouped-query happy
// rows with literal counts, closed-pool error twins, and the role-create
// leg of the PG role endpoint.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHLAdminProjectBatches(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	admin := hLAdmin(t)

	// One pending bid, one open dispute and one payment leg on the hL
	// project: every grouped query returns a row.
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, status)
		VALUES ($1,'arsitek',$2,$3,$3,'pending')`, fx.projectID, fx.stranger.id, hLArsitekProfileID); err != nil {
		t.Fatalf("seed bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
		VALUES ($1,$2,'quality','hL batch dispute','hL desc','open')`, fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("seed dispute: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, reference_id)
		VALUES ($1,'payment',1000,'hL pay',1)`, fx.projectID); err != nil {
		t.Fatalf("seed ledger: %v", err)
	}
	rec := hLAdminGet(t, AdminProjectsHandler(pool), "/api/admin/projects?search=hL+Tower", &admin)
	if rec.Code != http.StatusOK {
		t.Fatalf("projects = %d %s", rec.Code, rec.Body.String())
	}
	counts, err := adminBidCountsBatch(ctx, pool, []int64{fx.projectID})
	if err != nil {
		t.Fatalf("bid counts: %v", err)
	}
	if counts[fx.projectID].total != 1 || counts[fx.projectID].pending != 1 {
		t.Fatalf("bid counts = %v", counts[fx.projectID])
	}
	disputes, err := adminDisputesBatch(ctx, pool, []int64{fx.projectID})
	if err != nil {
		t.Fatalf("disputes: %v", err)
	}
	if disputes[fx.projectID].title != "hL batch dispute" {
		t.Fatalf("dispute row = %v", disputes[fx.projectID])
	}
	ledger, err := adminLedgerBatch(ctx, pool, []int64{fx.projectID})
	if err != nil {
		t.Fatalf("ledger: %v", err)
	}
	if ledger[fx.projectID].paid != 100000 {
		t.Fatalf("ledger paid = %v", ledger[fx.projectID])
	}
	if out, err := adminLedgerBatch(ctx, pool, nil); err != nil || len(out) != 0 {
		t.Fatalf("ledger empty = %v %v", out, err)
	}

	// Closed-pool error twins for the grouped queries.
	closed := testPool(t)
	closed.Close()
	if _, err := adminBidCountsBatch(ctx, closed, []int64{fx.projectID}); err == nil {
		t.Fatalf("bid counts closed ok")
	}
	if _, err := adminDisputesBatch(ctx, closed, []int64{fx.projectID}); err == nil {
		t.Fatalf("disputes closed ok")
	}
	if _, err := adminLedgerBatch(ctx, closed, []int64{fx.projectID}); err == nil {
		t.Fatalf("ledger closed ok")
	}
	if _, err := adminUserRolesBatch(ctx, closed, []int64{fx.owner.id}); err == nil {
		t.Fatalf("roles closed ok")
	}
}

func TestHLBriefGates(t *testing.T) {
	pool := hLPool(t)
	fx := hLSetup(t, pool)
	p := hLProjectPath(fx.projectID)

	// Anonymous on every brief route is a 401 pin.
	if rec := hLCall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("approve anon = %d", rec.Code)
	}
	if rec := hLCall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"hL"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("revise anon = %d", rec.Code)
	}
	if rec := hLCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("lock anon = %d", rec.Code)
	}
	if rec := hLCall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"arsitek"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("kickoff anon = %d", rec.Code)
	}
	if rec := hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"arsitek"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("review anon = %d", rec.Code)
	}
	// Missing projects are 404 model pins on every brief route.
	missing := map[string]string{"project": "19999985"}
	for _, tc := range []struct {
		name string
		rec  *httptest.ResponseRecorder
	}{
		{"approve", hLCall(t, ApproveConstructionBriefHandler(pool), http.MethodPost, "/x", "", &fx.owner, missing)},
		{"revise", hLCall(t, ReviseConstructionBriefHandler(pool), http.MethodPost, "/x", `{"notes":"hL"}`, &fx.owner, missing)},
		{"lock", hLCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"design"}`, &fx.owner, missing)},
		{"kickoff", hLCall(t, IssueKickoffHandler(pool), http.MethodPost, "/x", `{"role":"arsitek"}`, &fx.owner, missing)},
		{"review", hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"arsitek"}`, &fx.owner, missing)},
	} {
		if tc.rec.Code != http.StatusNotFound {
			t.Fatalf("%s missing = %d %s", tc.name, tc.rec.Code, tc.rec.Body.String())
		}
		if !strings.Contains(tc.rec.Body.String(), "No query results for model") {
			t.Fatalf("%s missing body = %s", tc.name, tc.rec.Body.String())
		}
	}
	// projectPathID without a bound value falls back to the URL tail for
	// id-last routes (conversations show/send pin that shape); a brief
	// action URL ends in the action, so the tail is not a project id.
	tailReq := httptest.NewRequest(http.MethodGet, "/api/conversations/1032001", nil)
	if id, raw := projectPathID(tailReq); id != 1032001 || raw != "1032001" {
		t.Fatalf("path tail = %d %q", id, raw)
	}
	badReq := httptest.NewRequest(http.MethodPost, "/api/projects/wizard/approve", nil)
	if id, _ := projectPathID(badReq); id != 0 {
		t.Fatalf("path bad = %d", id)
	}
	// renderProjectAnswer twins: missing project 404, dead pool 500.
	missingRec := httptest.NewRecorder()
	renderProjectAnswer(context.Background(), pool, missingRec, 19999986, &projectViewer{}, projectLoad{})
	if missingRec.Code != http.StatusNotFound {
		t.Fatalf("answer missing = %d", missingRec.Code)
	}
	closed := testPool(t)
	closed.Close()
	deadRec := httptest.NewRecorder()
	renderProjectAnswer(context.Background(), closed, deadRec, fx.projectID, &projectViewer{}, projectLoad{})
	if deadRec.Code != http.StatusInternalServerError {
		t.Fatalf("answer closed = %d", deadRec.Code)
	}
	// projectOwnerOrPM nil viewer is false (pure gate twin).
	if projectOwnerOrPM(nil, nil, nil) {
		t.Fatalf("nil viewer owner")
	}
}

func TestHLAdminRoleCreate(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	admin := hLAdmin(t)

	// Promote the stranger to civil: the roles row is created when the
	// guard/name pair is absent (best-effort cleanup afterwards).
	var before int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM roles WHERE name='civil' AND guard_name='web'`).Scan(&before)
	rec := hLCall(t, AdminUpdateUserRolePGHandler(pool), http.MethodPatch, "/x", `{"role_type":"civil"}`, &admin,
		map[string]string{"user": int64String(fx.stranger.id)})
	if rec.Code != http.StatusOK {
		t.Fatalf("role civil = %d %s", rec.Code, rec.Body.String())
	}
	var role string
	_ = pool.QueryRow(ctx, `SELECT role_type::text FROM users WHERE id=$1`, fx.stranger.id).Scan(&role)
	if role != "civil" {
		t.Fatalf("role = %q", role)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET role_type='user' WHERE id=$1`, fx.stranger.id); err != nil {
		t.Fatalf("restore role: %v", err)
	}
	var after int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM roles WHERE name='civil' AND guard_name='web'`).Scan(&after)
	if after != 1 {
		t.Fatalf("civil role rows = %d", after)
	}
}
