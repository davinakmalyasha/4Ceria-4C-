package httpapi

// hJ payment gates: loader-gate 404s, malformed-body 422s, the bad-wire-id
// 404, the paid-bid refusal, the recipient-stranger 403, plus the
// transaction-level units (unpaid-previous guards, missing-row reloads,
// the no-hire authorization scan) and two verify-proof accept happies.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// hJServeUpload builds a multipart proof upload for UploadProofHandler,
// omitting the id path value when idPath is "" so the URL tail is parsed.
func hJServeUpload(t *testing.T, pool *pgxpool.Pool, caller *roadmapCaller, projectID, typeStr, idPath, url, filename string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if filename != "" {
		p, _ := w.CreateFormFile("proof", filename)
		_, _ = p.Write(data)
	}
	_ = w.Close()
	r := httptest.NewRequest(http.MethodPost, url, &buf)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.SetPathValue("project", projectID)
	r.SetPathValue("type", typeStr)
	if idPath != "" {
		r.SetPathValue("id", idPath)
	}
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	UploadProofHandler(pool)(rec, r)
	return rec
}

func TestHJProofUploadGates(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010094, role: "user"}

	// Ghost caller: the viewer gate pins the entity-neutral 404.
	rec := hJCall(UploadProofHandler(pool), http.MethodPost, "/x", `{}`, ghost, map[string]string{"project": "1010101", "type": "termin", "id": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
		t.Fatalf("proof ghost msg = %q", got)
	}

	owner := hJMkUser(t, ctx, pool, "proofgateown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Proof Gates")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	ownerCaller := &roadmapCaller{id: owner, role: "user"}

	// Unreadable body: the proof field reads required, never a 500.
	rec = hJCall(UploadProofHandler(pool), http.MethodPost, "/x", "{oops", ownerCaller, map[string]string{"project": itoaTest(pid), "type": "termin", "id": "1"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof malformed = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "proof", "The proof field is required.")

	// Unparseable wire id: the store answers the service 404. The id
	// path value is omitted so the URL tail supplies the raw id.
	rec = hJServeUpload(t, pool, ownerCaller, itoaTest(pid), "termin", "",
		"/api/projects/"+itoaTest(pid)+"/payments/termin/hJ-9/upload-proof",
		"hJ-bad.pdf", []byte("%PDF-1.4 hJ bad\n%%EOF\n"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof bad id = %d %s", rec.Code, rec.Body.String())
	}
	body := hJDecode(t, rec)
	if got := body["message"].(string); got != "Payment record not found." {
		t.Fatalf("proof bad id msg = %q", got)
	}
	if got := body["status"].(string); got != "error" {
		t.Fatalf("proof bad id envelope = %q", got)
	}
}

func TestHJProofUploadPaidBid(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "proofpaidown", "user")
	bidder := hJMkUser(t, ctx, pool, "proofpaidbid", "arsitek")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, bidder)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Proof Paid")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()

	// A bid whose settlement already reads paid refuses another receipt.
	var profID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hJ Paid Bidder','verified') RETURNING id`, bidder).Scan(&profID); err != nil {
		t.Fatalf("profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, profID)
	var bidID int64
	const legacyID = 666001
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, status, payment_status, legacy_id) VALUES ($1,'arsitek',$2,$3,$3,'100000','100000','active','paid',$4) RETURNING id`, pid, bidder, profID, legacyID).Scan(&bidID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	_ = bidID
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	rec := hJServeUpload(t, pool, ownerCaller, itoaTest(pid), "arsitek_bid", itoaTest(legacyID),
		"/x", "hJ-paid.pdf", []byte("%PDF-1.4 hJ paid\n%%EOF\n"))
	body := hJDecode(t, rec)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof paid = %d %s", rec.Code, rec.Body.String())
	}
	if got := body["message"].(string); got != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("proof paid msg = %q", got)
	}
	if got := body["status"].(string); got != "error" {
		t.Fatalf("proof paid envelope = %q", got)
	}
}

func TestHJProofUploadVaultFail(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "proofvaultown", "user")
	bidder := hJMkUser(t, ctx, pool, "proofvaultbid", "arsitek")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, bidder)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	var profID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hJ Vault Bidder','verified') RETURNING id`, bidder).Scan(&profID); err != nil {
		t.Fatalf("profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, profID)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Proof Vault")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	termID := hJMkTermin(t, ctx, pool, pid, "hJ Vault Termin", "pending", 200000)
	const bidLegacy = 666002
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, status, payment_status, legacy_id) VALUES ($1,'arsitek',$2,$3,$3,'100000','100000','pending','unpaid',$4)`, pid, bidder, profID, bidLegacy); err != nil {
		t.Fatalf("bid: %v", err)
	}
	ownerCaller := &roadmapCaller{id: owner, role: "user"}

	// The receipts vault is unwritable: the store reports the fixed 500
	// and neither row advances.
	f, err := os.CreateTemp("", "hJ-vaultup-*")
	if err != nil {
		t.Fatalf("temp: %v", err)
	}
	f.Close()
	defer os.Remove(f.Name())
	t.Setenv("EVIDENCE_DIR", f.Name())

	rec := hJServeUpload(t, pool, ownerCaller, itoaTest(pid), "termin", itoaTest(termID),
		"/x", "hJ-v.pdf", []byte("%PDF-1.4 hJ v\n%%EOF\n"))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("vault termin = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Server Error" {
		t.Fatalf("vault termin msg = %q", got)
	}
	var tst string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, termID).Scan(&tst)
	if tst != "pending" {
		t.Fatalf("termin advanced to %s", tst)
	}

	rec = hJServeUpload(t, pool, ownerCaller, itoaTest(pid), "arsitek_bid", itoaTest(bidLegacy),
		"/x", "hJ-v.pdf", []byte("%PDF-1.4 hJ v\n%%EOF\n"))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("vault bid = %d %s", rec.Code, rec.Body.String())
	}
}

func TestHJVerifyProofGates(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010093, role: "user"}

	rec := hJCall(VerifyProofHandler(pool), http.MethodPost, "/x", `{}`, ghost, map[string]string{"project": "1010101", "type": "termin", "id": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
		t.Fatalf("verify ghost msg = %q", got)
	}

	owner := hJMkUser(t, ctx, pool, "verifygateown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify Gates")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}

	// Unreadable body degrades to empty fields: the action rule reports
	// required, never a 500.
	rec = hJCall(VerifyProofHandler(pool), http.MethodPost, "/x", "{oops", ownerCaller, map[string]string{"project": itoaTest(pid), "type": "termin", "id": "1"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify malformed = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "action", "The action field is required.")
}

func TestHJVerifyProofForbidden(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "verifyforbown", "user")
	stranger := hJMkUser(t, ctx, pool, "verifyforbstr", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, stranger)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify Forbidden")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()

	// Verifying termin addressed to the owner: a stranger is refused.
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (project_id, role_type, recipient_id, label, percentage, amount, retention_amount, net_amount, status, payment_proof_path) VALUES ($1,'arsitek',$2,'hJ Forbid',10,100000,0,100000,'verifying','receipts/hJ-forbid.pdf')`, pid, owner); err != nil {
		t.Fatalf("termin: %v", err)
	}
	var termID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_payment_termins WHERE project_id=$1`, pid).Scan(&termID)
	strangerCaller := &roadmapCaller{id: stranger, role: "user"}
	rec := hJCall(VerifyProofHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`, strangerCaller,
		map[string]string{"project": itoaTest(pid), "type": "termin", "id": itoaTest(termID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("verify forbidden = %d %s", rec.Code, rec.Body.String())
	}
	body := hJDecode(t, rec)
	if got := body["message"].(string); got != "Unauthorized. You do not have permission to verify this payment." {
		t.Fatalf("verify forbidden msg = %q", got)
	}
	if got := body["status"].(string); got != "error" {
		t.Fatalf("verify forbidden envelope = %q", got)
	}
}

