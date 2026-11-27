package httpapi

// hJ dispute coverage: the act edges the shared suite leaves dark —
// a type-linked-but-id-less refund, the over-refunded clamp, the
// NULL-status release fallback — plus the evidence store failures
// (default vault base, unwritable vault) and the project-route subject
// gate.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hJMkTermin(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID int64, label, status string, amountMinor int64) int64 {
	t.Helper()
	var id int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, role_type, label, percentage, amount, retention_amount, net_amount, status, refunded_amount) VALUES ($1,'arsitek',$2,10,$3,0,$3,$4,0) RETURNING id`, projectID, label, formatMinor(amountMinor), status).Scan(&id); err != nil {
		t.Fatalf("hJ seed termin: %v", err)
	}
	return id
}

func hJSetDisputeLink(t *testing.T, ctx context.Context, pool *pgxpool.Pool, disputeID int64, typeKey string, paymentID *int64, disputed string) {
	t.Helper()
	var typeID *int64
	if typeKey != "" {
		var tid int64
		if err := pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key=$1`, typeKey).Scan(&tid); err != nil {
			t.Fatalf("hJ registry %s: %v", typeKey, err)
		}
		typeID = &tid
	}
	if disputed == "" {
		_, err := pool.Exec(ctx, `UPDATE project_disputes SET payment_type_id=$2, payment_id=$3, disputed_amount=NULL WHERE id=$1`, disputeID, typeID, paymentID)
		if err != nil {
			t.Fatalf("hJ link dispute: %v", err)
		}
	} else {
		_, err := pool.Exec(ctx, `UPDATE project_disputes SET payment_type_id=$2, payment_id=$3, disputed_amount=$4::numeric WHERE id=$1`, disputeID, typeID, paymentID, disputed)
		if err != nil {
			t.Fatalf("hJ link dispute: %v", err)
		}
	}
}

func hJMkLedgerPayment(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID int64, typeKey string, refID int64, amountMinor int64, adminID int64) {
	t.Helper()
	var typeID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key=$1`, typeKey).Scan(&typeID); err != nil {
		t.Fatalf("hJ registry: %v", err)
	}
	_, err := pool.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, reference_type_id, reference_id, transaction_date, actor_user_id, actor_role) VALUES ($1,'payment',$2,'hJ paid',$3,$4,now(),$5,'admin')`, projectID, formatMinor(amountMinor), typeID, refID, adminID)
	if err != nil {
		t.Fatalf("hJ ledger payment: %v", err)
	}
}

func hJCleanupProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, pid, owner int64) {
	t.Helper()
	pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
	pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
}

func TestHJDisputeActRefundTypeWithoutID(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hJAdmin(t, ctx, pool)
	owner := hJMkUser(t, ctx, pool, "rfnoidown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)

	pid := hJMkProject(t, ctx, pool, owner, "hJ Refund TypeNoID")
	did := hJMkDispute(t, ctx, pool, pid, owner, "hJ Refund TypeNoID d")
	// Registry type set, payment id NULL: linked=false, same 422 as no link.
	hJSetDisputeLink(t, ctx, pool, did, "payment_termin", nil, "")

	rec := hJCall(AdminDisputeActHandler(pool), http.MethodPost, "/x", `{"action":"record_refund","amount":100}`, &admin, map[string]string{"dispute": itoaTest(did)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund type-noid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Link the disputed payment before recording a refund. Without it the platform cannot tell which payment is being returned." {
		t.Fatalf("refund type-noid msg = %q", got)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_disputes WHERE id=$1`, did).Scan(&st)
	if st != "open" {
		t.Fatalf("refund type-noid mutated to %s", st)
	}
	hJCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)
	var left int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id=$1`, pid).Scan(&left)
	if left != 0 {
		t.Fatalf("leftovers: project %d remains", pid)
	}
}

func TestHJDisputeActRefundOverRefunded(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hJAdmin(t, ctx, pool)
	owner := hJMkUser(t, ctx, pool, "rfoverown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)

	pid := hJMkProject(t, ctx, pool, owner, "hJ Refund Over")
	did := hJMkDispute(t, ctx, pool, pid, owner, "hJ Refund Over d")
	term := hJMkTermin(t, ctx, pool, pid, "hJ Termin Over", "accepted", 500000)
	hJSetDisputeLink(t, ctx, pool, did, "payment_termin", &term, "")
	hJMkLedgerPayment(t, ctx, pool, pid, "payment_termin", term, 500000, admin.id)
	// A prior reversal larger than the payment: refundable clamps at zero.
	var termType, disputeType int64
	_ = pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key='payment_termin'`).Scan(&termType)
	_ = pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key='dispute'`).Scan(&disputeType)
	if _, err := pool.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, reference_type_id, reference_id, reverses_type_id, reverses_id, transaction_date, actor_user_id, actor_role) VALUES ($1,'refund',$2,'hJ prior', $3,$4,$5,$6,now(),$7,'admin')`,
		pid, formatMinor(-600000), disputeType, did, termType, term, admin.id); err != nil {
		t.Fatalf("prior refund: %v", err)
	}

	rec := hJCall(AdminDisputeActHandler(pool), http.MethodPost, "/x", `{"action":"record_refund","amount":100}`, &admin, map[string]string{"dispute": itoaTest(did)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refund over = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Refund exceeds what is still refundable on this payment. Paid: Rp 5000.00, already refunded: Rp 6000.00, refundable: Rp 0.00." {
		t.Fatalf("refund over msg = %q", got)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_disputes WHERE id=$1`, did).Scan(&st)
	if st != "open" {
		t.Fatalf("refund over mutated to %s", st)
	}
	hJCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)
}

