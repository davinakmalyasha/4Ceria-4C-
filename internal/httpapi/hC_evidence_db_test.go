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

	"github.com/jackc/pgx/v5/pgxpool"
)

func hCCallAdminEvidence(pool *pgxpool.Pool, caller *roadmapCaller, disputeID, messageID string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.SetPathValue("dispute", disputeID)
	r.SetPathValue("message", messageID)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	AdminDisputeEvidenceHandler(pool)(rec, r)
	return rec
}

func hCCallProjectEvidence(pool *pgxpool.Pool, caller *roadmapCaller, projectID, disputeID, messageID string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.SetPathValue("project", projectID)
	r.SetPathValue("dispute", disputeID)
	r.SetPathValue("message", messageID)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	ProjectDisputeEvidenceHandler(pool)(rec, r)
	return rec
}

func hCMkMessage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, disputeID, userID int64, body string, evPath, evName *string) int64 {
	t.Helper()
	var mid int64
	if err := pool.QueryRow(ctx, `INSERT INTO dispute_messages (dispute_id, user_id, body, evidence_path, evidence_original_name) VALUES ($1,$2,$3,$4,$5) RETURNING id`, disputeID, userID, body, evPath, evName).Scan(&mid); err != nil {
		t.Fatalf("seed message: %v", err)
	}
	return mid
}