func TestHJProofTxUnits(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "prooftxown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Proof Tx")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)

	// A milestone that names no row errors, it does not read as idle.
	bogus := int64(1999999999)
	if _, err := terminSubProfessional(ctx, tx, &bogus, "arsitek"); err == nil {
		t.Fatalf("sub bogus nil error")
	}

	// The percentage-zero carve-out only looks at earlier-or-equal
	// milestones; the normal path only at earlier stages.
	mid := int64(1999999998)
	if blocked, err := terminUnpaidPrevious(ctx, tx, 1999999997, "arsitek", 5, "0", &mid); err != nil || blocked {
		t.Fatalf("unpaid zero = %v %v", blocked, err)
	}
	if blocked, err := terminUnpaidPrevious(ctx, tx, 1999999997, "arsitek", 5, "10", nil); err != nil || blocked {
		t.Fatalf("unpaid normal = %v %v", blocked, err)
	}

	// Missing-row reloads answer the service 404, never a 500.
	if _, err := reloadTerminTx(ctx, tx, pool, 1999999996); err == nil {
		t.Fatalf("reload termin nil error")
	}
	if _, err := reloadAddendumTx(ctx, tx, 1999999996); err == nil {
		t.Fatalf("reload addendum nil error")
	}
	if _, err := reloadMaterialTx(ctx, tx, 1999999996); err == nil {
		t.Fatalf("reload material nil error")
	}
	if _, err := reloadBidTx(ctx, tx, pool, 1999999996, "arsitek"); err == nil {
		t.Fatalf("reload bid nil error")
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	// Pool-only reloads on the verify shape answer the same 404.
	if _, err := reloadVerifyRow(ctx, pool, &verifyTarget{verifyRow: verifyRow{physID: 1999999996, table: "project_addendums"}}); err == nil {
		t.Fatalf("reload verify addendum nil error")
	}
	if _, err := reloadVerifyRow(ctx, pool, &verifyTarget{verifyRow: verifyRow{physID: 1999999996, table: "material_orders"}}); err == nil {
		t.Fatalf("reload verify material nil error")
	}
	if _, err := reloadMaterialVerify(ctx, pool, 1999999996); err == nil {
		t.Fatalf("reload material verify nil error")
	}

	// No hired professional anywhere: the any-role scan reads false.
	tx2, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin2: %v", err)
	}
	defer tx2.Rollback(ctx)
	if verifyHiredForAnyRole(ctx, tx2, pid, owner) {
		t.Fatalf("hired any true on bare project")
	}

	// A bid row without a bidder resolves unauthorized without any read.
	bidTgt := &verifyTarget{verifyRow: verifyRow{table: "bids", role: "arsitek"}}
	if verifyAuthorized(ctx, tx2, &projectViewer{id: 1, role: "user", profiles: map[string]int64{}}, owner, bidTgt, map[string]any{}) {
		t.Fatalf("authorized bid without bidder")
	}
	if err := tx2.Rollback(ctx); err != nil {
		t.Fatalf("rollback2: %v", err)
	}
}