func TestHJDisputeActReleaseNullStatus(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hJAdmin(t, ctx, pool)
	owner := hJMkUser(t, ctx, pool, "relnullown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)

	pid := hJMkProject(t, ctx, pool, owner, "hJ Release NullSt")
	did := hJMkDispute(t, ctx, pool, pid, owner, "hJ Release NullSt d")
	// Addendum with an empty lifecycle state: PaymentState falls back to
	// Status (both empty) and the release proceeds.
	var addID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status) VALUES ($1,'arsitek',$2,'hJ Null Addendum',200000,NULL) RETURNING id`, pid, owner).Scan(&addID); err != nil {
		t.Fatalf("addendum: %v", err)
	}
	hJSetDisputeLink(t, ctx, pool, did, "addendum", &addID, "")

	rec := hJCall(AdminDisputeActHandler(pool), http.MethodPost, "/x", `{"action":"release_payment"}`, &admin, map[string]string{"dispute": itoaTest(did)})
	if rec.Code != http.StatusOK {
		t.Fatalf("release nullstat = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Payment released and recorded. Dispute closed." {
		t.Fatalf("release nullstat msg = %q", got)
	}
	var ast, dst, dres string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addID).Scan(&ast)
	_ = pool.QueryRow(ctx, `SELECT status::text, resolution::text FROM project_disputes WHERE id=$1`, did).Scan(&dst, &dres)
	if ast != "paid" || dst != "resolved" || dres != "release_payment" {
		t.Fatalf("post-state = addendum %s dispute %s/%s want paid/resolved/release_payment", ast, dst, dres)
	}
	var payAmt, payTitle string
	if err := pool.QueryRow(ctx, `SELECT amount::text, title FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' ORDER BY id DESC LIMIT 1`, pid).Scan(&payAmt, &payTitle); err != nil {
		t.Fatalf("ledger: %v", err)
	}
	if payAmt != "200000.00" || payTitle != "Payment: hJ Null Addendum" {
		t.Fatalf("ledger = %q %q", payAmt, payTitle)
	}
	hJCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, did)
}

func TestHJServeEvidenceSubjectGate(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "evsubown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Evidence Subject")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	did := hJMkDispute(t, ctx, pool, pid, owner, "hJ Evidence Subject d")
	var mid int64
	if err := pool.QueryRow(ctx, `INSERT INTO dispute_messages (dispute_id, user_id, body) VALUES ($1,$2,'hJ no evidence') RETURNING id`, did, owner).Scan(&mid); err != nil {
		t.Fatalf("message: %v", err)
	}

	// The caller names no users row: the subject load fails and the
	// project route answers the fixed 500 (never a gate 404 here).
	ghost := &roadmapCaller{id: 1010098, role: "user"}
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.SetPathValue("project", itoaTest(pid))
	r.SetPathValue("dispute", itoaTest(did))
	r.SetPathValue("message", itoaTest(mid))
	r = r.WithContext(withCaller(r.Context(), *ghost))
	rec := httptest.NewRecorder()
	ProjectDisputeEvidenceHandler(pool)(rec, r)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("evidence ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Server Error" {
		t.Fatalf("evidence ghost message = %q", got)
	}
}