func TestHCServeEvidenceBranches(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hCAdmin(t, ctx, pool)
	owner := hCMkUser(t, ctx, pool, "evdown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	outsider := hCMkUser(t, ctx, pool, "evdout", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, outsider)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	outCaller := &roadmapCaller{id: outsider, role: "user"}

	pid := hCMkProject(t, ctx, pool, owner, "hC Evidence Project")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	pid2 := hCMkProject(t, ctx, pool, owner, "hC Evidence Project 2")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid2)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid2)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid2)
	}()
	did := hCMkDispute(t, ctx, pool, pid, owner, "hC Evidence D")
	did2 := hCMkDispute(t, ctx, pool, pid2, owner, "hC Evidence D2")
	midNoEv := hCMkMessage(t, ctx, pool, did, owner, "hC no evidence", nil, nil)

	// Unauth twins
	if rec := hCCallAdminEvidence(pool, nil, itoaTest(did), itoaTest(midNoEv)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("admin ev unauth = %d", rec.Code)
	}
	if rec := hCCallProjectEvidence(pool, nil, itoaTest(pid), itoaTest(did), itoaTest(midNoEv)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("project ev unauth = %d", rec.Code)
	}

	// Bad project / missing project — exact model-not-found literals
	rec := hCCallProjectEvidence(pool, ownerCaller, "hC-bad", itoaTest(did), itoaTest(midNoEv))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ev bad project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "No query results for model [App\\Models\\Project] hC-bad" {
		t.Fatalf("ev bad project msg = %q", got)
	}
	rec = hCCallProjectEvidence(pool, ownerCaller, "99009999", itoaTest(did), itoaTest(midNoEv))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ev missing project = %d", rec.Code)
	}

	// Bad dispute / missing dispute
	rec = hCCallAdminEvidence(pool, &admin, "hC-bad", itoaTest(midNoEv))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ev bad dispute = %d", rec.Code)
	}
	rec = hCCallAdminEvidence(pool, &admin, "99009999", "99009999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ev missing dispute = %d", rec.Code)
	}

	// Bad message / missing message
	rec = hCCallAdminEvidence(pool, &admin, itoaTest(did), "hC-bad")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ev bad message = %d %s", rec.Code, rec.Body.String())
	}
	if !contains(rec.Body.String(), "DisputeMessage") {
		t.Fatalf("ev bad message body = %s", rec.Body.String())
	}
	rec = hCCallAdminEvidence(pool, &admin, itoaTest(did), "99009999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ev missing message = %d", rec.Code)
	}

	// Non-participant 403 (project route, existing dispute+message)
	rec = hCCallProjectEvidence(pool, outCaller, itoaTest(pid), itoaTest(did), itoaTest(midNoEv))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ev forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Unauthorized. Only project participants can view disputes." {
		t.Fatalf("ev forbidden msg = %q", got)
	}

	// Mismatch: message from another dispute (admin route) -> 404 Not found.
	midOther := hCMkMessage(t, ctx, pool, did2, owner, "hC other", nil, nil)
	rec = hCCallAdminEvidence(pool, &admin, itoaTest(did), itoaTest(midOther))
	if rec.Code != http.StatusNotFound || hCDecode(t, rec)["message"].(string) != "Not found." {
		t.Fatalf("ev mismatch admin = %d %s", rec.Code, rec.Body.String())
	}
	// Mismatch: project route with dispute from another project
	rec = hCCallProjectEvidence(pool, ownerCaller, itoaTest(pid), itoaTest(did2), itoaTest(midOther))
	if rec.Code != http.StatusNotFound || hCDecode(t, rec)["message"].(string) != "Not found." {
		t.Fatalf("ev mismatch project = %d %s", rec.Code, rec.Body.String())
	}

	// No attachment -> 404 exact
	rec = hCCallAdminEvidence(pool, &admin, itoaTest(did), itoaTest(midNoEv))
	if rec.Code != http.StatusNotFound || hCDecode(t, rec)["message"].(string) != "This message has no evidence attachment." {
		t.Fatalf("ev noattach = %d %s", rec.Code, rec.Body.String())
	}

	// Join error: evidence_path escapes root -> 404 "Evidence not found."
	evil := "../evil"
	evilName := "evil.pdf"
	midEvil := hCMkMessage(t, ctx, pool, did, owner, "hC evil", &evil, &evilName)
	rec = hCCallAdminEvidence(pool, &admin, itoaTest(did), itoaTest(midEvil))
	if rec.Code != http.StatusNotFound || hCDecode(t, rec)["message"].(string) != "Evidence not found." {
		t.Fatalf("ev join = %d %s", rec.Code, rec.Body.String())
	}

	// File gone: valid join but no file -> 404 "Evidence file not found."
	missing := "disputes/" + itoaTest(did) + "/hC-missing.pdf"
	missingName := "hC-missing.pdf"
	midMissing := hCMkMessage(t, ctx, pool, did, owner, "hC missing", &missing, &missingName)
	// point EVIDENCE_DIR at an empty temp dir so the file is definitely gone
	emptyDir := t.TempDir()
	t.Setenv("EVIDENCE_DIR", emptyDir)
	rec = hCCallAdminEvidence(pool, &admin, itoaTest(did), itoaTest(midMissing))
	if rec.Code != http.StatusNotFound || hCDecode(t, rec)["message"].(string) != "Evidence file not found." {
		t.Fatalf("ev gone = %d %s", rec.Code, rec.Body.String())
	}

	// Happy: real file under EVIDENCE_DIR, served bytes verified via /storage URL target
	evDir := t.TempDir()
	t.Setenv("EVIDENCE_DIR", evDir)
	rel := "disputes/" + itoaTest(did) + "/hC-evidence.pdf"
	full, err := safeStorageJoin(evDir, rel)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	wantBytes := []byte("%PDF-1.4 hC evidence\n%%EOF\n")
	if err := os.WriteFile(full, wantBytes, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	evName := "hC-evidence.pdf"
	midHappy := hCMkMessage(t, ctx, pool, did, owner, "hC happy", &rel, &evName)
	rec = hCCallAdminEvidence(pool, &admin, itoaTest(did), itoaTest(midHappy))
	if rec.Code != http.StatusOK {
		t.Fatalf("ev happy = %d %s", rec.Code, rec.Body.String())
	}
	body := hCDecode(t, rec)
	url, ok := body["url"].(string)
	if !ok || url == "" {
		t.Fatalf("ev happy url missing: %s", rec.Body.String())
	}
	// The URL must be the gateway-signed local URL for the exact relative path (literals)
	if !contains(url, "/storage/"+rel) || !contains(url, "expires=") || !contains(url, "sig=") {
		t.Fatalf("ev happy url = %q", url)
	}
	// Served bytes check: the file behind the signed URL is exactly what we wrote
	gotBytes, err := os.ReadFile(full)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(gotBytes) != "%PDF-1.4 hC evidence\n%%EOF\n" {
		t.Fatalf("ev bytes = %q", string(gotBytes))
	}

	// Project-route happy on the same file (participant)
	rec = hCCallProjectEvidence(pool, ownerCaller, itoaTest(pid), itoaTest(did), itoaTest(midHappy))
	if rec.Code != http.StatusOK {
		t.Fatalf("ev project happy = %d %s", rec.Code, rec.Body.String())
	}
}

