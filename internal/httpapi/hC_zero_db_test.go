package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestHCZeroPureHelpers(t *testing.T) {
	// truncateRunes — literals
	if got := truncateRunes("abc", 5); got != "abc" {
		t.Fatalf("truncate short = %q", got)
	}
	if got := truncateRunes("abcdef", 3); got != "abc" {
		t.Fatalf("truncate long = %q", got)
	}
	// multibyte: 3 runes, cap 2
	if got := truncateRunes("héllo", 2); got != "hé" {
		t.Fatalf("truncate mb = %q", got)
	}

	// evidenceContentType — literals
	if got := evidenceContentType("pdf"); got != "application/pdf" {
		t.Fatalf("ctype pdf = %q", got)
	}
	if got := evidenceContentType("PDF"); got != "application/pdf" {
		t.Fatalf("ctype PDF = %q", got)
	}
	if got := evidenceContentType("webp"); got != "image/webp" {
		t.Fatalf("ctype webp = %q", got)
	}
	if got := evidenceContentType("jpg"); got != "image/jpeg" {
		t.Fatalf("ctype jpg = %q", got)
	}
	if got := evidenceContentType("JPEG"); got != "image/jpeg" {
		t.Fatalf("ctype jpeg = %q", got)
	}
	if got := evidenceContentType("png"); got != "image/png" && got != "application/octet-stream" {
		t.Fatalf("ctype png = %q", got)
	}
	// png is NOT in the match: default octet-stream (mirrors service match)
	if got := evidenceContentType("png"); got != "application/octet-stream" {
		t.Fatalf("ctype png want octet-stream, got %q", got)
	}
	if got := evidenceContentType("exe"); got != "application/octet-stream" {
		t.Fatalf("ctype default = %q", got)
	}

	// evidenceBaseDir — env override + default
	t.Setenv("EVIDENCE_DIR", "/tmp/hC-ev")
	if got := evidenceBaseDir(); got != "/tmp/hC-ev" {
		t.Fatalf("basedir env = %q", got)
	}
	os.Unsetenv("EVIDENCE_DIR")
	if got := evidenceBaseDir(); got == "" || got == "/tmp/hC-ev" {
		t.Fatalf("basedir default = %q", got)
	}

	// firmFloatOf — literals
	if got := firmFloatOf("12.5"); got != 12.5 {
		t.Fatalf("firmFloat str = %v", got)
	}
	if got := firmFloatOf(int32(3)); got != 3 {
		t.Fatalf("firmFloat int32 = %v", got)
	}
	if got := firmFloatOf(nil); got != 0 {
		t.Fatalf("firmFloat nil = %v", got)
	}
	if got := firmFloatOf("abc"); got != 0 {
		t.Fatalf("firmFloat bad = %v", got)
	}

	// firmIntOf — literals
	if got := firmIntOf(int64(7)); got != 7 {
		t.Fatalf("firmInt i64 = %d", got)
	}
	if got := firmIntOf(int32(8)); got != 8 {
		t.Fatalf("firmInt i32 = %d", got)
	}
	if got := firmIntOf(int16(9)); got != 9 {
		t.Fatalf("firmInt i16 = %d", got)
	}
	if got := firmIntOf(10); got != 10 {
		t.Fatalf("firmInt int = %d", got)
	}
	if got := firmIntOf(" 42 "); got != 42 {
		t.Fatalf("firmInt str = %d", got)
	}
	if got := firmIntOf("abc"); got != 0 {
		t.Fatalf("firmInt bad = %d", got)
	}
	if got := firmIntOf(nil); got != 0 {
		t.Fatalf("firmInt nil = %d", got)
	}
	if got := firmIntOf(float64(9.9)); got != 9 {
		t.Fatalf("firmInt float = %d", got)
	}

	// firmPhone — literals
	if got := firmPhone(nil); got != nil {
		t.Fatalf("firmPhone nil = %v", got)
	}
	ph := firmPhone(map[string]any{"no_telp": "081"})
	if ph == nil || *ph != "081" {
		t.Fatalf("firmPhone telp = %v", ph)
	}
	ph = firmPhone(map[string]any{"no_telepon": "082"})
	if ph == nil || *ph != "082" {
		t.Fatalf("firmPhone telepon = %v", ph)
	}
	if got := firmPhone(map[string]any{}); got != nil {
		t.Fatalf("firmPhone empty = %v", got)
	}

	// firmVerification / Deskripsi / Lokasi / EntityType — literals
	if got := firmVerification(nil); got != "unverified" {
		t.Fatalf("firmVer nil = %v", got)
	}
	if got := firmVerification(map[string]any{"verification_status": "pending"}); got != "pending" {
		t.Fatalf("firmVer = %v", got)
	}
	// non-string status falls through to unverified (literal)
	if got := firmVerification(map[string]any{"verification_status": 123}); got != "unverified" {
		t.Fatalf("firmVer non-string = %v", got)
	}
	if got := firmDeskripsi(nil); got != "" {
		t.Fatalf("firmDes nil = %v", got)
	}
	if got := firmDeskripsi(map[string]any{"deskripsi": "hC D"}); got != "hC D" {
		t.Fatalf("firmDes = %v", got)
	}
	// non-string deskripsi falls through to "" (literal)
	if got := firmDeskripsi(map[string]any{"deskripsi": 123}); got != "" {
		t.Fatalf("firmDes non-string = %v", got)
	}
	if got := firmLokasi(nil); got != "" {
		t.Fatalf("firmLok nil = %v", got)
	}
	if got := firmLokasi(map[string]any{"lokasi": "hC Lok"}); got != "hC Lok" {
		t.Fatalf("firmLok = %v", got)
	}
	if got := firmLokasi(map[string]any{"alamat": "hC Alm"}); got != "hC Alm" {
		t.Fatalf("firmLok alamat = %v", got)
	}
	// empty map falls through to "" (literal)
	if got := firmLokasi(map[string]any{}); got != "" {
		t.Fatalf("firmLok empty = %v", got)
	}
	if got := firmEntityType(nil); got != "individual" {
		t.Fatalf("firmEnt nil = %v", got)
	}
	if got := firmEntityType(map[string]any{"entity_type": "company"}); got != "company" {
		t.Fatalf("firmEnt = %v", got)
	}
	// blank entity_type falls through to individual (literal)
	if got := firmEntityType(map[string]any{"entity_type": ""}); got != "individual" {
		t.Fatalf("firmEnt blank = %v", got)
	}
	// non-string entity_type falls through to individual (literal)
	if got := firmEntityType(map[string]any{"entity_type": 123}); got != "individual" {
		t.Fatalf("firmEnt non-string = %v", got)
	}

	// firmBoolFilter — PHP filter_var BOOLEAN literals
	if !firmBoolFilter(true) || firmBoolFilter(false) {
		t.Fatalf("firmBool bool")
	}
	if !firmBoolFilter("1") || !firmBoolFilter("true") || !firmBoolFilter("on") || !firmBoolFilter("yes") {
		t.Fatalf("firmBool truthy strings")
	}
	if firmBoolFilter("no") || firmBoolFilter("0") {
		t.Fatalf("firmBool falsy strings")
	}
	if !firmBoolFilter(float64(2)) || firmBoolFilter(float64(0)) {
		t.Fatalf("firmBool float")
	}
	if !firmBoolFilter(int64(1)) || firmBoolFilter(int64(0)) {
		t.Fatalf("firmBool int")
	}
	if firmBoolFilter(nil) {
		t.Fatalf("firmBool nil")
	}

	// hireMatches — literals (all seven roles + miss paths)
	viewer := &projectViewer{id: 1, role: "arsitek", profiles: map[string]int64{"arsitek": 42}}
	cols := map[string]any{"selected_arsitek_id": int64(42)}
	if !hireMatches(viewer, cols, "arsitek") {
		t.Fatalf("hire match true")
	}
	colsMiss := map[string]any{"selected_arsitek_id": int64(43)}
	if hireMatches(viewer, colsMiss, "arsitek") {
		t.Fatalf("hire match false")
	}
	if hireMatches(viewer, cols, "kontraktor") {
		t.Fatalf("hire wrong role")
	}
	viewerOther := &projectViewer{id: 1, role: "user", profiles: map[string]int64{}}
	if hireMatches(viewerOther, cols, "arsitek") {
		t.Fatalf("hire role mismatch")
	}
	// every other role true path (literals): viewer hired on that slot
	roleCols := map[string]string{
		"kontraktor": "selected_kontraktor_id", "notaris": "selected_notaris_id",
		"interior": "selected_interior_id", "project_manager": "pm_id",
		"structural": "structural_id", "mep": "mep_id",
	}
	for role, col := range roleCols {
		v := &projectViewer{id: 7, role: role, profiles: map[string]int64{role: 99}}
		if !hireMatches(v, map[string]any{col: int64(99)}, role) {
			t.Fatalf("hire %s true", role)
		}
		if hireMatches(v, map[string]any{col: int64(100)}, role) {
			t.Fatalf("hire %s false", role)
		}
	}
	// unknown role + missing profile paths
	if hireMatches(viewer, cols, "bogus") {
		t.Fatalf("hire bogus role")
	}
	vNoProf := &projectViewer{id: 1, role: "arsitek", profiles: map[string]int64{}}
	if hireMatches(vNoProf, cols, "arsitek") {
		t.Fatalf("hire no profile")
	}
	if hireMatches(vNoProf, map[string]any{}, "arsitek") {
		t.Fatalf("hire no column")
	}

	// hasValue / fieldText — literals
	if !hasValue(map[string]any{"k": "v"}, "k") {
		t.Fatalf("hasValue true")
	}
	if hasValue(map[string]any{"k": "  "}, "k") {
		t.Fatalf("hasValue blank")
	}
	if hasValue(map[string]any{}, "k") {
		t.Fatalf("hasValue missing")
	}
	if hasValue(map[string]any{"k": nil}, "k") {
		t.Fatalf("hasValue nil")
	}
	if txt, ok := fieldText(map[string]any{"k": "hC"}, "k"); !ok || txt != "hC" {
		t.Fatalf("fieldText = %q %v", txt, ok)
	}
	if _, ok := fieldText(map[string]any{"k": 123}, "k"); ok {
		t.Fatalf("fieldText non-string")
	}
	if _, ok := fieldText(map[string]any{}, "k"); ok {
		t.Fatalf("fieldText missing")
	}
	if _, ok := fieldText(map[string]any{"k": nil}, "k"); ok {
		t.Fatalf("fieldText nil")
	}

	// numberFromText — literals (disputesuser helper)
	if got := numberFromText("2500"); got != int64(2500) {
		t.Fatalf("number int = %v", got)
	}
	if got := numberFromText("12.5"); got != 12.5 {
		t.Fatalf("number float = %v", got)
	}
	if got := numberFromText("abc"); got != nil {
		t.Fatalf("number bad = %v", got)
	}

	// errPaymentNotFound message — literal
	e := &errPaymentNotFound{"termin", "5"}
	if got := e.Error(); got != "payment not found: termin #5" {
		t.Fatalf("err msg = %q", got)
	}
	// errPaymentInvalid message — literal (dead on the act path: resolvePaymentTarget
	// never returns it; pinned here so the type's message cannot drift)
	ei := &errPaymentInvalid{"hC-short"}
	if got := ei.Error(); got != "Invalid payment type: hC-short" {
		t.Fatalf("err invalid msg = %q", got)
	}

	// storage pure: isPublicStoragePath, storageSignedURLFor fallback
	if !isPublicStoragePath("avatars/x.jpg") {
		t.Fatalf("public avatars")
	}
	if isPublicStoragePath("disputes/1/x.pdf") {
		t.Fatalf("private disputes")
	}
	// storageSignedURLFor without S3 falls back to local signed URL (literals)
	os.Unsetenv("S3_ENDPOINT")
	os.Unsetenv("S3_BUCKET")
	os.Unsetenv("S3_ACCESS_KEY")
	os.Unsetenv("S3_SECRET_KEY")
	url := storageSignedURLFor(context.Background(), "disputes/1/hC.pdf")
	if url == "" || !contains(url, "/storage/disputes/1/hC.pdf") {
		t.Fatalf("signedFor = %q", url)
	}
	// presigned without S3 -> ok=false (needs live S3 for true; documented unreachable)
	if _, ok := presignedS3Get(context.Background(), "k", 0); ok {
		t.Fatalf("presignedGet without S3")
	}
	if _, ok := presignedS3Put(context.Background(), "k", "text/plain", 0); ok {
		t.Fatalf("presignedPut without S3")
	}
}

