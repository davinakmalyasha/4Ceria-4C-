package httpapi

// hQ professional + design-payment/legal verification leftovers: numeric
// and file branches of UpdateProfessional, the no-bid verify-payment path,
// deliverable/bid/checklist units and the no-termin legal path.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHQProfessionalExtra(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	arsi := hQMkUser(t, ctx, pool, "profexar", "arsitek")
	defer hCCleanupProfessional(ctx, pool, arsi)
	var arsiProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hQ Arsi','verified') RETURNING id`, arsi).Scan(&arsiProf)
	var aemail, auname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, arsi).Scan(&aemail, &auname)
	arsiCaller := &roadmapCaller{id: arsi, role: "arsitek"}
	other := hQMkUser(t, ctx, pool, "profexot", "arsitek")
	defer hCCleanupProfessional(ctx, pool, other)
	var otherUname, otherEmail string
	_ = pool.QueryRow(ctx, `SELECT username::text, email::text FROM users WHERE id=$1`, other).Scan(&otherUname, &otherEmail)
	kontra := hQMkUser(t, ctx, pool, "profexko", "kontraktor")
	defer hCCleanupProfessional(ctx, pool, kontra)
	var kemail, kuname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, kontra).Scan(&kemail, &kuname)
	kontraCaller := &roadmapCaller{id: kontra, role: "kontraktor"}
	hCSeedProfile(t, ctx, pool, "kontraktors", kontra, "hQ Kont")

	// Username taken — exact message
	rec := hCCallProfessional(pool, arsiCaller, `{"name":"hQ A","email":"`+aemail+`","username":"`+otherUname+`"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof username taken = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "username", "The username has already been taken.")
	// Numeric rate as a JSON number + valid entity_type — 200, stored
	rec = hCCallProfessional(pool, arsiCaller, `{"name":"hQ A","email":"`+aemail+`","username":"`+auname+`","rate_harga":175000,"entity_type":"company"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("prof numeric = %d %s", rec.Code, rec.Body.String())
	}
	var rate, entity string
	_ = pool.QueryRow(ctx, `SELECT rate_harga::text, entity_type::text FROM arsiteks WHERE user_id=$1`, arsi).Scan(&rate, &entity)
	if rate != "175000.00" || entity != "company" {
		t.Fatalf("prof numeric row = %q %q", rate, entity)
	}
	// Kontraktor no_telp alias feeds no_telepon (canonical column)
	rec = hCCallProfessional(pool, kontraCaller, `{"name":"hQ K","email":"`+kemail+`","username":"`+kuname+`","no_telp":"+62811"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("prof notelp = %d %s", rec.Code, rec.Body.String())
	}
	var telp *string
	_ = pool.QueryRow(ctx, `SELECT no_telepon FROM kontraktors WHERE user_id=$1`, kontra).Scan(&telp)
	if telp == nil || *telp != "+62811" {
		t.Fatalf("prof notelp row = %v", telp)
	}
	// Bank happy — payout columns pinned (literals)
	rec = hCCallProfessional(pool, arsiCaller, `{"name":"hQ A","email":"`+aemail+`","username":"`+auname+`","bank_name":"hQ Bank","bank_account_number":"990011","bank_account_name":"hQ A"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("prof bank = %d %s", rec.Code, rec.Body.String())
	}
	var bank, acct, holder string
	_ = pool.QueryRow(ctx, `SELECT bank_name, bank_account_number, bank_account_name FROM users WHERE id=$1`, arsi).Scan(&bank, &acct, &holder)
	if bank != "hQ Bank" || acct != "990011" || holder != "hQ A" {
		t.Fatalf("prof bank row = %q %q %q", bank, acct, holder)
	}
	// Services as a JSON string (not an array) — row pinned
	nid := hQMkUser(t, ctx, pool, "profexno", "notaris")
	defer hCCleanupProfessional(ctx, pool, nid)
	hCSeedProfile(t, ctx, pool, "notaris_profiles", nid, "hQ Nota")
	var nemail, nuname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, nid).Scan(&nemail, &nuname)
	nCaller := &roadmapCaller{id: nid, role: "notaris"}
	rec = hCCallProfessional(pool, nCaller, `{"name":"hQ N","email":"`+nemail+`","username":"`+nuname+`","services":"[{\"title\":\"hQ Str\",\"price\":75000}]"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("prof services str = %d %s", rec.Code, rec.Body.String())
	}
	var svcN int
	var svcTitle, svcPrice string
	_ = pool.QueryRow(ctx, `SELECT count(*), min(title::text), min(price::text) FROM notaris_services WHERE notaris_id IN (SELECT id FROM notaris_profiles WHERE user_id=$1)`, nid).Scan(&svcN, &svcTitle, &svcPrice)
	if svcN != 1 || svcTitle != "hQ Str" || svcPrice != "75000.00" {
		t.Fatalf("prof services row = %d %q %q", svcN, svcTitle, svcPrice)
	}
	// Invalid services string — skipped wholesale, still 200
	rec = hCCallProfessional(pool, nCaller, `{"name":"hQ N","email":"`+nemail+`","username":"`+nuname+`","services":"hQ-oops"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("prof services bad = %d %s", rec.Code, rec.Body.String())
	}
	var svcN2 int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notaris_services WHERE notaris_id IN (SELECT id FROM notaris_profiles WHERE user_id=$1)`, nid).Scan(&svcN2)
	if svcN2 != 1 {
		t.Fatalf("prof services kept = %d", svcN2)
	}

	// Foto upload (multipart): verificationFiles present branch + pending flip
	rejUID := hQMkUser(t, ctx, pool, "profexrj", "arsitek")
	defer hCCleanupProfessional(ctx, pool, rejUID)
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hQ Rej','rejected')`, rejUID); err != nil {
		t.Fatalf("rej profile: %v", err)
	}
	var remail, runame string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, rejUID).Scan(&remail, &runame)
	rejCaller := &roadmapCaller{id: rejUID, role: "arsitek"}
	rec = hQCallProfessionalFiles(t, pool, rejCaller, map[string]string{"name": "hQ Rej", "email": remail, "username": runame}, "foto", "hQ-foto.png", append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 64)...))
	if rec.Code != http.StatusOK {
		t.Fatalf("prof foto = %d %s", rec.Code, rec.Body.String())
	}
	var vstat string
	_ = pool.QueryRow(ctx, `SELECT verification_status::text FROM arsiteks WHERE user_id=$1`, rejUID).Scan(&vstat)
	if vstat != "pending" {
		t.Fatalf("prof foto status = %q want pending", vstat)
	}
	// Foto wrong mime — exact message
	rec = hQCallProfessionalFiles(t, pool, rejCaller, map[string]string{"name": "hQ Rej", "email": remail, "username": runame}, "foto", "hQ-foto.txt", []byte("plain text"))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof foto mime = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "foto", "The foto field must be a file of type: jpg, png, jpeg.")
}

