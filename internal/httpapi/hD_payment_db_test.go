package httpapi

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// hDRawCall serves a handler with ONLY the given path values set, so the
// *FromPath fallbacks actually run (h1AllPathKeys would mask them).
func hDRawCall(t *testing.T, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, kv map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader(`{}`)
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("Content-Type", "application/json")
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

// hDRawMultipart is the multipart twin of hDRawCall.
func hDRawMultipart(t *testing.T, h http.HandlerFunc, target string, fields map[string]string, fileField, filename string, data []byte, caller *roadmapCaller, kv map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if fileField != "" {
		part, err := w.CreateFormFile(fileField, filename)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, target, &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
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

var hDProofPDF = []byte("%PDF-1.4\nhD proof\n%%EOF\n")

func TestHDPaymentProofVerify(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940041, "user", "hd-pv-owner@example.test", "hD PV Owner")
	arsUser := hAMkUser(t, pool, 940042, "arsitek", "hd-pv-ars@example.test", "hD PV Ars")
	kontUser := hAMkUser(t, pool, 940043, "kontraktor", "hd-pv-kontra@example.test", "hD PV Kontra")
	suppUser := hAMkUser(t, pool, 940044, "supplier", "hd-pv-supp@example.test", "hD PV Supp")
	pmUser := hAMkUser(t, pool, 940045, "project_manager", "hd-pv-pm@example.test", "hD PV PM")
	structUser := hAMkUser(t, pool, 940046, "structural", "hd-pv-struct@example.test", "hD PV Struct")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941041, owner.id, "hD pay project", "in_progress", "both", 800000000)
	hAMkProject(t, pool, 941042, owner.id, "hD pay poor project", "open", "both", 100000)
	hAMkProject(t, pool, 941043, owner.id, "hD pay legacy pm project", "open", "both", 800000000)
	legacyPM := hAMkUser(t, pool, 940048, "project_manager", "hd-pv-legacypm@example.test", "hD PV LegacyPM")

	var suppID int64
	if err := pool.QueryRow(ctx, `INSERT INTO suppliers (user_id, store_name, verification_status) VALUES ($1,'hD store','verified') RETURNING id`, suppUser.id).Scan(&suppID); err != nil {
		t.Fatal(err)
	}

	// legacy spelling: pm_id names a profile row whose id EQUALS the PM's
	// user id (the reference compares pm_id against the user id byte for
	// byte). The row must exist for the FK, so it is owned by another user.
	if _, err := pool.Exec(ctx, `INSERT INTO project_managers (id, user_id, verification_status) VALUES ($1,$2,'verified')`, legacyPM.id, structUser.id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id=941043`, legacyPM.id); err != nil {
		t.Fatal(err)
	}
	var matLegacy int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, project_id, status, total_price, shipping_cost, whatsapp_order_id)
		VALUES ($1,$2,941043,'pending','200000','0','hD-wo-legacy') RETURNING id`, owner.id, suppID).Scan(&matLegacy); err != nil {
		t.Fatal(err)
	}

	// bids with previous ids: the proof routes name the wire (legacy) id
	var bidArs, bidKontra, bidPoor int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, legacy_id)
		VALUES (941041,'arsitek',$1,$2,$2,'75000000','75000000','hD pv ars','shortlisted','fixed',$1,0,940501) RETURNING id`,
		arsUser.id, arsUser.id+100000).Scan(&bidArs); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, legacy_id)
		VALUES (941041,'kontraktor',$1,$2,$2,'30000000','30000000','hD pv kontra','shortlisted','fixed',$1,0,940502) RETURNING id`,
		kontUser.id, kontUser.id+100000).Scan(&bidKontra); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, legacy_id)
		VALUES (941042,'arsitek',$1,$2,$2,'50000000','50000000','hD pv poor','shortlisted','fixed',$1,0,940503) RETURNING id`,
		arsUser.id, arsUser.id+100000).Scan(&bidPoor); err != nil {
		t.Fatal(err)
	}

	// material orders: one for the supplier twin, one for the PM twin
	var matSupp, matPM int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, project_id, status, total_price, shipping_cost, whatsapp_order_id)
		VALUES ($1,$2,941041,'pending','400000','50000','hD-wo-1') RETURNING id`, owner.id, suppID).Scan(&matSupp); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, project_id, status, total_price, shipping_cost, whatsapp_order_id)
		VALUES ($1,$2,941041,'pending','200000','0','hD-wo-2') RETURNING id`, owner.id, suppID).Scan(&matPM); err != nil {
		t.Fatal(err)
	}
	// PM verifies materials under the assigned profile spelling
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id=941041`, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}

	// specialist addendum for the accept-specialist twin
	var specAdd int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, assigned_user_id, specialist_type, status, created_at, updated_at)
		VALUES (941041,'arsitek',$1,'hD PV spec','1200000','specialist_assignment',$2,'structural','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id, structUser.id).Scan(&specAdd); err != nil {
		t.Fatal(err)
	}
	// plain addendum for the upload twin
	var plainAdd int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (941041,'arsitek',$1,'hD PV plain','800000','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&plainAdd); err != nil {
		t.Fatal(err)
	}

	upKV := func(typ, id string) map[string]string {
		return map[string]string{"project": "941041", "type": typ, "id": id}
	}

	// --- bid proof upload happy (names the wire id) ---
	rec := hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/941041/payments/arsitek_bid/940501/upload-proof",
		nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("arsitek_bid", "940501"))
	if rec.Code != http.StatusOK {
		t.Fatalf("bid proof ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Proof of transfer uploaded successfully." {
		t.Fatalf("bid proof message = %q", got)
	}
	var bidStatus string
	var bidPayStatus string
	var bidProof string
	_ = pool.QueryRow(ctx, `SELECT status::text, payment_status::text, payment_proof_path FROM bids WHERE id=$1`, bidArs).Scan(&bidStatus, &bidPayStatus, &bidProof)
	if bidStatus != "shortlisted" || bidPayStatus != "verifying" || bidProof == "" {
		t.Fatalf("bid proof row = %q/%q/%q, want shortlisted/verifying/set", bidStatus, bidPayStatus, bidProof)
	}

	// --- path-fallback twin: type+id read from the URL, not path values ---
	rec = hDRawMultipart(t, UploadProofHandler(pool), "/api/projects/941041/payments/termin/777/upload-proof",
		nil, "proof", "hD.pdf", hDProofPDF, &owner, map[string]string{"project": "941041"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof fallback type/id = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Payment record not found." {
		t.Fatalf("proof fallback message = %q", got)
	}

	// --- bid proof settled twins ---
	if _, err := pool.Exec(ctx, `UPDATE bids SET payment_status='paid' WHERE id=$1`, bidKontra); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("kontraktor_bid", "940502"))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("bid proof paid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("bid proof paid message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE bids SET payment_status='verifying', payment_proof_path='hD/old.pdf' WHERE id=$1`, bidKontra); err != nil {
		t.Fatal(err)
	}

	// --- material upload happy (supplier twin) ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("material", itoaTest(matSupp)))
	if rec.Code != http.StatusOK {
		t.Fatalf("material proof ok = %d %s", rec.Code, rec.Body.String())
	}
	var matStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id=$1`, matSupp).Scan(&matStatus)
	if matStatus != "verifying" {
		t.Fatalf("material proof status = %q, want verifying", matStatus)
	}

	// --- material upload happy (PM twin) ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("material", itoaTest(matPM)))
	if rec.Code != http.StatusOK {
		t.Fatalf("material pm proof ok = %d %s", rec.Code, rec.Body.String())
	}

	// --- addendum upload happy ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("addendum", itoaTest(plainAdd)))
	if rec.Code != http.StatusOK {
		t.Fatalf("addendum proof ok = %d %s", rec.Code, rec.Body.String())
	}
	var addProofStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, plainAdd).Scan(&addProofStatus)
	if addProofStatus != "verifying" {
		t.Fatalf("addendum proof status = %q, want verifying", addProofStatus)
	}
	// --- addendum settled twin (refunded) ---
	if _, err := pool.Exec(ctx, `UPDATE project_addendums SET status='refunded' WHERE id=$1`, plainAdd); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("addendum", itoaTest(plainAdd)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum refunded = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment was refunded through dispute arbitration and cannot be re-charged." {
		t.Fatalf("addendum refunded message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE project_addendums SET status='verifying' WHERE id=$1`, plainAdd); err != nil {
		t.Fatal(err)
	}

	// --- verify: legacy user-id PM accepts the material order ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner,
		map[string]string{"project": "941043", "type": "material", "id": itoaTest(matLegacy)})
	if rec.Code != http.StatusOK {
		t.Fatalf("legacy proof ok = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &legacyPM,
		map[string]string{"project": "941043", "type": "material", "id": itoaTest(matLegacy)})
	if rec.Code != http.StatusOK {
		t.Fatalf("legacy verify ok = %d %s", rec.Code, rec.Body.String())
	}
	var legLedgerMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=941043 AND transaction_type='payment' AND reference_id=$1`, matLegacy).Scan(&legLedgerMinor)
	if legLedgerMinor != 20000000 {
		t.Fatalf("legacy verify ledger minor = %d, want 20000000", legLedgerMinor)
	}

	// --- verify: bid accept happy ---
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, upKV("arsitek_bid", "940501"))
	if rec.Code != http.StatusOK {
		t.Fatalf("bid verify ok = %d %s", rec.Code, rec.Body.String())
	}
	dec := hADecode(t, rec)
	if dec["status"] != "success" || dec["message"] != "Payment verified successfully." {
		t.Fatalf("bid verify answer = %v", dec)
	}
	var vPayStatus, vStatus string
	_ = pool.QueryRow(ctx, `SELECT payment_status::text, status::text FROM bids WHERE id=$1`, bidArs).Scan(&vPayStatus, &vStatus)
	if vPayStatus != "paid" || vStatus != "active" {
		t.Fatalf("bid verify row = %q/%q, want paid/active", vPayStatus, vStatus)
	}
	var vLedgerMinor int64
	var vLedgerTitle string
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=941041 AND transaction_type='payment' AND reference_id=940501`).Scan(&vLedgerMinor, &vLedgerTitle)
	if vLedgerMinor != 7500000000 || vLedgerTitle != "Professional Fee: hD PV Ars" {
		t.Fatalf("bid verify ledger = %d/%q, want 7500000000/Professional Fee: hD PV Ars", vLedgerMinor, vLedgerTitle)
	}

	// --- verify fallback twin reads type+id from the URL ---
	rec = hDRawCall(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/941041/payments/material/"+itoaTest(matPM)+"/verify-proof",
		`{"action":"accept"}`, &pmUser, map[string]string{"project": "941041"})
	if rec.Code != http.StatusOK {
		t.Fatalf("verify fallback ok = %d %s", rec.Code, rec.Body.String())
	}

	// --- verify: supplier accepts the material order ---
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &suppUser, upKV("material", itoaTest(matSupp)))
	if rec.Code != http.StatusOK {
		t.Fatalf("material verify ok = %d %s", rec.Code, rec.Body.String())
	}
	var mLedgerMinor int64
	var mLedgerTitle string
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=941041 AND transaction_type='payment' AND reference_id=$1`, matSupp).Scan(&mLedgerMinor, &mLedgerTitle)
	if mLedgerMinor != 45000000 || mLedgerTitle != "Payment: Material Procurement" {
		t.Fatalf("material verify ledger = %d/%q, want 45000000/Payment: Material Procurement", mLedgerMinor, mLedgerTitle)
	}
	var mStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id=$1`, matSupp).Scan(&mStatus)
	if mStatus != "paid" {
		t.Fatalf("material verify status = %q, want paid", mStatus)
	}

	// --- verify: specialist assignee accepts the addendum ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("addendum", itoaTest(specAdd)))
	if rec.Code != http.StatusOK {
		t.Fatalf("spec proof ok = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &structUser, upKV("addendum", itoaTest(specAdd)))
	if rec.Code != http.StatusOK {
		t.Fatalf("spec verify ok = %d %s", rec.Code, rec.Body.String())
	}
	var sStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, specAdd).Scan(&sStatus)
	if sStatus != "paid" {
		t.Fatalf("spec verify status = %q, want paid", sStatus)
	}
	var subStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_sub_professionals WHERE project_id=941041 AND sub_role='structural'`).Scan(&subStatus)
	if subStatus != "invited" {
		t.Fatalf("spec verify sub = %q, want invited", subStatus)
	}
	var sLedgerMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=941041 AND transaction_type='payment' AND reference_id=$1`, specAdd).Scan(&sLedgerMinor)
	if sLedgerMinor != 120000000 {
		t.Fatalf("spec verify ledger minor = %d, want 120000000", sLedgerMinor)
	}

	// --- verify: kontraktor rejects with notes ---
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"reject","notes":"hD bad quality"}`, &kontUser, upKV("kontraktor_bid", "940502"))
	if rec.Code != http.StatusOK {
		t.Fatalf("bid reject ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Payment proof rejected. The owner will be notified." {
		t.Fatalf("bid reject message = %q", got)
	}
	var rjPay, rjNotes string
	_ = pool.QueryRow(ctx, `SELECT payment_status::text, verification_notes FROM bids WHERE id=$1`, bidKontra).Scan(&rjPay, &rjNotes)
	if rjPay != "pending" || rjNotes != "hD bad quality" {
		t.Fatalf("bid reject row = %q/%q, want pending/hD bad quality", rjPay, rjNotes)
	}

	// --- verify: insufficient twin on the poor project ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner,
		map[string]string{"project": "941042", "type": "arsitek_bid", "id": "940503"})
	if rec.Code != http.StatusOK {
		t.Fatalf("poor proof ok = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser,
		map[string]string{"project": "941042", "type": "arsitek_bid", "id": "940503"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("poor verify = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Project budget is insufficient for this payment (50,000,000). Please increase the project budget first." {
		t.Fatalf("poor verify message = %q", got)
	}
	var poorStatus string
	var poorLedger int
	_ = pool.QueryRow(ctx, `SELECT payment_status::text FROM bids WHERE id=$1`, bidPoor).Scan(&poorStatus)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=941042 AND transaction_type='payment'`).Scan(&poorLedger)
	if poorStatus != "verifying" || poorLedger != 0 {
		t.Fatalf("poor rollback = %q/%d, want verifying/0", poorStatus, poorLedger)
	}

	// --- terminSubProfessional skip twins ---
	var msSub, msA, msB int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, type, created_at, updated_at) VALUES (941041,'hD sub ms','sub_professional',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`).Scan(&msSub)
	_ = pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, created_at, updated_at) VALUES (941041,'hD ms A',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`).Scan(&msA)
	_ = pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, created_at, updated_at) VALUES (941041,'hD ms B',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`).Scan(&msB)
	var subT1, subT2 int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id, milestone_id)
		VALUES (941041,'hD sub first','50','1000000','50000','950000','pending','arsitek',$1,$2) RETURNING id`, arsUser.id, msSub).Scan(&subT1)
	_ = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id, milestone_id)
		VALUES (941041,'hD sub second','50','1000000','50000','950000','pending','arsitek',$1,$2) RETURNING id`, arsUser.id, msSub).Scan(&subT2)
	// sub-professional milestone skips the ordering guard
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(subT2)))
	if rec.Code != http.StatusOK {
		t.Fatalf("sub-prof skip ok = %d %s", rec.Code, rec.Body.String())
	}
	// non-core role skips it too
	var stT1, stT2 int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (941041,'hD st first','50','2000000','100000','1900000','pending','structural',$1) RETURNING id`, structUser.id).Scan(&stT1)
	_ = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (941041,'hD st second','50','2000000','100000','1900000','pending','structural',$1) RETURNING id`, structUser.id).Scan(&stT2)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(stT2)))
	if rec.Code != http.StatusOK {
		t.Fatalf("structural skip ok = %d %s", rec.Code, rec.Body.String())
	}
	// percentage-0 with an earlier-or-equal unpaid milestone blocks
	var zT1, zT2, zT3 int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id, milestone_id)
		VALUES (941041,'hD z first','50','3000000','150000','2850000','pending','arsitek',$1,$2) RETURNING id`, arsUser.id, msA).Scan(&zT1)
	_ = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id, milestone_id)
		VALUES (941041,'hD z change','0','0','0','0','pending','arsitek',$1,$2) RETURNING id`, arsUser.id, msB).Scan(&zT2)
	_ = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (941041,'hD z free','0','0','0','0','pending','arsitek',$1) RETURNING id`, arsUser.id).Scan(&zT3)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(zT2)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("zero-pct blocked = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Please complete the previous payment milestones (e.g. Down Payment) before paying for this one." {
		t.Fatalf("zero-pct message = %q", got)
	}
	// percentage-0 without a milestone sails through
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hD.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(zT3)))
	if rec.Code != http.StatusOK {
		t.Fatalf("zero-pct free ok = %d %s", rec.Code, rec.Body.String())
	}

	// --- pure helpers ---
	if got := verifyLabel(&verifyTarget{label: strPtr("hD L")}); got != "hD L" {
		t.Fatalf("verifyLabel label = %q", got)
	}
	if got := verifyLabel(&verifyTarget{title: strPtr("hD T")}); got != "hD T" {
		t.Fatalf("verifyLabel title = %q", got)
	}
	if got := verifyLabel(&verifyTarget{}); got != "a payment stage" {
		t.Fatalf("verifyLabel fallback = %q", got)
	}
	if rejectReason("hD why", true) != "hD why" || rejectReason("", true) != "No specific reason provided." || rejectReason("x", false) != "No specific reason provided." {
		t.Fatalf("rejectReason wrong")
	}
	if got := verifyRejectData(941041, "termin", 7, "hD n", true); got != `{"notes": "hD n", "payment_id": 7, "project_id": 941041, "payment_type": "termin"}` {
		t.Fatalf("verifyRejectData = %q", got)
	}
	if verifyAmountMinor(&verifyTarget{table: "bids", calculated: strPtr("75000000")}) != 7500000000 {
		t.Fatalf("verifyAmountMinor bids wrong")
	}
	if verifyAmountMinor(&verifyTarget{table: "project_payment_termins", amount: strPtr("10000000"), net: strPtr("9500000")}) != 950000000 {
		t.Fatalf("verifyAmountMinor termins wrong")
	}
	if verifyAmountMinor(&verifyTarget{table: "material_orders"}) != 0 {
		t.Fatalf("verifyAmountMinor material nil wrong")
	}
	if verifyAmountMinor(&verifyTarget{table: "bogus"}) != 0 {
		t.Fatalf("verifyAmountMinor bogus wrong")
	}
	if verifyBidAmount(&verifyTarget{price: strPtr("30000000")}) != 3000000000 {
		t.Fatalf("verifyBidAmount price wrong")
	}
	if verifyBidAmount(&verifyTarget{}) != 0 {
		t.Fatalf("verifyBidAmount empty wrong")
	}
	if _, err := parseRoleShort("arsitek"); err != nil {
		t.Fatalf("parseRoleShort arsitek: %v", err)
	}
	if _, err := parseRoleShort("bogus"); err == nil || err.Error() != "unknown role: bogus" {
		t.Fatalf("parseRoleShort bogus = %v", err)
	}
	if (proofErrorValue{status: 404, message: "x"}).Error() == "" || (errVerifyRole("r")).Error() != "unknown role: r" {
		t.Fatalf("proof errors wrong")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := verifyBidderName(ctx, tx, &verifyTarget{physID: bidArs, role: "arsitek"}); got != "hD PV Ars" {
		tx.Rollback(ctx)
		t.Fatalf("verifyBidderName = %q, want hD PV Ars", got)
	}
	if got := verifyBidderName(ctx, tx, &verifyTarget{physID: 999999999, role: "arsitek"}); got != "" {
		tx.Rollback(ctx)
		t.Fatalf("verifyBidderName missing = %q", got)
	}
	if got := verifyBidderName(ctx, tx, &verifyTarget{physID: bidArs, role: "bogus"}); got != "" {
		tx.Rollback(ctx)
		t.Fatalf("verifyBidderName role = %q", got)
	}
	hired := verifyHiredUserID(ctx, tx, 941041, "bogus")
	if hired != nil {
		tx.Rollback(ctx)
		t.Fatalf("verifyHiredUserID bogus = %v", hired)
	}
	// project_manager compares pm_id against the USER id (legacy spelling):
	// true on 941043 (pm_id = legacyPM user id), false on 941041 (profile id)
	if !verifyHiredForRole(ctx, tx, 941043, "project_manager", legacyPM.id) {
		tx.Rollback(ctx)
		t.Fatalf("verifyHiredForRole pm-user spelling false")
	}
	if verifyHiredForRole(ctx, tx, 941041, "project_manager", pmUser.id) {
		tx.Rollback(ctx)
		t.Fatalf("verifyHiredForRole profile-vs-user true")
	}
	if verifyHiredForRole(ctx, tx, 941041, "arsitek", 999999999) {
		tx.Rollback(ctx)
		t.Fatalf("verifyHiredForRole stranger true")
	}
	if !verifyHiredForAnyRole(ctx, tx, 941043, legacyPM.id) {
		tx.Rollback(ctx)
		t.Fatalf("verifyHiredForAnyRole pm false")
	}
	tx.Rollback(ctx)

	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