func TestHCZeroDBHelpers(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// disputePaymentShort branches: nil, known, unknown key
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)
	if _, ok := disputePaymentShort(ctx, tx, nil); ok {
		t.Fatalf("payShort nil")
	}
	var termTypeID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key='payment_termin'`).Scan(&termTypeID)
	if short, ok := disputePaymentShort(ctx, tx, &termTypeID); !ok || short != "termin" {
		t.Fatalf("payShort termin = %q %v", short, ok)
	}
	var mqTypeID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key='material_quote'`).Scan(&mqTypeID)
	if short, ok := disputePaymentShort(ctx, tx, &mqTypeID); !ok || short != "material_quote" {
		t.Fatalf("payShort unknown = %q %v", short, ok)
	}
	badID := int64(98989899)
	if _, ok := disputePaymentShort(ctx, tx, &badID); ok {
		t.Fatalf("payShort bad id")
	}
	tx.Rollback(ctx)

	// ledgerSums on empty project: paid 0, refunded 0 (literals)
	owner := hCMkUser(t, ctx, pool, "zeroown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hCMkProject(t, ctx, pool, owner, "hC Zero Ledger")
	defer hCCleanupProject(t, ctx, pool, pid, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
	tx2, _ := pool.Begin(ctx)
	paid, ref, err := ledgerSums(ctx, tx2, pid, 8, 1)
	tx2.Rollback(ctx)
	if err != nil || paid != 0 || ref != 0 {
		t.Fatalf("ledgerSums empty = %d %d %v", paid, ref, err)
	}

	// bidderDisplayName invalid role -> "" (no DB touch)
	tx3, _ := pool.Begin(ctx)
	if got := bidderDisplayName(ctx, tx3, "bogus-short", 1, owner); got != "" {
		t.Fatalf("bidder bad short = %q", got)
	}
	tx3.Rollback(ctx)

	// notifyDisputeRecipients dead-wrapper coverage: direct call fans out without failing
	notifyDisputeRecipients(ctx, pool, pid, 1, "hC T", "hC D", "hC Sender", owner)

	// scheduler edge jobs: idempotent sweeps on empty data (literals: no rows touched, nil error)
	if err := AutoCompleteOrders(ctx, pool, nil); err != nil {
		t.Fatalf("auto complete: %v", err)
	}
	if err := EscalateOverdueSnags(ctx, pool, nil); err != nil {
		t.Fatalf("escalate: %v", err)
	}
	if err := PruneExpired(ctx, pool, nil); err != nil {
		t.Fatalf("prune: %v", err)
	}

	// storage handler edge: NUL byte path -> 404 (dead alternate path)
	r := httptest.NewRequest(http.MethodGet, "/storage/a", nil)
	r.SetPathValue("path", "a\x00b")
	rec := httptest.NewRecorder()
	(&Router{}).storage(rec, r)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("storage nul = %d", rec.Code)
	}
	_ = http.StatusOK
}
