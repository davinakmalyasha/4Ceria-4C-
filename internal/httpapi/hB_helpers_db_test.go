package httpapi

// hB scheduler jobs plus the DB-free remainder: rls, columns,
// respond/request helpers and storage helpers.

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestHBSchedulerJobs(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	logger := slog.Default()

	// Auto-complete: a stale delivered order completes, a fresh one stays.
	var staleID, freshID int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, total_price, whatsapp_order_id, status)
		VALUES ($1, (SELECT id FROM suppliers WHERE user_id = $1), 10000, 'hB-wa-1', 'delivered') RETURNING id`,
		fx.supplier.id).Scan(&staleID); err != nil {
		t.Fatalf("stale order: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, total_price, whatsapp_order_id, status)
		VALUES ($1, (SELECT id FROM suppliers WHERE user_id = $1), 10000, 'hB-wa-2', 'delivered') RETURNING id`,
		fx.supplier.id).Scan(&freshID); err != nil {
		t.Fatalf("fresh order: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE material_orders SET updated_at = now() - interval '4 days' WHERE id = $1`, staleID); err != nil {
		t.Fatalf("backdate: %v", err)
	}
	if err := AutoCompleteOrders(ctx, pool, logger); err != nil {
		t.Fatalf("auto-complete: %v", err)
	}
	var staleStatus, freshStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id = $1`, staleID).Scan(&staleStatus)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id = $1`, freshID).Scan(&freshStatus)
	if staleStatus != "completed" || freshStatus != "delivered" {
		t.Fatalf("orders = %s/%s", staleStatus, freshStatus)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM material_orders WHERE id IN ($1,$2)`, staleID, freshID); err != nil {
		t.Fatalf("order cleanup: %v", err)
	}

	// Snag escalation: only the overdue un-escalated open row is stamped.
	var overdueID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_snag_items (project_id, title, reported_by, status, due_at)
		VALUES ($1, 'hB snag', $2, 'open', now() - interval '2 days') RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&overdueID); err != nil {
		t.Fatalf("snag: %v", err)
	}
	var resolvedID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_snag_items (project_id, title, reported_by, status, due_at)
		VALUES ($1, 'hB done', $2, 'resolved', now() - interval '9 days') RETURNING id`,
		fx.projectID, fx.owner.id).Scan(&resolvedID); err != nil {
		t.Fatalf("resolved snag: %v", err)
	}
	if err := EscalateOverdueSnags(ctx, pool, logger); err != nil {
		t.Fatalf("escalate: %v", err)
	}
	var escalatedAt *time.Time
	_ = pool.QueryRow(ctx, `SELECT escalated_at FROM project_snag_items WHERE id = $1`, overdueID).Scan(&escalatedAt)
	if escalatedAt == nil {
		t.Fatal("overdue snag not escalated")
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_snag_items WHERE id IN ($1,$2)`, overdueID, resolvedID); err != nil {
		t.Fatalf("snag cleanup: %v", err)
	}

	// Prune: ancient rows go, fresh rows stay.
	if _, err := pool.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, created_at, updated_at)
		VALUES ($1, 'hB_old', 'hB', 'hB', now() - interval '100 days', now() - interval '100 days')`, fx.owner.id); err != nil {
		t.Fatalf("old notif: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO rate_limit_hits (key, hit_at) VALUES ('hB-old-key', now() - interval '2 hours')`); err != nil {
		t.Fatalf("old hit: %v", err)
	}
	var hasExpiry int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns
		WHERE table_name = 'personal_access_tokens' AND column_name = 'expires_at'`).Scan(&hasExpiry)
	if hasExpiry > 0 {
		if _, err := pool.Exec(ctx, `INSERT INTO personal_access_tokens
			(tokenable_type, tokenable_id, name, token, expires_at, created_at, updated_at)
			VALUES ('App\Models\User', $1, 'hB', 'hB-old-token', now() - interval '1 day', now(), now())`, fx.owner.id); err != nil {
			t.Fatalf("old token: %v", err)
		}
	}
	if err := PruneExpired(ctx, pool, logger); err != nil {
		t.Fatalf("prune: %v", err)
	}
	var oldNotif, oldHits int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'hB_old'`, fx.owner.id).Scan(&oldNotif)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM rate_limit_hits WHERE key = 'hB-old-key'`).Scan(&oldHits)
	if oldNotif != 0 || oldHits != 0 {
		t.Fatalf("prune leftovers: notif=%d hits=%d", oldNotif, oldHits)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM personal_access_tokens WHERE token = 'hB-old-token'`)
}

