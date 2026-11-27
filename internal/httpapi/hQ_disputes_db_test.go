package httpapi

// hH dispute leftovers: the withdraw matrix (59%), user-thread twins
// (index/store/show/reply validation and binding paths) and the admin-act
// custom/terminate/amount branches.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hQCallWithdraw(pool *pgxpool.Pool, caller *roadmapCaller, project, dispute string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/x", nil)
	r.SetPathValue("project", project)
	r.SetPathValue("dispute", dispute)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	ProjectDisputeWithdrawHandler(pool)(rec, r)
	return rec
}

func TestHQDisputeWithdraw(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hQMkUser(t, ctx, pool, "wdrawn", "user")
	defer hQCleanupUser(ctx, pool, owner)
	member := hQMkUser(t, ctx, pool, "wdrplain", "arsitek")
	defer hQCleanupUser(ctx, pool, member)
	out := hQMkUser(t, ctx, pool, "wdrout", "user")
	defer hQCleanupUser(ctx, pool, out)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	memberCaller := &roadmapCaller{id: member, role: "arsitek"}
	outCaller := &roadmapCaller{id: out, role: "user"}
	admin := hCAdmin(t, ctx, pool)
	adminCaller := &admin

	pid := hQMkProject(t, ctx, pool, owner, "hH Withdraw Project")
	defer hQCleanupDisputeProject(ctx, pool, pid, owner)
	pid2 := hQMkProject(t, ctx, pool, owner, "hH Withdraw Project 2")
	defer hQCleanupDisputeProject(ctx, pool, pid2, owner)
	did := hQMkDispute(t, ctx, pool, pid, owner, "hH Withdraw D")
	did2 := hQMkDispute(t, ctx, pool, pid2, owner, "hH Withdraw D2")

	if rec := hQCallWithdraw(pool, nil, itoaTest(pid), itoaTest(did)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("withdraw unauth = %d", rec.Code)
	}
	rec := hQCallWithdraw(pool, ownerCaller, "hH-bad", itoaTest(did))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw bad project = %d", rec.Code)
	}
	if got := hCDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\Project] hH-bad` {
		t.Fatalf("withdraw bad project msg = %q", got)
	}
	rec = hQCallWithdraw(pool, ownerCaller, itoaTest(pid), "hH-bad")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw bad dispute = %d", rec.Code)
	}
	if got := hCDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\ProjectDispute] hH-bad` {
		t.Fatalf("withdraw bad dispute msg = %q", got)
	}
	if rec := hQCallWithdraw(pool, ownerCaller, "99009999", itoaTest(did)); rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw missing project = %d", rec.Code)
	}
	if rec := hQCallWithdraw(pool, ownerCaller, itoaTest(pid), "99009999"); rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw missing dispute = %d", rec.Code)
	}
	rec = hQCallWithdraw(pool, outCaller, itoaTest(pid), itoaTest(did))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("withdraw outsider = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Unauthorized. Only project participants can view disputes." {
		t.Fatalf("withdraw outsider msg = %q", got)
	}
	var memProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hH Mem',$2) RETURNING id`, member, "verified").Scan(&memProf)
	pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2 WHERE id=$1`, pid, memProf)
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, memProf)
	rec = hQCallWithdraw(pool, memberCaller, itoaTest(pid), itoaTest(did))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("withdraw non-opener = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Only the dispute opener can withdraw it." {
		t.Fatalf("withdraw non-opener msg = %q", got)
	}
	rec = hQCallWithdraw(pool, ownerCaller, itoaTest(pid), itoaTest(did2))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("withdraw cross = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Not found." {
		t.Fatalf("withdraw cross msg = %q", got)
	}
	pool.Exec(ctx, `UPDATE project_disputes SET status='dismissed' WHERE id=$1`, did)
	rec = hQCallWithdraw(pool, ownerCaller, itoaTest(pid), itoaTest(did))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("withdraw closed = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "This dispute is already closed." {
		t.Fatalf("withdraw closed msg = %q", got)
	}
	pool.Exec(ctx, `UPDATE project_disputes SET status='open' WHERE id=$1`, did)

	// Opener happy: owner withdraws their own dispute.
	rec = hQCallWithdraw(pool, ownerCaller, itoaTest(pid), itoaTest(did))
	if rec.Code != http.StatusOK {
		t.Fatalf("withdraw owner = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Dispute withdrawn. Payments are unfrozen." {
		t.Fatalf("withdraw owner msg = %q", got)
	}

	// Admin override: project owned by the admin, dispute opened by the
	// hired professional. The opener is not the caller but the admin flag
	// allows it (the participant gate still applies to the admin-owner).
	var pidA int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,'hQ Admin Project','open',10000000) RETURNING id`, admin.id).Scan(&pidA); err != nil {
		t.Fatalf("seed admin project: %v", err)
	}
	pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2 WHERE id=$1`, pidA, memProf)
	var didA int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES ($1,$2,'quality','hQ Admin D','hQ desc','open') RETURNING id`, pidA, member).Scan(&didA); err != nil {
		t.Fatalf("seed admin dispute: %v", err)
	}
	rec = hQCallWithdraw(pool, adminCaller, itoaTest(pidA), itoaTest(didA))
	if rec.Code != http.StatusOK {
		t.Fatalf("withdraw admin = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Dispute withdrawn. Payments are unfrozen." {
		t.Fatalf("withdraw admin msg = %q", got)
	}
	var status, resolution, notes string
	if err := pool.QueryRow(ctx, `SELECT status::text, resolution::text, resolution_notes FROM project_disputes WHERE id=$1`, didA).Scan(&status, &resolution, &notes); err != nil {
		t.Fatalf("withdraw row: %v", err)
	}
	if status != "withdrawn" || resolution != "withdrawn" || notes != "Withdrawn by the opener." {
		t.Fatalf("withdraw row = %q %q %q", status, resolution, notes)
	}
	var acted string
	if err := pool.QueryRow(ctx, `SELECT action::text FROM project_activity_logs WHERE project_id=$1 AND action='dispute_withdrawn'`, pidA).Scan(&acted); err != nil {
		t.Fatalf("withdraw log: %v", err)
	}
	if acted != "dispute_withdrawn" {
		t.Fatalf("withdraw log = %q", acted)
	}
	// Admin-project cleanup scoped to the dispute: the admin row itself is
	// seed data and is never touched.
	pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id=$1`, didA)
	pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pidA)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, didA)
	pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pidA)
	pool.Exec(ctx, `DELETE FROM notifications WHERE data::text LIKE '%"dispute_id":`+itoaTest(didA)+`}%'`)
}

func hQCallUserIndex(pool *pgxpool.Pool, caller *roadmapCaller, project string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.SetPathValue("project", project)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	ProjectDisputesIndexHandler(pool)(rec, r)
	return rec
}

func TestHQDisputeUserTwins(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hQMkUser(t, ctx, pool, "dutuown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}

	pid := hQMkProject(t, ctx, pool, owner, "hH User Twins Project")
	defer hQCleanupDisputeProject(ctx, pool, pid, owner)
	pid2 := hQMkProject(t, ctx, pool, owner, "hH User Twins Project 2")
	defer hQCleanupDisputeProject(ctx, pool, pid2, owner)
	did := hQMkDispute(t, ctx, pool, pid, owner, "hH User Twins D")

	rec := hQCallUserIndex(pool, ownerCaller, "hH-bad")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("index bad project = %d", rec.Code)
	}
	if got := hCDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\Project] hH-bad` {
		t.Fatalf("index bad msg = %q", got)
	}
	if rec := hQCallUserIndex(pool, ownerCaller, "99009999"); rec.Code != http.StatusNotFound {
		t.Fatalf("index missing project = %d", rec.Code)
	}

	rShow := httptest.NewRequest(http.MethodGet, "/x", nil)
	rShow.SetPathValue("project", itoaTest(pid2))
	rShow.SetPathValue("dispute", itoaTest(did))
	rShow = rShow.WithContext(withCaller(rShow.Context(), *ownerCaller))
	recShow := httptest.NewRecorder()
	ProjectDisputeShowHandler(pool)(recShow, rShow)
	if recShow.Code != http.StatusNotFound {
		t.Fatalf("show cross = %d %s", recShow.Code, recShow.Body.String())
	}
	if got := hCDecode(t, recShow)["message"].(string); got != "Not found." {
		t.Fatalf("show cross msg = %q", got)
	}
	rBad := httptest.NewRequest(http.MethodGet, "/x", nil)
	rBad.SetPathValue("project", "hH-bad")
	rBad.SetPathValue("dispute", itoaTest(did))
	rBad = rBad.WithContext(withCaller(rBad.Context(), *ownerCaller))
	recBad := httptest.NewRecorder()
	ProjectDisputeShowHandler(pool)(recBad, rBad)
	if recBad.Code != http.StatusNotFound {
		t.Fatalf("show bad project = %d", recBad.Code)
	}

	store := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
		r.SetPathValue("project", itoaTest(pid2))
		r = r.WithContext(withCaller(r.Context(), *ownerCaller))
		rec := httptest.NewRecorder()
		ProjectDisputeStoreHandler(pool)(rec, r)
		return rec
	}
	rec = store(`{"category":"bogus","title":"T","description":"D"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store category = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "category", "The selected category is invalid.")
	rec = store(`{"category":"quality","title":"","description":"D"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store title = %d", rec.Code)
	}
	hCErrors(t, rec, "title", "The title field is required.")
	rec = store(`{"category":"quality","title":"T","description":"D","payment_type":"bogus"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store paytype = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "payment_type", "The selected payment type is invalid.")
	rec = store(`{"category":"quality","title":"T","description":"D","payment_type":"termin"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store paypair = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "payment_type and payment_id must be provided together." {
		t.Fatalf("store paypair msg = %q", got)
	}
	rec = store(`{"category":"quality","title":"T","description":"D","disputed_amount":"abc"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store amount nan = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "disputed_amount", "The disputed amount field must be a number.")
	rec = store(`{"category":"quality","title":"T","description":"D","disputed_amount":-5}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store amount neg = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "disputed_amount", "The disputed amount field must be at least 0.")
	rec = store(`{"category":"quality","title":"T","description":"D","payment_id":"x"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store payid = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "payment_id", "The payment id field must be an integer.")
	rec = store(`{"category":"payment","title":"hH Pay D","description":"hH pay desc","payment_type":"termin","payment_id":7,"disputed_amount":"2500000"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store pay happy = %d %s", rec.Code, rec.Body.String())
	}
	payData := hCDecode(t, rec)["data"].(map[string]any)
	if payData["payment_type"].(string) != "termin" || payData["payment_id"].(float64) != 7 || payData["disputed_amount"].(float64) != 2500000 {
		t.Fatalf("store pay data = %v", payData)
	}
	var pTypeID, pID int64
	var pAmt string
	_ = pool.QueryRow(ctx, `SELECT payment_type_id, payment_id, disputed_amount::text FROM project_disputes WHERE project_id=$1 AND status='open'`, pid2).Scan(&pTypeID, &pID, &pAmt)
	if pID != 7 || pAmt != "2500000.00" {
		t.Fatalf("store pay row = %d %q", pID, pAmt)
	}
	var typeKey string
	_ = pool.QueryRow(ctx, `SELECT type_key FROM ledger_reference_types WHERE id=$1`, pTypeID).Scan(&typeKey)
	if typeKey == "" {
		t.Fatalf("store pay registry not linked")
	}

	pool.Exec(ctx, `UPDATE project_disputes SET status='dismissed' WHERE id=$1`, did)
	rClosed := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":"hH late"}`))
	rClosed.SetPathValue("project", itoaTest(pid))
	rClosed.SetPathValue("dispute", itoaTest(did))
	rClosed = rClosed.WithContext(withCaller(rClosed.Context(), *ownerCaller))
	recClosed := httptest.NewRecorder()
	ProjectDisputeReplyHandler(pool)(recClosed, rClosed)
	if recClosed.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply closed = %d %s", recClosed.Code, recClosed.Body.String())
	}
	if got := hCDecode(t, recClosed)["message"].(string); got != "This dispute is closed; the thread no longer accepts messages." {
		t.Fatalf("reply closed msg = %q", got)
	}
	pool.Exec(ctx, `UPDATE project_disputes SET status='open' WHERE id=$1`, did)

	rReplyBad := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":123}`))
	rReplyBad.SetPathValue("project", itoaTest(pid))
	rReplyBad.SetPathValue("dispute", itoaTest(did))
	rReplyBad = rReplyBad.WithContext(withCaller(rReplyBad.Context(), *ownerCaller))
	recReplyBad := httptest.NewRecorder()
	ProjectDisputeReplyHandler(pool)(recReplyBad, rReplyBad)
	if recReplyBad.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply body type = %d %s", recReplyBad.Code, recReplyBad.Body.String())
	}
	hCErrors(t, recReplyBad, "body", "The body field must be a string.")

	rReplyMiss := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"body":"hi"}`))
	rReplyMiss.SetPathValue("project", itoaTest(pid))
	rReplyMiss.SetPathValue("dispute", "99009999")
	rReplyMiss = rReplyMiss.WithContext(withCaller(rReplyMiss.Context(), *ownerCaller))
	recReplyMiss := httptest.NewRecorder()
	ProjectDisputeReplyHandler(pool)(recReplyMiss, rReplyMiss)
	if recReplyMiss.Code != http.StatusNotFound {
		t.Fatalf("reply missing = %d", recReplyMiss.Code)
	}

	for _, path := range []string{"/api/admin/disputes?status=resolved", "/api/admin/disputes?page=9999", "/api/admin/disputes?status=open&page=1"} {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		AdminDisputesHandler(pool)(rr, r)
		if rr.Code != http.StatusOK {
			t.Fatalf("admin list %s = %d %s", path, rr.Code, rr.Body.String())
		}
	}
}

func TestHQDisputeActExtra(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hQMkUser(t, ctx, pool, "actexown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	admin := hCAdmin(t, ctx, pool)
	adminCaller := &admin

	mkOpen := func(tag string) (pid, did int64) {
		pid = hQMkProject(t, ctx, pool, owner, "hH Act "+tag)
		did = hQMkDispute(t, ctx, pool, pid, owner, "hH Act D "+tag)
		return pid, did
	}

	pidA, didA := mkOpen("amt")
	defer hQCleanupDisputeProject(ctx, pool, pidA, owner)
	rec := hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":"record_refund","amount":"abc"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act amount nan = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "amount", "The amount field must be a number.")
	rec = hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":"record_refund","amount":-1}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act amount neg = %d", rec.Code)
	}
	hCErrors(t, rec, "amount", "The amount field must be at least 0.01.")
	rec = hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":"record_refund","amount":1000000000000000}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act amount big = %d", rec.Code)
	}
	hCErrors(t, rec, "amount", "The amount field must not be greater than 999999999999999.")
	rec = hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":"record_refund","amount":"150000"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act amount str = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Link the disputed payment before recording a refund. Without it the platform cannot tell which payment is being returned." {
		t.Fatalf("act amount str msg = %q", got)
	}
	rec = hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":"record_refund","amount":150000}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act refund nolink = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Link the disputed payment before recording a refund. Without it the platform cannot tell which payment is being returned." {
		t.Fatalf("act refund nolink msg = %q", got)
	}
	rec = hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":"release_payment"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act release nolink = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "This dispute has no linked payment to release. Use dismiss, refund, terminate, or custom." {
		t.Fatalf("act release nolink msg = %q", got)
	}
	rec = hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":"dismiss","notes":123}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act notes type = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "notes", "The notes field must be a string.")
	rec = hCCallAct(pool, adminCaller, itoaTest(didA), `{"action":123}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act action type = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "action", "The selected action is invalid.")

	pidT, didT := mkOpen("term")
	defer hQCleanupDisputeProject(ctx, pool, pidT, owner)
	rec = hCCallAct(pool, adminCaller, itoaTest(didT), `{"action":"terminate_project","notes":"hH force"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("act terminate = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Project force-terminated. Dispute closed." {
		t.Fatalf("act terminate msg = %q", got)
	}
	var pStatus, dStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id=$1`, pidT).Scan(&pStatus)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_disputes WHERE id=$1`, didT).Scan(&dStatus)
	if pStatus != "cancelled" || dStatus != "resolved" {
		t.Fatalf("act terminate row = %q %q", pStatus, dStatus)
	}

	pidC, didC := mkOpen("custom")
	defer hQCleanupDisputeProject(ctx, pool, pidC, owner)
	rec = hCCallAct(pool, adminCaller, itoaTest(didC), `{"action":"custom","notes":"hH bespoke outcome"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("act custom = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Dispute closed with custom resolution." {
		t.Fatalf("act custom msg = %q", got)
	}
	var resolution, resNotes string
	_ = pool.QueryRow(ctx, `SELECT resolution::text, resolution_notes FROM project_disputes WHERE id=$1`, didC).Scan(&resolution, &resNotes)
	if resolution != "custom" || resNotes != "hH bespoke outcome" {
		t.Fatalf("act custom row = %q %q", resolution, resNotes)
	}
}

func hQTextParts(fields map[string]string) (string, *bytes.Buffer) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	_ = mw.Close()
	return mw.FormDataContentType(), &buf
}

func TestHQDisputeRawFallbacks(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hQMkUser(t, ctx, pool, "rawown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	admin := hCAdmin(t, ctx, pool)
	adminCaller := &admin
	pid := hQMkProject(t, ctx, pool, owner, "hQ Raw Project")
	defer hQCleanupDisputeProject(ctx, pool, pid, owner)
	did := hQMkDispute(t, ctx, pool, pid, owner, "hQ Raw D")
	pid2 := hQMkProject(t, ctx, pool, owner, "hQ Raw Project 2")
	defer hQCleanupDisputeProject(ctx, pool, pid2, owner)
	did2 := hQMkDispute(t, ctx, pool, pid2, owner, "hQ Raw D2")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN ($1,$2)`, did, did2)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE id IN ($1,$2)`, did, did2)
	}()

	// Admin reply with a text-only evidence part — must-be-a-file 422, no insert
	ct, body := hQTextParts(map[string]string{"body": "hQ reply", "evidence": "not a file"})
	rr := httptest.NewRequest(http.MethodPost, "/x", body)
	rr.Header.Set("Content-Type", ct)
	rr.SetPathValue("dispute", itoaTest(did))
	rr = rr.WithContext(withCaller(rr.Context(), *adminCaller))
	recR := httptest.NewRecorder()
	AdminDisputeReplyHandler(pool)(recR, rr)
	if recR.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply text evidence = %d %s", recR.Code, recR.Body.String())
	}
	hCErrors(t, recR, "evidence", "The evidence field must be a file.")
	var msgCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM dispute_messages WHERE dispute_id=$1`, did).Scan(&msgCount)
	if msgCount != 0 {
		t.Fatalf("reply text-evidence inserted: %d", msgCount)
	}

	// Act through the raw URL tail (no mux capture) — dismiss happy
	r := httptest.NewRequest(http.MethodPost, "/x/"+itoaTest(did), strings.NewReader(`{"action":"dismiss","notes":"hQ raw"}`))
	r = r.WithContext(withCaller(r.Context(), *adminCaller))
	rec := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("act raw url = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Dispute dismissed. Payments are unfrozen." {
		t.Fatalf("act raw url msg = %q", got)
	}

	// Act malformed JSON — invalid-data 422 pin
	r3 := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{oops`))
	r3.SetPathValue("dispute", itoaTest(did2))
	r3 = r3.WithContext(withCaller(r3.Context(), *adminCaller))
	rec3 := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(rec3, r3)
	if rec3.Code != http.StatusUnprocessableEntity {
		t.Fatalf("act malformed = %d %s", rec3.Code, rec3.Body.String())
	}
	if got := hQDecode(t, rec3)["message"].(string); got != "The given data was invalid." {
		t.Fatalf("act malformed msg = %q", got)
	}

	// Act missing row — model 404 pin (never 500)
	r2 := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"dismiss"}`))
	r2.SetPathValue("dispute", "99009999")
	r2 = r2.WithContext(withCaller(r2.Context(), *adminCaller))
	rec2 := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(rec2, r2)
	if rec2.Code != http.StatusNotFound {
		t.Fatalf("act missing = %d", rec2.Code)
	}
	if got := hQDecode(t, rec2)["message"].(string); got != `No query results for model [App\Models\ProjectDispute] 99009999` {
		t.Fatalf("act missing msg = %q", got)
	}

	// Withdraw with the project bound from the raw URL tail
	rw := httptest.NewRequest(http.MethodPost, "/x/"+itoaTest(pid2), nil)
	rw.SetPathValue("dispute", itoaTest(did2))
	rw = rw.WithContext(withCaller(rw.Context(), *ownerCaller))
	recW := httptest.NewRecorder()
	ProjectDisputeWithdrawHandler(pool)(recW, rw)
	if recW.Code != http.StatusOK {
		t.Fatalf("withdraw raw url = %d %s", recW.Code, recW.Body.String())
	}
	if got := hQDecode(t, recW)["message"].(string); got != "Dispute withdrawn. Payments are unfrozen." {
		t.Fatalf("withdraw raw url msg = %q", got)
	}

	// Evidence with the dispute bound from the raw URL tail (message captured)
	mid := hCMkMessage(t, ctx, pool, did2, owner, "hQ raw ev", nil, nil)
	re := httptest.NewRequest(http.MethodGet, "/x/"+itoaTest(did2), nil)
	re.SetPathValue("message", itoaTest(mid))
	re = re.WithContext(withCaller(re.Context(), *adminCaller))
	recE := httptest.NewRecorder()
	AdminDisputeEvidenceHandler(pool)(recE, re)
	if recE.Code != http.StatusNotFound {
		t.Fatalf("evidence raw url = %d %s", recE.Code, recE.Body.String())
	}
	if got := hQDecode(t, recE)["message"].(string); got != "This message has no evidence attachment." {
		t.Fatalf("evidence raw url msg = %q", got)
	}

	// Dismissed dispute renders the resolver block on the user show path
	rd := httptest.NewRequest(http.MethodGet, "/x", nil)
	rd.SetPathValue("project", itoaTest(pid))
	rd.SetPathValue("dispute", itoaTest(did))
	rd = rd.WithContext(withCaller(rd.Context(), *ownerCaller))
	recD := httptest.NewRecorder()
	ProjectDisputeShowHandler(pool)(recD, rd)
	if recD.Code != http.StatusOK {
		t.Fatalf("show resolved = %d %s", recD.Code, recD.Body.String())
	}
	data := hQDecode(t, recD)["data"].(map[string]any)
	resolver, ok := data["resolver"].(map[string]any)
	if !ok || int64(resolver["id"].(float64)) != admin.id {
		t.Fatalf("show resolver = %v", data["resolver"])
	}
}