func hQCallProfessionalFiles(t *testing.T, pool *pgxpool.Pool, caller *roadmapCaller, fields map[string]string, fileField, filename string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	fw, _ := mw.CreateFormFile(fileField, filename)
	_, _ = fw.Write(data)
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/me/professional", &buf)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	r = r.WithContext(withCaller(r.Context(), *caller))
	rec := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(rec, r)
	return rec
}

func TestHQVerifyPaymentNoBid(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hQMkUser(t, ctx, pool, "vpayown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	arsiUser := hQMkUser(t, ctx, pool, "vpayarsi", "arsitek")
	defer hQCleanupUser(ctx, pool, arsiUser)
	var arsiProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hQ Arsi','verified') RETURNING id`, arsiUser).Scan(&arsiProf)
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, arsiProf)
	arsiCaller := &roadmapCaller{id: arsiUser, role: "arsitek"}
	pid := hQMkProject(t, ctx, pool, owner, "hQ Verify Payment")
	defer hQCleanupDisputeProject(ctx, pool, pid, owner)
	pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2, planning_status='approved', design_details='{"deliverables":["floor_plan","hQ_bogus"]}' WHERE id=$1`, pid, arsiProf)

	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/x", nil)
		r.SetPathValue("project", itoaTest(pid))
		r = r.WithContext(withCaller(r.Context(), *arsiCaller))
		rec := httptest.NewRecorder()
		VerifyPaymentHandler(pool)(rec, r)
		return rec
	}
	// No accepted bid: stamps + regenerates only the mapped milestone (bogus skipped)
	rec := call()
	if rec.Code != http.StatusOK {
		t.Fatalf("pay nobid = %d %s", rec.Code, rec.Body.String())
	}
	var verified bool
	var milestones int
	_ = pool.QueryRow(ctx, `SELECT design_payment_verified_at IS NOT NULL, (SELECT count(*) FROM project_milestones WHERE project_id=$1) FROM projects WHERE id=$1`, pid).Scan(&verified, &milestones)
	if !verified || milestones != 1 {
		t.Fatalf("pay nobid rows = %v %d", verified, milestones)
	}
	var title string
	_ = pool.QueryRow(ctx, `SELECT title FROM project_milestones WHERE project_id=$1`, pid).Scan(&title)
	if title != "Architectural Design: Detailed Floor Plans" {
		t.Fatalf("pay nobid milestone = %q", title)
	}
	var ledger, notif int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=$1`, pid).Scan(&ledger)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='payment_verified'`, owner).Scan(&notif)
	if ledger != 0 || notif != 0 {
		t.Fatalf("pay nobid side effects = ledger %d notif %d", ledger, notif)
	}
	pool.Exec(ctx, `DELETE FROM project_milestones WHERE project_id=$1`, pid)
}

func TestHQVerifyUnits(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// verifyBidMinor — literals
	if verifyBidMinor(nil, nil) != 0 {
		t.Fatalf("bidminor nil")
	}
	calc, price := "250000.00", "100000.00"
	if verifyBidMinor(&calc, &price) != 25000000 {
		t.Fatalf("bidminor calc")
	}
	bad := "xx"
	if verifyBidMinor(&bad, &price) != 10000000 {
		t.Fatalf("bidminor price fallback")
	}
	if verifyBidMinor(&bad, &bad) != 0 {
		t.Fatalf("bidminor bad")
	}

	// verifyChecklist — literals
	if got := verifyChecklist("hQ-bogus"); len(got) != 0 {
		t.Fatalf("checklist bogus")
	}
	if got := verifyChecklist("floor_plan"); len(got) != 3 {
		t.Fatalf("checklist floor")
	}

	// verifyDeliverables branches via a tx — literals
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)
	var pid int64
	owner := hQMkUser(t, ctx, pool, "vdelown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	_ = pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,'hQ Del','open',10000000) RETURNING id`, owner).Scan(&pid)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	deliver := func(details string) ([]string, error) {
		pool.Exec(ctx, `UPDATE projects SET design_details=$2 WHERE id=$1`, pid, details)
		return verifyDeliverables(ctx, tx, pid)
	}
	if out, err := deliver(""); err != nil || out != nil {
		t.Fatalf("deliver null = %v %v", out, err)
	}
	if out, err := deliver("oops"); err != nil || out != nil {
		t.Fatalf("deliver invalid = %v %v", out, err)
	}
	if out, err := deliver("[1,2]"); err != nil || out != nil {
		t.Fatalf("deliver nonobject = %v %v", out, err)
	}
	if out, err := deliver(`{"other":1}`); err != nil || out != nil {
		t.Fatalf("deliver nokey = %v %v", out, err)
	}
	if out, err := deliver(`{"deliverables":["floor_plan",7,"3d_render"]}`); err != nil || len(out) != 2 || out[0] != "floor_plan" || out[1] != "3d_render" {
		t.Fatalf("deliver mixed = %v %v", out, err)
	}
	tx.Rollback(ctx)
}