func TestHBRunWithLock(t *testing.T) {
	pool := hBPool(t)
	_ = hBSetup(t, pool)
	ctx := context.Background()
	logger := slog.Default()

	fired := false
	runWithLock(ctx, pool, logger, 4199, "hB", func(context.Context) error {
		fired = true
		return nil
	})
	if !fired {
		t.Fatal("runWithLock did not run the job")
	}
	// A failing job is logged, not fatal.
	runWithLock(ctx, pool, logger, 4199, "hB", func(context.Context) error {
		return context.DeadlineExceeded
	})
}

func TestHBRLSAndColumns(t *testing.T) {
	pool := hBPool(t)
	_ = hBSetup(t, pool)
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)
	if err := setAppUser(ctx, tx, hBOwnerID); err != nil {
		t.Fatalf("setAppUser: %v", err)
	}
	var current string
	if err := tx.QueryRow(ctx, `SELECT current_setting('app.user_id', true)`).Scan(&current); err != nil || current != "920001" {
		t.Fatalf("app.user_id = %q, %v", current, err)
	}
	if err := setAppUser(ctx, tx, 0); err != nil {
		t.Fatalf("setAppUser zero: %v", err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	if int64String(0) != "" || int64String(920001) != "920001" || int64String(-42) != "-42" {
		t.Fatalf("int64String: %q %q %q", int64String(0), int64String(920001), int64String(-42))
	}
	if uintString(0) != "0" || uintString(920001) != "920001" {
		t.Fatalf("uintString: %q %q", uintString(0), uintString(920001))
	}

	if got := profileRowColumns("arsiteks"); got == "*" || got == "" || got == "id" {
		t.Fatalf("profileRowColumns arsiteks = %q", got)
	}
	if got := profileRowColumns("nope"); got != "id" {
		t.Fatalf("profileRowColumns unknown = %q", got)
	}
	if got := ratingsRowColumns("arsitek_id"); !strings.Contains(got, "arsitek_id") {
		t.Fatalf("ratingsRowColumns = %q", got)
	}
}

func TestHBRespondHelpers(t *testing.T) {
	// writeJSONPublic: ETag + 304 on match.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	body := map[string]any{"hello": "hB"}
	writeJSONPublic(rec, req, http.StatusOK, body, 60)
	if rec.Code != http.StatusOK {
		t.Fatalf("public = %d", rec.Code)
	}
	etag := rec.Header().Get("ETag")
	if !strings.HasPrefix(etag, `W/"`) {
		t.Fatalf("etag = %q", etag)
	}
	if vary := rec.Header().Get("Vary"); !strings.Contains(vary, "Accept-Encoding") {
		t.Fatalf("vary = %q", vary)
	}
	cached := httptest.NewRequest(http.MethodGet, "/x", nil)
	cached.Header.Set("If-None-Match", etag)
	rec2 := httptest.NewRecorder()
	writeJSONPublic(rec2, cached, http.StatusOK, body, 60)
	if rec2.Code != http.StatusNotModified {
		t.Fatalf("304 = %d", rec2.Code)
	}
	wild := httptest.NewRequest(http.MethodGet, "/x", nil)
	wild.Header.Set("If-None-Match", "*")
	rec3 := httptest.NewRecorder()
	writeJSONPublic(rec3, wild, http.StatusOK, body, 60)
	if rec3.Code != http.StatusNotModified {
		t.Fatalf("wildcard 304 = %d", rec3.Code)
	}

	if !etagMatches("*", etag) || !etagMatches(etag, etag) || etagMatches("", etag) {
		t.Fatal("etagMatches mismatch")
	}
	strong := strings.TrimPrefix(etag, "W/")
	if !etagMatches(strong, etag) {
		t.Fatal("etagMatches strong form")
	}

	// validationError and apiNotFound shapes.
	rec = httptest.NewRecorder()
	validationError(rec, "The given data was invalid.", map[string][]string{"name": {"required"}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("validation = %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	apiNotFound(rec, "/api/hB-nope")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("apiNotFound = %d", rec.Code)
	}
	if got := sortedKeys(map[string]int{"b": 1, "a": 2}); len(got) != 2 || got[0] != "a" {
		t.Fatalf("sortedKeys = %v", got)
	}
}

func TestHBRequestHelpers(t *testing.T) {
	// clientIP trusts X-Forwarded-For only from configured proxies.
	t.Setenv("TRUSTED_PROXIES", "127.0.0.1")
	proxied := httptest.NewRequest(http.MethodGet, "/x", nil)
	proxied.RemoteAddr = "127.0.0.1:1234"
	proxied.Header.Set("X-Forwarded-For", "203.0.113.9, 127.0.0.1")
	if got := clientIP(proxied); got != "203.0.113.9" {
		t.Fatalf("clientIP proxied = %q", got)
	}
	direct := httptest.NewRequest(http.MethodGet, "/x", nil)
	direct.RemoteAddr = "203.0.113.7:1234"
	direct.Header.Set("X-Forwarded-For", "198.51.100.3")
	if got := clientIP(direct); got != "203.0.113.7" {
		t.Fatalf("clientIP direct = %q", got)
	}
	os.Unsetenv("TRUSTED_PROXIES")
	bare := httptest.NewRequest(http.MethodGet, "/x", nil)
	bare.RemoteAddr = "203.0.113.7:1234"
	if got := clientIP(bare); got != "203.0.113.7" {
		t.Fatalf("clientIP bare = %q", got)
	}
	if !isLoopbackIP("127.0.0.1") || isLoopbackIP("203.0.113.7") {
		t.Fatal("isLoopbackIP")
	}
	if got := forwardedChain("203.0.113.9, 198.51.100.3"); len(got) != 2 {
		t.Fatalf("forwardedChain = %v", got)
	}
	if got := forwardedChain(""); len(got) != 0 {
		t.Fatalf("forwardedChain empty = %v", got)
	}

	// Proto: TLS wins, then the proxy header from a trusted peer.
	t.Setenv("TRUSTED_PROXIES", "127.0.0.1")
	plain := httptest.NewRequest(http.MethodGet, "/x", nil)
	plain.RemoteAddr = "127.0.0.1:1"
	plain.Header.Set("X-Forwarded-Proto", "https")
	if got := forwardedProto(plain); got != "https" {
		t.Fatalf("proto = %q", got)
	}
	tlsReq := httptest.NewRequest(http.MethodGet, "https://hB.test/x", nil)
	if got := forwardedProto(tlsReq); got != "https" {
		t.Fatalf("tls proto = %q", got)
	}
	os.Unsetenv("TRUSTED_PROXIES")

	// Origins and bases.
	t.Setenv("FRONTEND_URL", "https://hB-app.test")
	if got := frontendBase(); got != "https://hB-app.test" {
		t.Fatalf("frontendBase = %q", got)
	}
	os.Unsetenv("FRONTEND_URL")
	if got := frontendBase(); got != "http://127.0.0.1:3000" {
		t.Fatalf("frontend default = %q", got)
	}
	t.Setenv("PUBLIC_ASSET_BASE", "https://hB-cdn.test/")
	if got := assetBaseOf(context.Background()); got != "https://hB-cdn.test" {
		t.Fatalf("assetBaseOf = %q", got)
	}
	os.Unsetenv("PUBLIC_ASSET_BASE")
	hostReq := httptest.NewRequest(http.MethodGet, "/x", nil)
	hostReq.Host = "hB.test"
	hostReq.Header.Set("X-Forwarded-Proto", "https")
	if got := requestOrigin(hostReq); got != "https://hB.test" {
		t.Fatalf("origin = %q", got)
	}

	// Dotenv loader: no override of existing keys, quotes stripped.
	envFile := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(envFile, []byte("# hB\nHB_DOT_A=one\nHB_DOT_B=\"two\"\nHB_DOT_C='three'\nBADLINE\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HB_DOT_A", "keep")
	LoadDotEnv(envFile)
	if os.Getenv("HB_DOT_A") != "keep" || os.Getenv("HB_DOT_B") != "two" || os.Getenv("HB_DOT_C") != "three" {
		t.Fatalf("dotenv: %q %q %q", os.Getenv("HB_DOT_A"), os.Getenv("HB_DOT_B"), os.Getenv("HB_DOT_C"))
	}
	LoadDotEnv(filepath.Join(t.TempDir(), "missing.env"))
}

func TestHBStorageHelpers(t *testing.T) {
	dir := t.TempDir()

	// safeStorageJoin: ok, traversal, absolute, drive, empty, NUL.
	if full, err := safeStorageJoin(dir, "vault/hB.pdf"); err != nil {
		t.Fatalf("join ok: %v", err)
	} else if !strings.HasPrefix(full, dir) {
		t.Fatalf("join outside: %q", full)
	}
	// A leading slash is normalised, not an escape; the rest must fail.
	if full, err := safeStorageJoin(dir, "/abs"); err != nil || !strings.HasPrefix(full, dir) {
		t.Fatalf("join slash: %v %q", err, full)
	}
	for _, bad := range []string{"", "../escape", "..\\escape", "C:/win", "//unc/share", "./C:/win", "a/../../b"} {
		if _, err := safeStorageJoin(dir, bad); err == nil {
			t.Fatalf("join accepted %q", bad)
		}
	}
	if _, err := safeStorageJoin(dir, "nul\x00byte"); err == nil {
		t.Fatal("join accepted NUL")
	}
	if !unsafeStorageRelative("C:/x") || unsafeStorageRelative("ok/rel") {
		t.Fatal("unsafeStorageRelative inverted")
	}
	if !isASCIILetter('a') || isASCIILetter('1') {
		t.Fatal("isASCIILetter")
	}

	// Extension sanitising.
	if sanitiseExtension("photo.JPG") != "jpg" || sanitiseExtension("a/b/c.Pdf") != "pdf" {
		t.Fatal("sanitise basic")
	}
	for _, bad := range []string{"noext", "a.", "a.toolongext", "a.pn g", "a.p-df"} {
		if sanitiseExtension(bad) != "" {
			t.Fatalf("sanitise %q = %q", bad, sanitiseExtension(bad))
		}
	}
	if sanitiseExtension("archive.tar.gz") != "gz" {
		t.Fatalf("sanitise gz = %q", sanitiseExtension("archive.tar.gz"))
	}

	// HMAC sign/verify round-trip, expiry and tamper branches.
	exp := time.Now().Add(time.Hour).Unix()
	sig := signStorageURL("vault/hB.pdf", exp)
	if !verifyStorageURL("vault/hB.pdf", exp, sig) {
		t.Fatal("verify fresh")
	}
	if verifyStorageURL("vault/hB.pdf", time.Now().Add(-time.Hour).Unix(), sig) {
		t.Fatal("verify expired")
	}
	if verifyStorageURL("vault/hB.pdf", exp, sig+"00") {
		t.Fatal("verify tampered")
	}
	if s3Configured() {
		t.Fatal("s3 must be unconfigured in tests")
	}
	if _, ok := presignedS3Get(context.Background(), "k", time.Minute); ok {
		t.Fatal("presignedS3Get without config")
	}
	if _, ok := presignedS3Put(context.Background(), "k", "text/plain", time.Minute); ok {
		t.Fatal("presignedS3Put without config")
	}

	// The storage handler: public bytes serve, private needs auth,
	// missing is 404, traversal is 404.
	local := presignedLocalURL("vault/hB.pdf", time.Minute)
	if !strings.HasPrefix(local, "/storage/vault/hB.pdf?expires=") || !strings.Contains(local, "&sig=") {
		t.Fatalf("presigned local = %q", local)
	}
	if got := storageSignedURL("vault/hB.pdf"); !strings.HasPrefix(got, "/storage/vault/hB.pdf") {
		t.Fatalf("storageSignedURL = %v", got)
	}
	_ = storageSignedURLFor(context.Background(), "vault/hB.pdf")

	// Roots and visibility.
	if !isPublicStoragePath("project_images/hB.jpg") || isPublicStoragePath("vault/hB.pdf") {
		t.Fatal("public prefix")
	}
	t.Setenv("EVIDENCE_DIR", dir)
	if got := storageRootFor("vault/hB.pdf"); got != dir {
		t.Fatalf("evidence root = %q", got)
	}
	os.Unsetenv("EVIDENCE_DIR")
	if got := storageRootFor("vault/hB.pdf"); got == "" {
		t.Fatal("fallback root empty")
	}

	// resolveStorageURL: external passthrough, s3-prefix strip, public
	// absolute, private signed.
	if got := resolveStorageURL(context.Background(), ""); got != nil {
		t.Fatalf("resolve empty = %v", got)
	}
	ext := "https://cdn.test/hB.jpg"
	if got := resolveStorageURL(context.Background(), ext); got != ext {
		t.Fatalf("resolve external = %v", got)
	}
	if got := resolveStorageURL(context.Background(), "project_images/hB.jpg"); got == nil {
		t.Fatal("resolve public nil")
	}
	priv := resolveStorageURL(context.Background(), "vault/hB.pdf")
	if s, _ := priv.(string); !strings.HasPrefix(s, "/storage/vault/hB.pdf?expires=") {
		t.Fatalf("resolve private = %v", priv)
	}
	s3path := "https://t3.storageapi.dev/fourc-storage-fneicjrzkq3/vault/hB.pdf"
	if got := resolveStorageURL(context.Background(), s3path); got == nil {
		t.Fatal("resolve s3 prefix nil")
	}

	// The storage handler: public bytes serve, private needs auth,
	// missing is 404, traversal is 404.
	pubRel := "project_assets/hB-pub.jpg"
	full, err := safeStorageJoin(dir, pubRel)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte{0xFF, 0xD8, 0xFF, 0xD9}, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PUBLIC_STORAGE_ROOT", dir)
	router := &Router{}
	serve := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/storage/"+path, nil)
		req.SetPathValue("path", path)
		rec := httptest.NewRecorder()
		router.storage(rec, req)
		return rec
	}
	if rec := serve(pubRel); rec.Code != http.StatusOK {
		t.Fatalf("storage public = %d", rec.Code)
	}
	if rec := serve("vault/hB-missing.pdf"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("storage private anon = %d, want 401", rec.Code)
	}
	if rec := serve("project_assets/hB-missing.jpg"); rec.Code != http.StatusNotFound {
		t.Fatalf("storage missing = %d, want 404", rec.Code)
	}
	if rec := serve("project_assets/../../escape"); rec.Code != http.StatusNotFound {
		t.Fatalf("storage traversal = %d, want 404", rec.Code)
	}
	// Configured S3 signs locally (no network): GET, PUT, region
	// default and the vault signer's bucket preference. Last: the env
	// changes routing for the checks above.
	t.Setenv("S3_ENDPOINT", "https://hB-s3.test")
	t.Setenv("S3_BUCKET", "hB-bucket")
	t.Setenv("S3_ACCESS_KEY", "hB-key")
	t.Setenv("S3_SECRET_KEY", "hB-secret")
	if !s3Configured() {
		t.Fatal("s3 should be configured")
	}
	if url, ok := presignedS3Get(context.Background(), "vault/hB.pdf", time.Minute); !ok || !strings.Contains(url, "hB-bucket") {
		t.Fatalf("presigned get = %q %v", url, ok)
	}
	if url, ok := presignedS3Put(context.Background(), "vault/hB.pdf", "", time.Minute); !ok || !strings.Contains(url, "hB-bucket") {
		t.Fatalf("presigned put = %q %v", url, ok)
	}
	t.Setenv("S3_REGION", "hB-1")
	if url, ok := presignedS3Get(context.Background(), "vault/hB.pdf", time.Minute); !ok || url == "" {
		t.Fatal("presigned get with region")
	}
	// With S3 configured the vault signer prefers the bucket; the local
	// fallback above already covered the unconfigured path.
	if got := storageSignedURLFor(context.Background(), "vault/hB.pdf"); !strings.Contains(got, "hB-bucket") {
		t.Fatalf("signedURLFor s3 = %v", got)
	}
}
