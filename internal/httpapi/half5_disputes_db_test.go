package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHalfDisputes(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var ownerID, otherID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half2DispOwn','half2dispown','half2dispown@example.test','x','user','H2DO1',NOW(),NOW()) RETURNING id`).Scan(&ownerID); err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, ownerID)
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half2DispOut','half2dispout','half2dispout@example.test','x','user','H2DX1',NOW(),NOW()) RETURNING id`).Scan(&otherID); err != nil {
		t.Fatalf("seed other: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, otherID)
	var projectID int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status) VALUES ($1,'Half2 Dispute Project','open') RETURNING id`, ownerID).Scan(&projectID); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, projectID)
	defer pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, projectID)
	defer pool.Exec(ctx, `DELETE FROM notifications WHERE user_id IN ($1,$2)`, ownerID, otherID)
	defer pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, projectID)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, projectID)

	owner := roadmapCaller{id: ownerID, role: "user"}
	outsider := roadmapCaller{id: otherID, role: "user"}
	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email='admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no admin")
	}
	admin := roadmapCaller{id: adminID, role: "admin", admin: true}

	withProject := func(r *http.Request, pid int64) *http.Request {
		r.SetPathValue("project", itoaTest(pid))
		return r
	}
	// Index: unauth, outsider forbidden, owner ok
	recU := httptest.NewRecorder()
	rU := withProject(httptest.NewRequest(http.MethodGet, "/api/projects/1/disputes", nil), projectID)
	ProjectDisputesIndexHandler(pool)(recU, rU)
	if recU.Code != http.StatusUnauthorized {
		t.Fatalf("index unauth = %d %s", recU.Code, recU.Body.String())
	}
	rF := withProject(httptest.NewRequest(http.MethodGet, "/api/projects/1/disputes", nil), projectID)
	rF = rF.WithContext(withCaller(rF.Context(), outsider))
	recF := httptest.NewRecorder()
	ProjectDisputesIndexHandler(pool)(recF, rF)
	if recF.Code != http.StatusForbidden {
		t.Fatalf("index forbidden = %d %s", recF.Code, recF.Body.String())
	}
	rO := withProject(httptest.NewRequest(http.MethodGet, "/api/projects/1/disputes", nil), projectID)
	rO = rO.WithContext(withCaller(rO.Context(), owner))
	recO := httptest.NewRecorder()
	ProjectDisputesIndexHandler(pool)(recO, rO)
	if recO.Code != http.StatusOK {
		t.Fatalf("index owner = %d %s", recO.Code, recO.Body.String())
	}
	// Store validation
	for _, tc := range []struct {
		name string
		body string
		code int
	}{
		{"missing", `{}`, 422},
		{"mismatch-pay", `{"category":"payment","title":"T","description":"D","payment_type":"arsitek_bid"}`, 422},
	} {
		r := withProject(httptest.NewRequest(http.MethodPost, "/api/projects/1/disputes", strings.NewReader(tc.body)), projectID)
		r = r.WithContext(withCaller(r.Context(), owner))
		rr := httptest.NewRecorder()
		ProjectDisputeStoreHandler(pool)(rr, r)
		if rr.Code != tc.code {
			t.Fatalf("store %s = %d want %d (%s)", tc.name, rr.Code, tc.code, rr.Body.String())
		}
	}
	// Store happy
	rS := withProject(httptest.NewRequest(http.MethodPost, "/api/projects/1/disputes", strings.NewReader(`{"category":"quality","title":"Half2 Title","description":"Half2 description of dispute"}`)), projectID)
	rS = rS.WithContext(withCaller(rS.Context(), owner))
	recS := httptest.NewRecorder()
	ProjectDisputeStoreHandler(pool)(recS, rS)
	if recS.Code != http.StatusCreated {
		t.Fatalf("store ok = %d %s", recS.Code, recS.Body.String())
	}
	// duplicate open -> 409
	rD := withProject(httptest.NewRequest(http.MethodPost, "/api/projects/1/disputes", strings.NewReader(`{"category":"quality","title":"Again","description":"Again desc"}`)), projectID)
	rD = rD.WithContext(withCaller(rD.Context(), owner))
	recD := httptest.NewRecorder()
	ProjectDisputeStoreHandler(pool)(recD, rD)
	if recD.Code != http.StatusConflict {
		t.Fatalf("store dup = %d %s", recD.Code, recD.Body.String())
	}
	var disputeID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM project_disputes WHERE project_id=$1 AND status='open' LIMIT 1`, projectID).Scan(&disputeID); err != nil {
		t.Fatalf("dispute id: %v", err)
	}
	// Show: bad, missing, forbidden, happy
	rSB := withProject(httptest.NewRequest(http.MethodGet, "/x", nil), projectID)
	rSB.SetPathValue("dispute", "abc")
	rSB = rSB.WithContext(withCaller(rSB.Context(), owner))
	recSB := httptest.NewRecorder()
	ProjectDisputeShowHandler(pool)(recSB, rSB)
	if recSB.Code != http.StatusNotFound {
		t.Fatalf("show bad = %d", recSB.Code)
	}
	rSM := withProject(httptest.NewRequest(http.MethodGet, "/x", nil), projectID)
	rSM.SetPathValue("dispute", "99009999")
	rSM = rSM.WithContext(withCaller(rSM.Context(), owner))
	recSM := httptest.NewRecorder()
	ProjectDisputeShowHandler(pool)(recSM, rSM)
	if recSM.Code != http.StatusNotFound {
		t.Fatalf("show missing = %d", recSM.Code)
	}
	rSF := withProject(httptest.NewRequest(http.MethodGet, "/x", nil), projectID)
	rSF.SetPathValue("dispute", itoaTest(disputeID))
	rSF = rSF.WithContext(withCaller(rSF.Context(), outsider))
	recSF := httptest.NewRecorder()
	ProjectDisputeShowHandler(pool)(recSF, rSF)
	if recSF.Code != http.StatusForbidden {
		t.Fatalf("show forbidden = %d", recSF.Code)
	}
	rSH := withProject(httptest.NewRequest(http.MethodGet, "/x", nil), projectID)
	rSH.SetPathValue("dispute", itoaTest(disputeID))
	rSH = rSH.WithContext(withCaller(rSH.Context(), owner))
	recSH := httptest.NewRecorder()
	ProjectDisputeShowHandler(pool)(recSH, rSH)
	if recSH.Code != http.StatusOK {
		t.Fatalf("show ok = %d %s", recSH.Code, recSH.Body.String())
	}
	// User reply: validation + happy
	rRV := withProject(httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{}`)), projectID)
	rRV.SetPathValue("dispute", itoaTest(disputeID))
	rRV = rRV.WithContext(withCaller(rRV.Context(), owner))
	recRV := httptest.NewRecorder()
	ProjectDisputeReplyHandler(pool)(recRV, rRV)
	if recRV.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply invalid = %d %s", recRV.Code, recRV.Body.String())
	}
	rRH := withProject(httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":"Half2 user reply"}`)), projectID)
	rRH.SetPathValue("dispute", itoaTest(disputeID))
	rRH = rRH.WithContext(withCaller(rRH.Context(), owner))
	recRH := httptest.NewRecorder()
	ProjectDisputeReplyHandler(pool)(recRH, rRH)
	if recRH.Code != http.StatusOK && recRH.Code != http.StatusCreated {
		t.Fatalf("reply ok = %d %s", recRH.Code, recRH.Body.String())
	}
	// Admin list + show
	for _, path := range []string{"/api/admin/disputes", "/api/admin/disputes?status=open", "/api/admin/disputes?status=bogus", "/api/admin/disputes?page=abc"} {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		AdminDisputesHandler(pool)(rr, r)
		if rr.Code != http.StatusOK {
			t.Fatalf("admin list %s = %d %s", path, rr.Code, rr.Body.String())
		}
	}
	rAS := httptest.NewRequest(http.MethodGet, "/api/admin/disputes/abc", nil)
	rAS.SetPathValue("dispute", "abc")
	recAS := httptest.NewRecorder()
	AdminDisputeShowHandler(pool)(recAS, rAS)
	if recAS.Code != http.StatusNotFound {
		t.Fatalf("admin show bad = %d", recAS.Code)
	}
	rASM := httptest.NewRequest(http.MethodGet, "/api/admin/disputes/99009999", nil)
	rASM.SetPathValue("dispute", "99009999")
	recASM := httptest.NewRecorder()
	AdminDisputeShowHandler(pool)(recASM, rASM)
	if recASM.Code != http.StatusNotFound {
		t.Fatalf("admin show missing = %d", recASM.Code)
	}
	rASH := httptest.NewRequest(http.MethodGet, "/api/admin/disputes/1", nil)
	rASH.SetPathValue("dispute", itoaTest(disputeID))
	recASH := httptest.NewRecorder()
	AdminDisputeShowHandler(pool)(recASH, rASH)
	if recASH.Code != http.StatusOK {
		t.Fatalf("admin show ok = %d %s", recASH.Code, recASH.Body.String())
	}
	// Admin reply: unauth, bad id, invalid, missing, happy
	recAU := httptest.NewRecorder()
	rAU := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":"hi"}`))
	rAU.SetPathValue("dispute", itoaTest(disputeID))
	AdminDisputeReplyHandler(pool)(recAU, rAU)
	if recAU.Code != http.StatusUnauthorized {
		t.Fatalf("admin reply unauth = %d", recAU.Code)
	}
	rAB := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":"hi"}`))
	rAB.SetPathValue("dispute", "zzz")
	rAB = rAB.WithContext(withCaller(rAB.Context(), admin))
	recAB := httptest.NewRecorder()
	AdminDisputeReplyHandler(pool)(recAB, rAB)
	if recAB.Code != http.StatusNotFound {
		t.Fatalf("admin reply bad = %d", recAB.Code)
	}
	rAI := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{}`))
	rAI.SetPathValue("dispute", itoaTest(disputeID))
	rAI = rAI.WithContext(withCaller(rAI.Context(), admin))
	recAI := httptest.NewRecorder()
	AdminDisputeReplyHandler(pool)(recAI, rAI)
	if recAI.Code != http.StatusUnprocessableEntity {
		t.Fatalf("admin reply invalid = %d", recAI.Code)
	}
	rAM := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":"admin hi"}`))
	rAM.SetPathValue("dispute", "99009999")
	rAM = rAM.WithContext(withCaller(rAM.Context(), admin))
	recAM := httptest.NewRecorder()
	AdminDisputeReplyHandler(pool)(recAM, rAM)
	if recAM.Code != http.StatusNotFound {
		t.Fatalf("admin reply missing = %d", recAM.Code)
	}
	rAH := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":"Half2 admin reply"}`))
	rAH.SetPathValue("dispute", itoaTest(disputeID))
	rAH = rAH.WithContext(withCaller(rAH.Context(), admin))
	recAH := httptest.NewRecorder()
	AdminDisputeReplyHandler(pool)(recAH, rAH)
	if recAH.Code != http.StatusOK && recAH.Code != http.StatusCreated {
		t.Fatalf("admin reply ok = %d %s", recAH.Code, recAH.Body.String())
	}
	// Admin act validation branches
	for _, tc := range []struct {
		name string
		id   string
		body string
		code int
	}{
		{"badid", "zzz", `{"action":"dismiss"}`, 404},
		{"unauth", itoaTest(disputeID), `{"action":"dismiss"}`, 401},
		{"missing-action", itoaTest(disputeID), `{}`, 422},
		{"invalid-action", itoaTest(disputeID), `{"action":"bogus"}`, 422},
		{"missing-row", "99009999", `{"action":"dismiss"}`, 404},
		{"custom-needs-notes", itoaTest(disputeID), `{"action":"custom"}`, 422},
		{"refund-needs-amount", itoaTest(disputeID), `{"action":"record_refund"}`, 422},
	} {
		r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(tc.body))
		r.SetPathValue("dispute", tc.id)
		if tc.name != "unauth" {
			r = r.WithContext(withCaller(r.Context(), admin))
		}
		rr := httptest.NewRecorder()
		AdminDisputeActHandler(pool)(rr, r)
		if rr.Code != tc.code {
			t.Fatalf("act %s = %d want %d (%s)", tc.name, rr.Code, tc.code, rr.Body.String())
		}
	}
	// dismiss happy (closes dispute)
	rAD := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"dismiss","notes":"Half2 dismiss"}`))
	rAD.SetPathValue("dispute", itoaTest(disputeID))
	rAD = rAD.WithContext(withCaller(rAD.Context(), admin))
	recAD := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(recAD, rAD)
	if recAD.Code != http.StatusOK {
		t.Fatalf("act dismiss = %d %s", recAD.Code, recAD.Body.String())
	}
	// acting again -> already closed
	rAC := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"dismiss"}`))
	rAC.SetPathValue("dispute", itoaTest(disputeID))
	rAC = rAC.WithContext(withCaller(rAC.Context(), admin))
	recAC := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(recAC, rAC)
	if recAC.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act closed = %d %s", recAC.Code, recAC.Body.String())
	}
	// evidence handlers: unauth first, then bad ids with admin caller
	rE1 := httptest.NewRequest(http.MethodGet, "/x", nil)
	rE1.SetPathValue("dispute", itoaTest(disputeID))
	recE1 := httptest.NewRecorder()
	AdminDisputeEvidenceHandler(pool)(recE1, rE1)
	if recE1.Code != http.StatusUnauthorized {
		t.Fatalf("admin evidence unauth = %d", recE1.Code)
	}
	rE1b := httptest.NewRequest(http.MethodGet, "/x", nil)
	rE1b.SetPathValue("dispute", "99009999")
	rE1b.SetPathValue("message", "99009999")
	rE1b = rE1b.WithContext(withCaller(rE1b.Context(), admin))
	recE1b := httptest.NewRecorder()
	AdminDisputeEvidenceHandler(pool)(recE1b, rE1b)
	if recE1b.Code != http.StatusNotFound {
		t.Fatalf("admin evidence missing = %d", recE1b.Code)
	}
	rE2 := httptest.NewRequest(http.MethodGet, "/x", nil)
	rE2.SetPathValue("project", itoaTest(projectID))
	rE2.SetPathValue("dispute", itoaTest(disputeID))
	recE2 := httptest.NewRecorder()
	ProjectDisputeEvidenceHandler(pool)(recE2, rE2)
	if recE2.Code != http.StatusUnauthorized {
		t.Fatalf("project evidence unauth = %d", recE2.Code)
	}
	rE2b := httptest.NewRequest(http.MethodGet, "/x", nil)
	rE2b.SetPathValue("project", itoaTest(projectID))
	rE2b.SetPathValue("dispute", itoaTest(disputeID))
	rE2b.SetPathValue("message", "99009999")
	rE2b = rE2b.WithContext(withCaller(rE2b.Context(), owner))
	recE2b := httptest.NewRecorder()
	ProjectDisputeEvidenceHandler(pool)(recE2b, rE2b)
	if recE2b.Code != http.StatusNotFound {
		t.Fatalf("project evidence missing = %d", recE2b.Code)
	}
	// withdraw on closed dispute (need fresh open dispute for happy withdraw)
	var project2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status) VALUES ($1,'Half2 Withdraw Project','open') RETURNING id`, ownerID).Scan(&project2); err != nil {
		t.Fatalf("seed p2: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, project2)
	defer pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, project2)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, project2)
	rS2 := withProject(httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"category":"quality","title":"W Title","description":"W description"}`)), project2)
	rS2 = rS2.WithContext(withCaller(rS2.Context(), owner))
	recS2 := httptest.NewRecorder()
	ProjectDisputeStoreHandler(pool)(recS2, rS2)
	if recS2.Code != http.StatusCreated {
		t.Fatalf("store p2 = %d %s", recS2.Code, recS2.Body.String())
	}
	var wdID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_disputes WHERE project_id=$1 AND status='open' LIMIT 1`, project2).Scan(&wdID)
	rWU := httptest.NewRequest(http.MethodPost, "/x", nil)
	rWU.SetPathValue("project", itoaTest(project2))
	rWU.SetPathValue("dispute", itoaTest(wdID))
	recWU := httptest.NewRecorder()
	ProjectDisputeWithdrawHandler(pool)(recWU, rWU)
	if recWU.Code != http.StatusUnauthorized {
		t.Fatalf("withdraw unauth = %d", recWU.Code)
	}
	rW := httptest.NewRequest(http.MethodPost, "/x", nil)
	rW.SetPathValue("project", itoaTest(project2))
	rW.SetPathValue("dispute", itoaTest(wdID))
	rW = rW.WithContext(withCaller(rW.Context(), owner))
	recW := httptest.NewRecorder()
	ProjectDisputeWithdrawHandler(pool)(recW, rW)
	if recW.Code != http.StatusOK {
		t.Fatalf("withdraw ok = %d %s", recW.Code, recW.Body.String())
	}
	_ = admin
}
