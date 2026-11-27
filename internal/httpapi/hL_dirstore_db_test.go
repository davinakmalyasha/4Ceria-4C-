package httpapi

// hL directory + storage + participation leftovers: bundle-nil row
// rendering, table edge maps, private serve gates, S3-signed resolve,
// and error twins for the loaders.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
)

func TestHLDirectoryRowBundleNil(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)

	// A verified arsitek profile renders through the per-row path when no
	// bundle is passed: project count and the user block.
	if _, err := pool.Exec(ctx, `UPDATE arsiteks SET verification_status='verified' WHERE id=$1`, hLArsitekProfileID); err != nil {
		t.Fatalf("verify arsitek: %v", err)
	}
	cols := directoryColumns("arsiteks")
	rows, err := pool.Query(ctx, `SELECT `+cols+` FROM arsiteks WHERE id=$1`, hLArsitekProfileID)
	if err != nil {
		t.Fatalf("load profile: %v", err)
	}
	fields := fieldNames(rows)
	if !rows.Next() {
		rows.Close()
		t.Fatalf("no profile row")
	}
	values, err := scanRow(rows, len(fields))
	rows.Close()
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	entry, err := directoryRow(ctx, pool, "arsiteks", fields, values, false, nil)
	if err != nil {
		t.Fatalf("directoryRow: %v", err)
	}
	if count, _ := entry.Get("projects_count"); count != int64(1) {
		t.Fatalf("projects_count = %v, want 1", count)
	}
	if name, _ := entry.Get("nama"); name != "hL Arsitek" {
		t.Fatalf("nama = %v", name)
	}
	user, _ := entry.Get("user")
	if user == nil {
		t.Fatalf("user block missing")
	}
	// Notaris table with bundle=nil takes the per-row services leg.
	if _, err := pool.Exec(ctx, `UPDATE notaris_profiles SET verification_status='verified' WHERE id=$1`, hLNotarisProfileID); err != nil {
		t.Fatalf("verify notaris: %v", err)
	}
	ncols := directoryColumns("notaris_profiles")
	nrows, err := pool.Query(ctx, `SELECT `+ncols+` FROM notaris_profiles WHERE id=$1`, hLNotarisProfileID)
	if err != nil {
		t.Fatalf("load notaris: %v", err)
	}
	nfields := fieldNames(nrows)
	nrows.Next()
	nvalues, err := scanRow(nrows, len(nfields))
	nrows.Close()
	if err != nil {
		t.Fatalf("scan notaris: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO notaris_services (notaris_id, title, price) VALUES ($1,'hL Svc',1000)`, hLNotarisProfileID); err != nil {
		t.Fatalf("seed service: %v", err)
	}
	nentry, err := directoryRow(ctx, pool, "notaris_profiles", nfields, nvalues, true, nil)
	if err != nil {
		t.Fatalf("notaris row: %v", err)
	}
	svcs, _ := nentry.Get("services")
	if list, ok := svcs.([]any); !ok || len(list) != 1 {
		t.Fatalf("notaris services = %v", svcs)
	}
	// directoryUser on a missing user surfaces the no-rows error (the
	// owner-render error leg callers pin to 404).
	if _, err := directoryUser(ctx, pool, 19999996); err == nil {
		t.Fatalf("directoryUser missing ok, want error")
	}
	// Unknown table: no project column, no services, empty service slice.
	if col, ok := projectColumnForProfile("wizard_profiles"); ok || col != "" {
		t.Fatalf("wizard column = %q %v", col, ok)
	}
	if out, err := directoryServices(ctx, pool, "arsiteks", hLArsitekProfileID); err != nil || len(out) != 0 {
		t.Fatalf("non-notaris services = %v %v", out, err)
	}
	if got := phoneNumberOf(map[string]any{}); got != nil {
		t.Fatalf("phoneNumberOf empty = %v", got)
	}
	// intOf legs: int32 and int spellings resolve like int64.
	intRow, err := directoryRow(ctx, pool, "arsiteks",
		[]string{"id", "user_id", "verification_status"},
		[]any{int32(1031001), int(fx.arsitek.id), "verified"}, false,
		&directoryBundle{projectCounts: map[int64]int64{}, users: map[int64]*jsonwire.Object{}, services: map[int64][]any{}})
	if err != nil {
		t.Fatalf("int row: %v", err)
	}
	if id, _ := intRow.Get("id"); id != int64(1031001) {
		t.Fatalf("int32 id = %v", id)
	}
	if uid, _ := intRow.Get("user_id"); uid != fx.arsitek.id {
		t.Fatalf("int user = %v", uid)
	}
	// company fallback: only company_name present mirrors to both keys.
	coRow, err := directoryRow(ctx, pool, "arsiteks",
		[]string{"id", "company_name"},
		[]any{int64(1031001), "hL Solo"}, false, nil)
	if err != nil {
		t.Fatalf("company row: %v", err)
	}
	if both, _ := coRow.Get("nama_perusahaan"); both != "hL Solo" {
		t.Fatalf("nama_perusahaan mirror = %v", both)
	}
	// Hand-built rows pin the remaining value legs: a float id misses
	// intOf, koefisien/category/phone_number render, and an empty
	// services bundle entry becomes [] instead of null.
	miscRow, err := directoryRow(ctx, pool, "kontraktors",
		[]string{"id", "koefisien", "category", "phone_number"},
		[]any{float64(1.5), "hL-k", "hL-cat", "081"}, true,
		&directoryBundle{projectCounts: map[int64]int64{}, users: map[int64]*jsonwire.Object{}, services: map[int64][]any{}})
	if err != nil {
		t.Fatalf("misc row: %v", err)
	}
	if id, _ := miscRow.Get("id"); id != int64(0) {
		t.Fatalf("float id = %v, want 0", id)
	}
	if koef, _ := miscRow.Get("koefisien"); koef != "hL-k" {
		t.Fatalf("koefisien = %v", koef)
	}
	if cat, _ := miscRow.Get("category"); cat != "hL-cat" {
		t.Fatalf("category = %v", cat)
	}
	if phone, _ := miscRow.Get("phone_number"); phone != "081" {
		t.Fatalf("row phone = %v", phone)
	}
	if svcs, _ := miscRow.Get("services"); svcs == nil {
		t.Fatalf("services nil, want []")
	} else if list, ok := svcs.([]any); !ok || len(list) != 0 {
		t.Fatalf("services = %v", svcs)
	}
	// Closed-pool twins for the per-row fallbacks.
	closed := testPool(t)
	closed.Close()
	prow, err := directoryRow(ctx, closed, "notaris_profiles",
		[]string{"id", "user_id"}, []any{int64(1), int64(2)}, true, nil)
	if err == nil || prow != nil {
		t.Fatalf("notaris row closed = %v %v", prow, err)
	}
	urow, err := directoryRow(ctx, closed, "arsiteks",
		[]string{"id", "user_id"}, []any{int64(1), fx.arsitek.id}, false, nil)
	if err == nil || urow != nil {
		t.Fatalf("user row closed = %v %v", urow, err)
	}
	if _, err := directoryServices(ctx, closed, "notaris_profiles", 1); err == nil {
		t.Fatalf("services closed ok")
	}
}