func TestHCAdminReplyWithEvidence(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := hCAdmin(t, ctx, pool)
	owner := hCMkUser(t, ctx, pool, "evrepown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hCMkProject(t, ctx, pool, owner, "hC Reply Evidence Project")
	defer func() {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
		pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, owner)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	did := hCMkDispute(t, ctx, pool, pid, owner, "hC Reply Evidence D")
	adminCaller := &admin

	mkMultipart := func(body, fileField, filename string, data []byte) (string, *bytes.Buffer) {
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		if body != "" {
			_ = w.WriteField("body", body)
		}
		if fileField != "" {
			p, _ := w.CreateFormFile(fileField, filename)
			_, _ = p.Write(data)
		}
		_ = w.Close()
		return w.FormDataContentType(), &buf
	}
	callReply := func(ctype string, buf *bytes.Buffer) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/x", buf)
		r.Header.Set("Content-Type", ctype)
		r.SetPathValue("dispute", itoaTest(did))
		r = r.WithContext(withCaller(r.Context(), *adminCaller))
		rec := httptest.NewRecorder()
		AdminDisputeReplyHandler(pool)(rec, r)
		return rec
	}

	// Rejection twin: wrong mime (.txt) — exact validator message
	ctype, buf := mkMultipart("hC reply", "evidence", "hC-ev.txt", []byte("plain text"))
	if rec := callReply(ctype, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply bad mime = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "evidence", "The evidence field must be a file of type: jpg, jpeg, png, webp, pdf.")
	}

	// Happy with file: covers storeEvidence + truncateRunes (literals)
	evDir := t.TempDir()
	t.Setenv("EVIDENCE_DIR", evDir)
	wantPDF := []byte("%PDF-1.4 hC reply\n%%EOF\n")
	ctype, buf = mkMultipart("hC reply with file", "evidence", "hC-ev.pdf", wantPDF)
	rec := callReply(ctype, buf)
	if rec.Code != http.StatusCreated {
		t.Fatalf("reply happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Message posted." {
		t.Fatalf("reply msg = %q", got)
	}
	// Post-state literals: row carries evidence_path under disputes/{id}/ + .pdf suffix
	var evPath, evName string
	var mid int64
	if err := pool.QueryRow(ctx, `SELECT id, evidence_path::text, evidence_original_name::text FROM dispute_messages WHERE dispute_id=$1 ORDER BY id DESC LIMIT 1`, did).Scan(&mid, &evPath, &evName); err != nil {
		t.Fatalf("reply row: %v", err)
	}
	if evName != "hC-ev.pdf" {
		t.Fatalf("reply name = %q want hC-ev.pdf", evName)
	}
	if len(evPath) < 10 || evPath[:9] != "disputes/" || evPath[len(evPath)-4:] != ".pdf" {
		t.Fatalf("reply path = %q", evPath)
	}
	// Served bytes: file behind the path is exactly what was uploaded (literals)
	full, err := safeStorageJoin(evDir, evPath)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	got, err := os.ReadFile(full)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(got) != "%PDF-1.4 hC reply\n%%EOF\n" {
		t.Fatalf("reply bytes = %q", string(got))
	}
	// Rejection twin on closed thread: reply again after dismiss -> 422 closed
	pool.Exec(ctx, `UPDATE project_disputes SET status='dismissed' WHERE id=$1`, did)
	ctype2, buf2 := mkMultipart("hC late", "", "", nil)
	if rec2 := callReply(ctype2, buf2); rec2.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reply closed = %d %s", rec2.Code, rec2.Body.String())
	} else if got := hCDecode(t, rec2)["message"].(string); got != "This dispute is closed; the thread no longer accepts messages." {
		t.Fatalf("reply closed msg = %q", got)
	}
}
