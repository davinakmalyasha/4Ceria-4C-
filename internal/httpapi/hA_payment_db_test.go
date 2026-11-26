package httpapi

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

var hAProofPDF = []byte("%PDF-1.4\nhA proof\n%%EOF\n")

func hAMultipartCall(t *testing.T, h http.HandlerFunc, target string, fields map[string]string, fileField, filename string, data []byte, caller *roadmapCaller, kv map[string]string) *httptest.ResponseRecorder {
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

func hACleanupProofFiles(t *testing.T, pool interface{}, projectID int64) {
	t.Helper()
	// remove vault files referenced by our rows
	type querier interface {
		QueryRow(ctx context.Context, sql string, args ...any) interface{}
	}
	_ = querier(nil)
	// best-effort: delete contracts dir for this project
	for _, base := range []string{filepath.Join("storage", "app", "public", "contracts", "project_"+itoaTest(projectID))} {
		_ = os.RemoveAll(base)
	}
	_ = projectID
}

func TestHAPayment(t *testing.T) {
	pool := hAPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 910041, "user", "ha-pay-owner@example.test", "hA Pay Owner")
	arsitekUser := hAMkUser(t, pool, 910042, "arsitek", "ha-pay-ars@example.test", "hA Pay Ars")
	stranger := hAMkUser(t, pool, 910043, "user", "ha-pay-stranger@example.test", "hA Pay Stranger")
	t.Cleanup(func() { hACleanupUsers(t, pool) })

	hAMkProject(t, pool, 911041, owner.id, "hA payment project", "in_progress", "both", 500000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1 WHERE id=911041`, arsitekUser.id+100000); err != nil {
		t.Fatal(err)
	}
	// ledger deposit for budget checks
	if _, err := pool.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, transaction_date, actor_user_id, actor_role) VALUES (911041,'deposit','500000000','hA opening',now(),$1,'user')`, owner.id); err != nil {
		t.Fatalf("deposit: %v", err)
	}
	// termin: pending, 50% 10jt
	var terminID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (911041,'hA DP','50','10000000','500000','9500000','pending','arsitek',$1) RETURNING id`, arsitekUser.id).Scan(&terminID); err != nil {
		t.Fatalf("termin seed: %v", err)
	}

	// --- UploadProof guards ---
	// unauth
	rec := hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/1/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, nil, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("proof unauth = %d %s", rec.Code, rec.Body.String())
	}
	// bad project
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x/abc", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "abc", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof bad-project = %d %s", rec.Code, rec.Body.String())
	}
	// missing project
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/999999999/payments/termin/1/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "999999999", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof missing project = %d %s", rec.Code, rec.Body.String())
	}
	// forbidden (stranger)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/1/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &stranger, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("proof forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the Project Owner or assigned Project Manager can upload payment proofs." {
		t.Fatalf("proof forbidden message = %q", got)
	}
	// validation: no file
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/1/upload-proof", nil, "", "", nil, &owner, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof no-file = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// bad type
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/bogus/1/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "911041", "type": "bogus", "id": itoaTest(terminID)})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("proof bad-type = %d, want 400 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Invalid payment type: bogus" {
		t.Fatalf("proof bad-type message = %q", got)
	}
	// missing row
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/999999999/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "911041", "type": "termin", "id": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof missing row = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Payment record not found." {
		t.Fatalf("proof missing message = %q", got)
	}
	// frozen
	var freezeID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES (911041,$1,'payment','hA freeze','freeze','open') RETURNING id`, owner.id).Scan(&freezeID); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/1/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof frozen = %d, want frozen 422 %s", rec.Code, rec.Body.String())
	}
	wantFrozen := "Payments are frozen: dispute #" + itoaTest(freezeID) + ` ("hA freeze") is open on this project. An admin must resolve it first.`
	if got := hADecode(t, rec)["message"]; got != wantFrozen {
		t.Fatalf("proof frozen message = %q, want %q", got, wantFrozen)
	}
	// frozen writes nothing: status still pending, zero payment ledger rows
	var stFrozen string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, terminID).Scan(&stFrozen)
	if stFrozen != "pending" {
		t.Fatalf("frozen termin status = %q, want pending", stFrozen)
	}
	var frozenLedger int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=911041 AND transaction_type='payment' AND reference_id=$1`, terminID).Scan(&frozenLedger)
	if frozenLedger != 0 {
		t.Fatalf("frozen ledger rows = %d, want 0", frozenLedger)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=911041`); err != nil {
		t.Fatal(err)
	}
	// ordering guard: second termin blocked behind first unpaid
	var termin2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (911041,'hA Second','50','10000000','500000','9500000','pending','arsitek',$1) RETURNING id`, arsitekUser.id).Scan(&termin2); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/2/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(termin2)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof ordering = %d, want ordering 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Please complete the previous payment milestones (e.g. Down Payment) before paying for this one." {
		t.Fatalf("proof ordering message = %q", got)
	}
	// happy upload on first termin
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/1/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("proof ok = %d %s", rec.Code, rec.Body.String())
	}
	var proofPath string
	_ = pool.QueryRow(ctx, `SELECT payment_proof_path FROM project_payment_termins WHERE id=$1`, terminID).Scan(&proofPath)
	if proofPath == "" {
		t.Fatalf("proof path not stored")
	}
	// happy flips pending -> verifying with the stored receipt path
	var stHappy string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, terminID).Scan(&stHappy)
	if stHappy != "verifying" {
		t.Fatalf("proof status = %q, want verifying", stHappy)
	}
	// settled guard: mark paid then re-upload rejected
	if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET status='paid' WHERE id=$1`, terminID); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/1/upload-proof", nil, "proof", "hA.pdf", hAProofPDF, &owner, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof settled = %d, want 422 paid %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("proof settled message = %q", got)
	}
	// reset to verifying for verify tests
	if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET status='verifying' WHERE id=$1`, terminID); err != nil {
		t.Fatal(err)
	}

	// --- VerifyProof guards ---
	// unauth
	rec = hACall(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{"action":"accept"}`, nil, "911041")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("verify unauth = %d", rec.Code)
	}
	// bad project
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x/abc", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "abc", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify bad-project = %d %s", rec.Code, rec.Body.String())
	}
	// validation
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{}`, &arsitekUser, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify invalid = %d %s", rec.Code, rec.Body.String())
	}
	// bad type
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/bogus/1/verify-proof", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "911041", "type": "bogus", "id": itoaTest(terminID)})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("verify bad-type = %d, want 400 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Invalid payment type: bogus" {
		t.Fatalf("verify bad-type message = %q", got)
	}
	// missing row
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/999999999/verify-proof", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "911041", "type": "termin", "id": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Payment record not found." {
		t.Fatalf("verify missing message = %q", got)
	}
	// forbidden: stranger cannot verify termin (recipient is arsitek)
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{"action":"accept"}`, &stranger, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("verify forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. You do not have permission to verify this payment." {
		t.Fatalf("verify forbidden message = %q", got)
	}
	// frozen
	var freeze2ID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES (911041,$1,'payment','hA freeze2','freeze','open') RETURNING id`, owner.id).Scan(&freeze2ID); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify frozen = %d, want frozen %s", rec.Code, rec.Body.String())
	}
	wantFrozen2 := "Payments are frozen: dispute #" + itoaTest(freeze2ID) + ` ("hA freeze2") is open on this project. An admin must resolve it first.`
	if got := hADecode(t, rec)["message"]; got != wantFrozen2 {
		t.Fatalf("verify frozen message = %q, want %q", got, wantFrozen2)
	}
	var frozenVerifyLedger int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=911041 AND transaction_type='payment' AND reference_id=$1`, terminID).Scan(&frozenVerifyLedger)
	if frozenVerifyLedger != 0 {
		t.Fatalf("frozen verify ledger rows = %d, want 0", frozenVerifyLedger)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=911041`); err != nil {
		t.Fatal(err)
	}
	// not verifying guard: set pending then verify rejected
	if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET status='pending' WHERE id=$1`, terminID); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify not-verifying = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment is not awaiting verification. Expected status 'verifying' (proof uploaded by the payer), found 'pending'." {
		t.Fatalf("verify not-verifying message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET status='verifying' WHERE id=$1`, terminID); err != nil {
		t.Fatal(err)
	}
	// reject path
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{"action":"reject","notes":"hA bad proof"}`, &arsitekUser, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("verify reject = %d %s", rec.Code, rec.Body.String())
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, terminID).Scan(&st)
	if st != "pending" {
		t.Fatalf("reject status = %q, want pending", st)
	}
	var rejectNotes string
	_ = pool.QueryRow(ctx, `SELECT verification_notes FROM project_payment_termins WHERE id=$1`, terminID).Scan(&rejectNotes)
	if rejectNotes != "hA bad proof" {
		t.Fatalf("reject notes = %q, want hA bad proof", rejectNotes)
	}
	// re-upload then accept happy (ledger moves net 9500000 = 950000000 minor)
	if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET status='pending' WHERE id=$1`, terminID); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/projects/911041/payments/termin/1/upload-proof", nil, "proof", "hA2.pdf", hAProofPDF, &owner, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("re-proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("verify accept = %d %s", rec.Code, rec.Body.String())
	}
	// accept flips verifying -> paid and writes exactly the net amount:
	// net 9500000.00 = 950000000 minor units (hand literal, not recomputed)
	var paidStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, terminID).Scan(&paidStatus)
	if paidStatus != "paid" {
		t.Fatalf("accept status = %q, want paid", paidStatus)
	}
	var paidCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=911041 AND transaction_type='payment' AND reference_id=$1`, terminID).Scan(&paidCount)
	if paidCount != 1 {
		t.Fatalf("ledger rows = %d, want 1", paidCount)
	}
	var ledgerMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=911041 AND transaction_type='payment' AND reference_id=$1`, terminID).Scan(&ledgerMinor)
	if ledgerMinor != 950000000 {
		t.Fatalf("ledger minor = %d, want 950000000", ledgerMinor)
	}
	// double-verify settled -> 422 paid
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911041/payments/termin/1/verify-proof", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "911041", "type": "termin", "id": itoaTest(terminID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify double = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("verify double message = %q", got)
	}

	// fund shortfall: tiny budget project, large termin
	hAMkProject(t, pool, 911042, owner.id, "hA payment poor project", "in_progress", "both", 100000)
	if _, err := pool.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, transaction_date, actor_user_id, actor_role) VALUES (911042,'deposit','100000','hA opening',now(),$1,'user')`, owner.id); err != nil {
		t.Fatal(err)
	}
	var poorTermin int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id, payment_proof_path)
		VALUES (911042,'hA big','100','50000000','2500000','47500000','verifying','arsitek',$1,'hA/proof.pdf') RETURNING id`, arsitekUser.id).Scan(&poorTermin); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/projects/911042/payments/termin/1/verify-proof", `{"action":"accept"}`, &arsitekUser, map[string]string{"project": "911042", "type": "termin", "id": itoaTest(poorTermin)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify shortfall = %d, want insufficient 422 %s", rec.Code, rec.Body.String())
	}
	// fund shortfall: net 47500000.00, budget 100000.00 -> available 100000.00
	// message literals are hand-written from the fixture math, never recomputed
	if got := hADecode(t, rec)["message"]; got != "Project budget is insufficient for this payment (47,500,000). Available: 100,000. Please increase the project budget first." {
		t.Fatalf("verify shortfall message = %q", got)
	}
	// shortfall writes zero ledger rows and leaves the termin verifying
	var poorCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=911042 AND transaction_type='payment' AND reference_id=$1`, poorTermin).Scan(&poorCount)
	if poorCount != 0 {
		t.Fatalf("shortfall ledger rows = %d, want 0", poorCount)
	}
	var poorStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, poorTermin).Scan(&poorStatus)
	if poorStatus != "verifying" {
		t.Fatalf("shortfall status = %q, want verifying", poorStatus)
	}

	hACleanupProofFiles(t, pool, 911041)
	// delete hA receipt files (random names under receipts/): resolve via DB before cascade
	rows, _ := pool.Query(ctx, `SELECT payment_proof_path FROM project_payment_termins WHERE project_id IN (911041,911042)`)
	var proofPaths []string
	if rows != nil {
		for rows.Next() {
			var p *string
			_ = rows.Scan(&p)
			if p != nil && *p != "" {
				proofPaths = append(proofPaths, *p)
			}
		}
		rows.Close()
	}
	for _, rel := range proofPaths {
		if full, err := safeStorageJoin(vaultBaseDir(), rel); err == nil {
			_ = os.Remove(full)
		}
		// also try public-disk root (tests run with CWD=internal/httpapi)
		if full, err := safeStorageJoin(filepath.Join("storage", "app", "public"), rel); err == nil {
			_ = os.Remove(full)
		}
	}
	hACleanupUsers(t, pool)
	hAAssertNoLeftovers(t, pool)
}