func TestHQVerifyLegalNoTermin(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hQMkUser(t, ctx, pool, "vlegown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	pid := hQMkProject(t, ctx, pool, owner, "hQ Verify Legal")
	defer hQCleanupDisputeProject(ctx, pool, pid, owner)
	// Handover submitted, but no locked notaris termin: the unblock branch skips
	pool.Exec(ctx, `UPDATE projects SET legal_handover_submitted_at=now() WHERE id=$1`, pid)

	r := httptest.NewRequest(http.MethodPost, "/x", nil)
	r.SetPathValue("project", itoaTest(pid))
	r = r.WithContext(withCaller(r.Context(), *ownerCaller))
	rec := httptest.NewRecorder()
	VerifyLegalHandler(pool)(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("legal notermin = %d %s", rec.Code, rec.Body.String())
	}
	var approved, locked, completed, cleared, inPhases bool
	var unblocked int
	_ = pool.QueryRow(ctx, `SELECT owner_legal_approved_at IS NOT NULL, legal_locked_at IS NOT NULL, legal_completed_at IS NOT NULL, legal_handover_submitted_at IS NULL, COALESCE(completed_phases,'[]'::jsonb) @> '["legal"]'::jsonb, (SELECT count(*) FROM project_activity_logs WHERE project_id=$1 AND action='payment_unblocked') FROM projects WHERE id=$1`, pid).Scan(&approved, &locked, &completed, &cleared, &inPhases, &unblocked)
	if !approved || !locked || !completed || !cleared || !inPhases || unblocked != 0 {
		t.Fatalf("legal stamps = %v %v %v %v %v unblocked %d", approved, locked, completed, cleared, inPhases, unblocked)
	}
	var verifiedLog int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=$1 AND action='legal_verified'`, pid).Scan(&verifiedLog)
	if verifiedLog != 1 {
		t.Fatalf("legal log = %d", verifiedLog)
	}
}