func hJMultipart(t *testing.T, fields map[string]string, fileField, filename string, data []byte) (string, *bytes.Buffer) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if fileField != "" {
		p, _ := w.CreateFormFile(fileField, filename)
		_, _ = p.Write(data)
	}
	_ = w.Close()
	return w.FormDataContentType(), &buf
}

func TestHJReplyEvidenceStoreFail(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "evfailown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Evidence Fail")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	did := hJMkDispute(t, ctx, pool, pid, owner, "hJ Evidence Fail d")
	ownerCaller := &roadmapCaller{id: owner, role: "user"}

	// A vault base that is a file, not a directory: the mkdir fails and
	// the reply answers the fixed 500 with no message row.
	f, err := os.CreateTemp("", "hJ-evbase-*")
	if err != nil {
		t.Fatalf("temp: %v", err)
	}
	f.Close()
	defer os.Remove(f.Name())
	t.Setenv("EVIDENCE_DIR", f.Name())

	ctype, buf := hJMultipart(t, map[string]string{"body": "hJ fail"}, "evidence", "hJ-ev.pdf", []byte("%PDF-1.4 hJ fail\n%%EOF\n"))
	r := httptest.NewRequest(http.MethodPost, "/x", buf)
	r.Header.Set("Content-Type", ctype)
	r.SetPathValue("dispute", itoaTest(did))
	r = r.WithContext(withCaller(r.Context(), *ownerCaller))
	rec := httptest.NewRecorder()
	AdminDisputeReplyHandler(pool)(rec, r)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("reply storefail = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Server Error" {
		t.Fatalf("reply storefail message = %q", got)
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM dispute_messages WHERE dispute_id=$1`, did).Scan(&n)
	if n != 0 {
		t.Fatalf("reply storefail wrote %d messages", n)
	}
}

func TestHJReplyEvidenceDefaultBase(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "evdefown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Evidence Default")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	did := hJMkDispute(t, ctx, pool, pid, owner, "hJ Evidence Default d")
	ownerCaller := &roadmapCaller{id: owner, role: "user"}

	// No EVIDENCE_DIR: the store falls back to the local vault mirror.
	old, had := os.LookupEnv("EVIDENCE_DIR")
	os.Unsetenv("EVIDENCE_DIR")
	defer func() {
		if had {
			os.Setenv("EVIDENCE_DIR", old)
		}
	}()

	ctype, buf := hJMultipart(t, map[string]string{"body": "hJ default"}, "evidence", "hJ-def.pdf", []byte("%PDF-1.4 hJ default\n%%EOF\n"))
	r := httptest.NewRequest(http.MethodPost, "/x", buf)
	r.Header.Set("Content-Type", ctype)
	r.SetPathValue("dispute", itoaTest(did))
	r = r.WithContext(withCaller(r.Context(), *ownerCaller))
	rec := httptest.NewRecorder()
	AdminDisputeReplyHandler(pool)(rec, r)
	if rec.Code != http.StatusCreated {
		t.Fatalf("reply default = %d %s", rec.Code, rec.Body.String())
	}
	var evPath, evName string
	if err := pool.QueryRow(ctx, `SELECT evidence_path::text, evidence_original_name::text FROM dispute_messages WHERE dispute_id=$1 ORDER BY id DESC LIMIT 1`, did).Scan(&evPath, &evName); err != nil {
		t.Fatalf("row: %v", err)
	}
	if evName != "hJ-def.pdf" {
		t.Fatalf("name = %q want hJ-def.pdf", evName)
	}
	prefix := "disputes/" + itoaTest(did) + "/"
	if len(evPath) < len(prefix)+5 || evPath[:len(prefix)] != prefix || evPath[len(evPath)-4:] != ".pdf" {
		t.Fatalf("path = %q", evPath)
	}
	full, err := safeStorageJoin(filepath.Join("storage", "app", "public"), evPath)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	got, err := os.ReadFile(full)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(got) != "%PDF-1.4 hJ default\n%%EOF\n" {
		t.Fatalf("bytes = %q", string(got))
	}
	// Zero leftovers: drop the message row and the vault file we wrote.
	pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id=$1`, did)
	if err := os.Remove(full); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if _, err := os.Stat(full); !os.IsNotExist(err) {
		t.Fatalf("file remains: %s", full)
	}
}