func TestHLDirectoryPure(t *testing.T) {
	// pageFrom/pageTo are nil on an empty page (post-state literals).
	if pageFrom(10, 24, 1, 0) != nil {
		t.Fatalf("pageFrom empty")
	}
	if pageTo(10, 24, 1, 0) != nil {
		t.Fatalf("pageTo empty")
	}
	if pageFrom(10, 24, 2, 3) != 25 {
		t.Fatalf("pageFrom = %v", pageFrom(10, 24, 2, 3))
	}
	if pageTo(10, 24, 2, 3) != 27 {
		t.Fatalf("pageTo = %v", pageTo(10, 24, 2, 3))
	}
	// lastPage floors at one even for nonsense input.
	if lastPage(0, 0) != 1 || lastPage(0, -5) != 1 {
		t.Fatalf("lastPage zero")
	}
	// basePathOf strips the query.
	if basePathOf("https://hL.test/x?a=1") != "https://hL.test/x" {
		t.Fatalf("basePathOf")
	}
}

func TestHLStorageServePrivate(t *testing.T) {
	pubDir := t.TempDir()
	evDir := t.TempDir()
	t.Setenv("PUBLIC_STORAGE_ROOT", pubDir)
	t.Setenv("EVIDENCE_DIR", evDir)
	t.Setenv("APP_KEY", "hL-test-key")

	// Private file, authenticated caller: attachment disposition + private
	// cache (the rejection twin of the signed public-cache path).
	rel := "disputes/1032/hL-private.pdf"
	full, err := safeStorageJoin(evDir, rel)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	want := []byte("%PDF hL private")
	if err := os.WriteFile(full, want, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	okAuth := hLStaticAuth{caller: &roadmapCaller{id: 1030001, role: "user"}}
	r := httptest.NewRequest(http.MethodGet, "/storage/"+rel, nil)
	r.SetPathValue("path", rel)
	rec := httptest.NewRecorder()
	(&Router{gates: Gates{Auth: okAuth}}).storage(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("private authed = %d %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != string(want) {
		t.Fatalf("private bytes mismatch")
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "private, no-store" {
		t.Fatalf("private cache = %q", cc)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment;") {
		t.Fatalf("private disposition = %q", cd)
	}

	// No auth configured on a private path: 401 pin.
	r2 := httptest.NewRequest(http.MethodGet, "/storage/"+rel, nil)
	r2.SetPathValue("path", rel)
	rec2 := httptest.NewRecorder()
	(&Router{}).storage(rec2, r2)
	if rec2.Code != http.StatusUnauthorized {
		t.Fatalf("private noauth = %d", rec2.Code)
	}
	// Failing authenticator: 401 pin too.
	failAuth := hLFailAuth{}
	r3 := httptest.NewRequest(http.MethodGet, "/storage/"+rel, nil)
	r3.SetPathValue("path", rel)
	rec3 := httptest.NewRecorder()
	(&Router{gates: Gates{Auth: failAuth}}).storage(rec3, r3)
	if rec3.Code != http.StatusUnauthorized {
		t.Fatalf("private failauth = %d", rec3.Code)
	}
	// Directory path (not a file): 404 pin.
	dirRel := "disputes/1032"
	r4 := httptest.NewRequest(http.MethodGet, "/storage/"+dirRel, nil)
	r4.SetPathValue("path", dirRel)
	rec4 := httptest.NewRecorder()
	(&Router{gates: Gates{Auth: okAuth}}).storage(rec4, r4)
	if rec4.Code != http.StatusNotFound {
		t.Fatalf("private dir = %d", rec4.Code)
	}

	// resolveStorageURL: an absolute URL embedding /storage/ strips to the
	// relative path (the 141-143 leg), then renders through the asset
	// base because avatars/ is a public prefix.
	stripped := resolveStorageURL(context.Background(), "https://cdn.test/storage/avatars/hL.png")
	sURL, ok := stripped.(string)
	if !ok || !strings.HasSuffix(sURL, "/storage/avatars/hL.png") {
		t.Fatalf("resolve storage absolute = %v", stripped)
	}
	// Storage key without APP_KEY: random fallback signs and verifies.
	os.Unsetenv("APP_KEY")
	sig := signStorageURL("disputes/1/hL.pdf", 9999999999)
	if !verifyStorageURL("disputes/1/hL.pdf", 9999999999, sig) {
		t.Fatalf("hL fallback key verify failed")
	}
	t.Setenv("APP_KEY", "hL-test-key")

	// S3-configured resolve: private path presigns locally, no network.
	t.Setenv("S3_ENDPOINT", "https://hL-s3.example.test")
	t.Setenv("S3_BUCKET", "hL-bucket")
	t.Setenv("S3_ACCESS_KEY", "hL-key")
	t.Setenv("S3_SECRET_KEY", "hL-secret")
	got := resolveStorageURL(context.Background(), "disputes/1/hL.pdf")
	url, ok := got.(string)
	if !ok || !strings.Contains(url, "hL-bucket") {
		t.Fatalf("s3 resolve = %v", got)
	}
}

type hLStaticAuth struct {
	caller Caller
}

func (a hLStaticAuth) Authenticate(r *http.Request) (Caller, error) {
	return a.caller, nil
}

type hLFailAuth struct{}

func (hLFailAuth) Authenticate(r *http.Request) (Caller, error) {
	return nil, errHLAuth
}

var errHLAuth = errHLAuthNew()

func errHLAuthNew() error {
	return context.DeadlineExceeded
}

func TestHLParticipationTwins(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)

	// loadSubject on a ghost user errors (the gateError 404 leg callers pin).
	if _, err := loadSubject(ctx, pool, hLGhostID); err == nil {
		t.Fatalf("ghost subject ok, want error")
	}
	// loadProjectParties on a missing project errors.
	if _, err := loadProjectParties(ctx, pool, 19999996); err == nil {
		t.Fatalf("missing parties ok, want error")
	}
	// isAdminUser: role admin short-circuits true without a query.
	isAdmin, err := isAdminUser(ctx, pool, fx.stranger.id, "admin")
	if err != nil || !isAdmin {
		t.Fatalf("role admin = %v %v", isAdmin, err)
	}
	// Spatie-only admin reads true; plain user false.
	if _, err := pool.Exec(ctx, `INSERT INTO model_has_roles (role_id, model_type, model_id)
		SELECT id, 'App\Models\User', $1 FROM roles WHERE name='admin'`, fx.stranger.id); err != nil {
		t.Fatalf("spatie grant: %v", err)
	}
	isAdmin, err = isAdminUser(ctx, pool, fx.stranger.id, "user")
	if err != nil || !isAdmin {
		t.Fatalf("spatie admin = %v %v", isAdmin, err)
	}
	isAdmin, err = isAdminUser(ctx, pool, fx.supplier.id, "supplier")
	if err != nil || isAdmin {
		t.Fatalf("plain supplier admin = %v %v", isAdmin, err)
	}
	// Closed-pool twins: every loader surfaces the failure.
	closed := testPool(t)
	closed.Close()
	if _, err := loadSubject(ctx, closed, fx.owner.id); err == nil {
		t.Fatalf("subject closed ok, want error")
	}
	if _, err := loadProjectParties(ctx, closed, fx.projectID); err == nil {
		t.Fatalf("parties closed ok, want error")
	}
	if _, err := isAdminUser(ctx, closed, fx.owner.id, "user"); err == nil {
		t.Fatalf("admin check closed ok, want error")
	}
}