func TestHJVerifyAuthorizedBranches(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "vzauthown", "user")
	arsiUser := hJMkUser(t, ctx, pool, "vzautharsi", "arsitek")
	supUser := hJMkUser(t, ctx, pool, "vzauthsup", "supplier")
	stranger := hJMkUser(t, ctx, pool, "vzauthstr", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, stranger)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, supUser)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, arsiUser)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	var arsiProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hJ Arsi','verified') RETURNING id`, arsiUser).Scan(&arsiProf); err != nil {
		t.Fatalf("profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, arsiProf)
	var supID int64
	if err := pool.QueryRow(ctx, `INSERT INTO suppliers (user_id, store_name) VALUES ($1,'hJ Store') RETURNING id`, supUser).Scan(&supID); err != nil {
		t.Fatalf("supplier: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM suppliers WHERE id=$1`, supID)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Verify Auth")
	defer func() {
		pool.Exec(ctx, `DELETE FROM material_orders WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2 WHERE id=$1`, pid, arsiProf); err != nil {
		t.Fatalf("hire: %v", err)
	}
	var orderID int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, project_id, status, payment_proof_path, total_price, shipping_cost, whatsapp_order_id) VALUES ($1,$2,$3,'verifying','receipts/hJ-mat.pdf',10000,0,'hJ-wa') RETURNING id`, owner, supID, pid).Scan(&orderID); err != nil {
		t.Fatalf("order: %v", err)
	}
	var termID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, role_type, label, percentage, amount, retention_amount, net_amount, status) VALUES ($1,'arsitek','hJ Auth',10,100000,0,100000,'pending') RETURNING id`, pid).Scan(&termID); err != nil {
		t.Fatalf("termin: %v", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)

	// Termin with no recipient: the hired professional for the role
	// authorizes through the role fallback.
	role := "arsitek"
	status := "pending"
	termTgt := &verifyTarget{verifyRow: verifyRow{physID: termID, table: "project_payment_termins", roleType: "arsitek"}}
	viewer := &projectViewer{id: arsiUser, role: "arsitek", profiles: map[string]int64{"arsitek": arsiProf}}
	if !verifyAuthorized(ctx, tx, viewer, owner, termTgt, map[string]any{"role_type": &role, "status": &status}) {
		t.Fatalf("termin role fallback false")
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	// Material addressed to another supplier's user: a stranger falls
	// through every arm and reads the final refusal.
	strangerCaller := &roadmapCaller{id: stranger, role: "user"}
	rec := hJCall(VerifyProofHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`, strangerCaller,
		map[string]string{"project": itoaTest(pid), "type": "material", "id": itoaTest(orderID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("material stranger = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Unauthorized. You do not have permission to verify this payment." {
		t.Fatalf("material stranger msg = %q", got)
	}
}
